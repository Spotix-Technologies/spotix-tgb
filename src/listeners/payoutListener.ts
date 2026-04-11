import { db } from '../firebase';
import { sendMessage } from '../telegram/notify';

// In-memory cache of last known payout status per payoutId.
// Wiped on server restart but re-seeded from Firestore snapshot replay.
const payoutStatusCache = new Map<string, string>();

/**
 * Listens on the flat payouts/{payoutId} collection.
 * On 'modified', checks if the status field actually changed by diffing
 * against an in-memory cache. If it did, fetches the event name and notifies
 * the organizer via Telegram with full context (eventName + txnDate).
 *
 * On 'added', seeds the cache so we have a baseline for future comparisons.
 */
export function startPayoutListener(): void {
  console.log('[PayoutListener] Started');

  db.collection('payouts').onSnapshot(
    (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        const payout = change.doc.data();
        const payoutId = change.doc.id;

        if (change.type === 'added') {
          // Seed the cache — no notification on initial load
          payoutStatusCache.set(payoutId, payout.status);
          return;
        }

        if (change.type === 'modified') {
          const previousStatus = payoutStatusCache.get(payoutId);

          // Only act if status genuinely changed
          if (!previousStatus || previousStatus === payout.status) {
            payoutStatusCache.set(payoutId, payout.status);
            return;
          }

          // Update cache immediately before async work
          payoutStatusCache.set(payoutId, payout.status);

          try {
            await handlePayoutStatusChange(payoutId, payout);
          } catch (err) {
            console.error('[PayoutListener] handlePayoutStatusChange error:', err);
          }
        }
      });
    },
    (err) => {
      console.error('[PayoutListener] Snapshot error:', err);
    }
  );
}

async function handlePayoutStatusChange(
  payoutId: string,
  payout: FirebaseFirestore.DocumentData
) {
  // Don't notify for 'pending' or unknown statuses
  const notifiableStatuses = ['processing', 'success', 'failed', 'reversed'];
  if (!notifiableStatuses.includes(payout.status)) return;

  // Fetch organizer
  const organizerDoc = await db.collection('users').doc(payout.userId).get();
  if (!organizerDoc.exists) return;
  const organizer = organizerDoc.data()!;

  const chatId: string | undefined = organizer?.telegram?.chatId;
  const isConnected: boolean = organizer?.telegram?.connected === true;
  if (!chatId || !isConnected) return;

  // Fetch event name from events/{eventId}
  let eventName = 'your event';
  if (payout.eventId) {
    try {
      const eventDoc = await db.collection('events').doc(payout.eventId).get();
      if (eventDoc.exists) {
        eventName = eventDoc.data()!.eventName || eventName;
      }
    } catch (err) {
      console.error('[PayoutListener] Failed to fetch event name:', err);
    }
  }

  const txnDate: string = payout.date || 'unknown date';
  const message = buildStatusMessage(payout.status, eventName, txnDate);

  await sendMessage(chatId, message);
}

function buildStatusMessage(status: string, eventName: string, txnDate: string): string {
  switch (status) {
    case 'processing':
      return (
        `⏳ <b>Payout Update</b>\n\n` +
        `Your payout for <b>${eventName}</b> on <b>${txnDate}</b> is now being processed. Hang tight!`
      );
    case 'success':
      return (
        `✅ <b>Payout Successful!</b>\n\n` +
        `Your payout for <b>${eventName}</b> on <b>${txnDate}</b> has been completed. Check your bank account!`
      );
    case 'failed':
      return (
        `❌ <b>Payout Failed</b>\n\n` +
        `Your payout for <b>${eventName}</b> on <b>${txnDate}</b> could not be completed. ` +
        `Please log in to Spotix or contact support to retry.`
      );
    case 'reversed':
      return (
        `↩️ <b>Payout Reversed</b>\n\n` +
        `Your payout for <b>${eventName}</b> on <b>${txnDate}</b> was reversed. ` +
        `Please contact support for details.`
      );
    default:
      return '';
  }
}
