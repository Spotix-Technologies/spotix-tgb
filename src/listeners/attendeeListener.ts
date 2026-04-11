import { db } from '../firebase';
import { sendMessage } from '../telegram/notify';

/**
 * Listens on the attendees collectionGroup across ALL events.
 * When a new attendee doc is added (ticket purchased), finds the event organizer's
 * Telegram chatId and sends them a randomised notification.
 *
 * The listenerStartTime guard prevents replaying all historical docs on server restart.
 */

interface NotificationTemplate {
  title: string;
  body: (
    username: string,
    attendeeName: string,
    ticketType: string,
    eventName: string,
    ticketPrice: string,
    ticketsSold: number
  ) => string;
}

const TEMPLATES: NotificationTemplate[] = [
  {
    title: '💰 Cha-Ching!',
    body: (u, a, t, e, p, s) =>
      `Hey <b>@${u}</b>, <b>${a}</b> just copped the <b>${t}</b> ticket to <b>${e}</b> for <b>${p}</b>. That's <b>${s}</b> ticket(s) sold so far — keep it going! 🚀`,
  },
  {
    title: '🐝 Buzz Buzz!',
    body: (u, a, t, e, p, s) =>
      `<b>@${u}</b>! <b>${a}</b> just grabbed a <b>${t}</b> spot at <b>${e}</b> for <b>${p}</b>. Your event is buzzing — <b>${s}</b> sold and counting! 🎉`,
  },
  {
    title: '🤑 Money Maaaan!',
    body: (u, a, t, e, p, s) =>
      `Ayyyy <b>@${u}</b>! <b>${a}</b> just paid <b>${p}</b> for a <b>${t}</b> at <b>${e}</b>. <b>${s}</b> tickets sold. The money is flowing! 💸`,
  },
  {
    title: '🌟 Famous Booker!',
    body: (u, a, t, e, p, s) =>
      `Word is spreading, <b>@${u}</b>! <b>${a}</b> just locked in a <b>${t}</b> at <b>${e}</b> for <b>${p}</b>. <b>${s}</b> people are ready to show up! 🙌`,
  },
  {
    title: '🔔 New Sale Alert!',
    body: (u, a, t, e, p, s) =>
      `<b>@${u}</b>, just in — <b>${a}</b> purchased a <b>${t}</b> ticket for <b>${e}</b> at <b>${p}</b>. Total sold: <b>${s}</b>. You're on a roll! 🎯`,
  },
  {
    title: '🎊 Another One!',
    body: (u, a, t, e, p, s) =>
      `DJ Khaled voice: ANOTHER ONE. <b>@${u}</b>, <b>${a}</b> just joined <b>${e}</b> with a <b>${t}</b> for <b>${p}</b>. <b>${s}</b> tickets sold! 🎵`,
  },
  {
    title: '🏆 Selling Out!',
    body: (u, a, t, e, p, s) =>
      `<b>@${u}</b> — <b>${a}</b> snagged a <b>${t}</b> for your event <b>${e}</b> at <b>${p}</b>. <b>${s}</b> down. Keep pushing! 💪`,
  },
  {
    title: '🎟️ Ticket Dropped!',
    body: (u, a, t, e, p, s) =>
      `Fresh sale for <b>@${u}</b>! <b>${a}</b> just got the <b>${t}</b> to <b>${e}</b> for <b>${p}</b>. You're at <b>${s}</b> ticket(s) sold now 🔥`,
  },
];

function pickTemplate(): NotificationTemplate {
  return TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
}

function formatPrice(price: any): string {
  const num = Number(price);
  if (isNaN(num)) return String(price || 'N/A');
  return `₦${num.toLocaleString('en-NG')}`;
}

export function startAttendeeListener(): void {
  const listenerStartTime = new Date();
  console.log('[AttendeeListener] Started at', listenerStartTime.toISOString());

  db.collectionGroup('attendees').onSnapshot(
    (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type !== 'added') return;

        const attendee = change.doc.data();

        // Ignore docs that existed before this server boot
        // createdAt may be a Firestore Timestamp or an ISO string — handle both
        const rawCreatedAt = attendee.createdAt;
        let createdAtDate: Date | null = null;
        if (rawCreatedAt) {
          if (typeof rawCreatedAt.toDate === 'function') {
            createdAtDate = rawCreatedAt.toDate();
          } else if (typeof rawCreatedAt === 'string') {
            createdAtDate = new Date(rawCreatedAt);
          }
        }
        if (!createdAtDate || createdAtDate < listenerStartTime) return;

        const eventId = change.doc.ref.parent.parent?.id;
        if (!eventId) return;

        try {
          await handleNewAttendee(eventId, attendee);
        } catch (err) {
          console.error('[AttendeeListener] handleNewAttendee error:', err);
        }
      });
    },
    (err) => {
      console.error('[AttendeeListener] Snapshot error:', err);
    }
  );
}

async function handleNewAttendee(eventId: string, attendee: FirebaseFirestore.DocumentData) {
  // 1. Fetch the event
  const eventDoc = await db.collection('events').doc(eventId).get();
  if (!eventDoc.exists) return;
  const event = eventDoc.data()!;

  // 2. Fetch the organizer
  const organizerDoc = await db.collection('users').doc(event.organizerId).get();
  if (!organizerDoc.exists) return;
  const organizer = organizerDoc.data()!;

  const chatId: string | undefined = organizer?.telegram?.chatId;
  const isConnected: boolean = organizer?.telegram?.connected === true;
  if (!chatId || !isConnected) return;

  const username: string = organizer.username || 'there';
  const attendeeName: string = attendee.fullName || 'Someone';
  const ticketType: string = attendee.ticketType || 'General';
  const eventName: string = event.eventName || 'your event';
  const ticketPrice: string = formatPrice(attendee.ticketPrice);
  const ticketsSold: number = event.ticketsSold ?? 0;

  // 3. Pick a random template and build the message
  const template = pickTemplate();
  const message =
    `<b>${template.title}</b>\n\n` +
    template.body(username, attendeeName, ticketType, eventName, ticketPrice, ticketsSold);

  await sendMessage(chatId, message);
}
