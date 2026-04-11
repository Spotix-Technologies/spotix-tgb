import { bot } from '../bot';
import { db } from '../../firebase';
import { getLoadingMessage } from '../../services/loading';

/**
 * /withdraw command — fully inline-button-driven payout flow
 *
 * Step 1: /withdraw              → one message per event, each with a "Withdraw" button
 * Step 2: event button clicked   → shows transaction dates, each with a "Withdraw" button
 * Step 3: date button clicked    → runs all validations, shows confirm summary with button
 * Step 4: confirm button clicked → submits payout to Fastify
 *
 * callback_data encoding:
 *   wd_event:<eventId>                     — user selected an event
 *   wd_date:<eventId>:<date>:<amount>      — user selected a date
 *   wd_confirm:<eventId>:<date>:<amount>   — user confirmed payout
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatMoney(amount: any): string {
  return `₦${Number(amount ?? 0).toLocaleString('en-NG')}`;
}

async function resolveUser(chatId: string) {
  const snap = await db
    .collection('users')
    .where('telegram.chatId', '==', chatId)
    .where('telegram.connected', '==', true)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return { userId: snap.docs[0].id };
}

async function checkGlobalSwitch() {
  const snap = await db.collection('admin').doc('global').get();
  if (!snap.exists) return null;
  const global = snap.data()!;
  if (global.isPayoutAllowed === false) {
    return global.isPayoutNotAllowedReason
      ? `⚠️ We are currently not processing payouts. Reason: ${global.isPayoutNotAllowedReason}`
      : `⚠️ We are currently not processing payouts, check back later.`;
  }
  return null;
}

export function registerWithdrawCommand() {

  // ── Step 1: /withdraw — send one message per event with inline button ──────
  bot.command('withdraw', async (ctx) => {
    const chatId = String(ctx.chat.id);
    await ctx.reply(getLoadingMessage());

    try {
      const user = await resolveUser(chatId);
      if (!user) return ctx.reply(`Link your Spotix account first using /connect.`);

      const blocked = await checkGlobalSwitch();
      if (blocked) return ctx.reply(blocked);

      const eventsSnap = await db
        .collection('events')
        .where('organizerId', '==', user.userId)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();

      if (eventsSnap.empty) {
        return ctx.reply(`You don't have any events yet. Head to Spotix to create one.`);
      }

      await ctx.reply(`<b>💸 Withdraw — Select an Event</b>\n\nTap the button on an event to see its payout dates.`, {
        parse_mode: 'HTML',
      });

      // Send one message per event with its own inline button
      for (const doc of eventsSnap.docs) {
        const event = doc.data();
        const status = event.status || 'active';
        const emoji = status === 'active' ? '🟢' : '🔴';
        const revenue = event.totalRevenue != null ? formatMoney(event.totalRevenue) : 'N/A';
        const paidOut = event.totalPaidOut != null ? formatMoney(event.totalPaidOut) : 'N/A';

        await ctx.reply(
          `${emoji} <b>${event.eventName || 'Unnamed Event'}</b>\n` +
          `💰 Revenue: ${revenue} | 💸 Paid Out: ${paidOut}`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[
                { text: '💸 Withdraw', callback_data: `wd_event:${doc.id}` },
              ]],
            },
          }
        );
      }
    } catch (err) {
      console.error('[/withdraw] Error:', err);
      return ctx.reply(`Something went wrong. Please try again.`);
    }
  });

  // ── Step 2: event selected — show transaction dates with inline buttons ────
  bot.action(/^wd_event:(.+)$/, async (ctx) => {
    const eventId = ctx.match[1];
    const chatId = String(ctx.chat?.id);

    await ctx.answerCbQuery();
    await ctx.reply(getLoadingMessage());

    try {
      const user = await resolveUser(chatId);
      if (!user) return ctx.reply(`Link your Spotix account first using /connect.`);

      const blocked = await checkGlobalSwitch();
      if (blocked) return ctx.reply(blocked);

      const eventDoc = await db.collection('events').doc(eventId).get();
      if (!eventDoc.exists) return ctx.reply(`❌ Event not found.`);
      const event = eventDoc.data()!;

      if (event.organizerId !== user.userId) return ctx.reply(`❌ You don't own that event.`);
      if (event.flagged === true) {
        return ctx.reply(`🚩 This event has been flagged. Please contact customer support for more information.`);
      }

      const txnSnap = await db
        .collection('admin')
        .doc('events')
        .collection(eventId)
        .get();

      if (txnSnap.empty) {
        return ctx.reply(`No transaction records found for <b>${event.eventName}</b>.`, { parse_mode: 'HTML' });
      }

      const payoutsSnap = await db
        .collection('payouts')
        .where('eventId', '==', eventId)
        .where('userId', '==', user.userId)
        .get();

      const payoutsByDate = new Map<string, string>();
      payoutsSnap.docs.forEach((doc) => {
        payoutsByDate.set(doc.data().date, doc.data().status);
      });

      const now = Date.now();
      const sorted = txnSnap.docs.sort((a, b) => a.id.localeCompare(b.id));

      await ctx.reply(
        `<b>💸 ${event.eventName} — Transaction Dates</b>\n\nTap a date to withdraw from it.`,
        { parse_mode: 'HTML' }
      );

      for (const doc of sorted) {
        const date = doc.id;
        const data = doc.data();
        const amount = data.totalRevenue ?? data.amount ?? 0;

        const updatedAt = data.updatedAt ? new Date(data.updatedAt) : new Date(`${date}T00:00:00`);
        const diffHours = (now - updatedAt.getTime()) / (1000 * 60 * 60);
        const isReady = diffHours >= 30;
        const remainingMs = updatedAt.getTime() + 30 * 60 * 60 * 1000 - now;
        const h = Math.floor(remainingMs / (1000 * 60 * 60));
        const m = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

        const existingStatus = payoutsByDate.get(date);

        let statusLine = '';
        let button: { text: string; callback_data: string } | null = null;

        if (existingStatus) {
          const statusEmoji: Record<string, string> = {
            pending: '⏳', processing: '🔄', success: '✅', failed: '❌', reversed: '↩️',
          };
          statusLine = `${statusEmoji[existingStatus] || '•'} Payout ${existingStatus}`;
          if (existingStatus === 'failed') {
            button = { text: '🔁 Retry', callback_data: `wd_date:${eventId}:${date}:${amount}` };
          }
        } else if (!isReady) {
          statusLine = `⏱ Available in ${h}h ${m}m`;
        } else {
          statusLine = `✅ Ready to withdraw`;
          button = { text: '💸 Withdraw', callback_data: `wd_date:${eventId}:${date}:${amount}` };
        }

        await ctx.reply(
          `📅 <b>${date}</b> — ${formatMoney(amount)}\n${statusLine}`,
          {
            parse_mode: 'HTML',
            reply_markup: button
              ? { inline_keyboard: [[button]] }
              : undefined,
          }
        );
      }
    } catch (err) {
      console.error('[wd_event] Error:', err);
      return ctx.reply(`Something went wrong. Please try again.`);
    }
  });

  // ── Step 3: date selected — validate and show confirm button ──────────────
  bot.action(/^wd_date:([^:]+):([^:]+):([^:]+)$/, async (ctx) => {
    const [eventId, date, amountStr] = [ctx.match[1], ctx.match[2], ctx.match[3]];
    const amount = Number(amountStr);
    const chatId = String(ctx.chat?.id);

    await ctx.answerCbQuery();
    await ctx.reply(getLoadingMessage());

    try {
      const user = await resolveUser(chatId);
      if (!user) return ctx.reply(`Link your Spotix account first using /connect.`);

      const blocked = await checkGlobalSwitch();
      if (blocked) return ctx.reply(blocked);

      const eventDoc = await db.collection('events').doc(eventId).get();
      if (!eventDoc.exists) return ctx.reply(`❌ Event not found.`);
      const event = eventDoc.data()!;
      if (event.organizerId !== user.userId) return ctx.reply(`❌ You don't own that event.`);
      if (event.flagged === true) {
        return ctx.reply(`🚩 This event has been flagged. Please contact customer support.`);
      }

      const salesDoc = await db
        .collection('admin').doc('events').collection(eventId).doc(date).get();
      if (!salesDoc.exists) return ctx.reply(`❌ No transaction record found for ${date}.`);
      const salesData = salesDoc.data()!;

      // 30-hour rule
      const updatedAt = salesData.updatedAt
        ? new Date(salesData.updatedAt)
        : new Date(`${date}T00:00:00`);
      const diffHours = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60);
      if (diffHours < 30) {
        const remainingMs = updatedAt.getTime() + 30 * 60 * 60 * 1000 - Date.now();
        const h = Math.floor(remainingMs / (1000 * 60 * 60));
        const m = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
        return ctx.reply(
          `⏱ Withdrawal not yet available.\n\nAvailable in <b>${h}h ${m}m</b> (30 hours after last purchase on this date).`,
          { parse_mode: 'HTML' }
        );
      }

      // Restricted specific date
      const restrictedDateSnap = await db
        .collection('admin').doc('global').collection('restrictedDate').doc(date).get();
      if (restrictedDateSnap.exists && restrictedDateSnap.data()!.isRestricted === true) {
        return ctx.reply(`🚫 ${restrictedDateSnap.data()!.reason ?? `Payouts for ${date} are currently restricted.`}`);
      }

      // Restricted day of week
      const txnDayOfWeek = DAYS[new Date(`${date}T12:00:00`).getDay()];
      const restrictedDaySnap = await db
        .collection('admin').doc('global').collection('restrictedDays').doc(txnDayOfWeek).get();
      if (restrictedDaySnap.exists && restrictedDaySnap.data()!.isRestricted === true) {
        return ctx.reply(`🚫 ${restrictedDaySnap.data()!.reason ?? `Payouts for ${txnDayOfWeek}s are currently restricted.`}`);
      }

      // Primary payout method
      const methodsSnap = await db
        .collection('payoutMethods').doc(user.userId).collection('methods')
        .where('primary', '==', true).limit(1).get();
      if (methodsSnap.empty) {
        return ctx.reply(
          `⚠️ No primary payout method found.\n\nGo to <b>Spotix → Settings → Payout Methods</b> to add and set a primary bank account.`,
          { parse_mode: 'HTML' }
        );
      }

      const primaryMethod = methodsSnap.docs[0].data();

      // Duplicate guard
      const existingPayout = await db
        .collection('payouts')
        .where('eventId', '==', eventId)
        .where('date', '==', date)
        .where('userId', '==', user.userId)
        .limit(1).get();
      if (!existingPayout.empty) {
        return ctx.reply(`⚠️ A payout request for <b>${date}</b> has already been submitted.`, { parse_mode: 'HTML' });
      }

      const maskedAccount = primaryMethod.accountNumber
        ? `****${String(primaryMethod.accountNumber).slice(-4)}`
        : 'on file';

      return ctx.reply(
        `<b>💸 Confirm Withdrawal</b>\n\n` +
        `<b>Event:</b> ${event.eventName}\n` +
        `<b>Date:</b> ${date}\n` +
        `<b>Amount:</b> ${formatMoney(amount)}\n` +
        `<b>To:</b> ${primaryMethod.bankName || 'Bank'} — ${maskedAccount} (${primaryMethod.accountName || ''})`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Confirm & Withdraw', callback_data: `wd_confirm:${eventId}:${date}:${amount}` },
            ]],
          },
        }
      );
    } catch (err) {
      console.error('[wd_date] Error:', err);
      return ctx.reply(`Something went wrong. Please try again.`);
    }
  });

  // ── Step 4: confirmed — submit payout ─────────────────────────────────────
  bot.action(/^wd_confirm:([^:]+):([^:]+):([^:]+)$/, async (ctx) => {
    const [eventId, date, amountStr] = [ctx.match[1], ctx.match[2], ctx.match[3]];
    const amount = Number(amountStr);
    const chatId = String(ctx.chat?.id);

    await ctx.answerCbQuery();
    await ctx.reply(getLoadingMessage());

    try {
      const user = await resolveUser(chatId);
      if (!user) return ctx.reply(`Link your Spotix account first using /connect.`);

      const apiUrl = process.env.SERVER_URL;
      const response = await fetch(`${apiUrl}/payouts/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.userId, eventId, date, amount }),
      });

      if (!response.ok) {
        const body = await response.json() as { error?: string; message?: string };
        return ctx.reply(`❌ ${body.error || body.message || 'Withdrawal failed. Please try again.'}`);
      }

      return ctx.reply(
        `✅ <b>Withdrawal submitted!</b>\n\nI'll notify you here as soon as the status updates.`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[wd_confirm] Error:', err);
      return ctx.reply(`Something went wrong. Please try again.`);
    }
  });
}
