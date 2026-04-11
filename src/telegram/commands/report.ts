import { bot } from '../bot';
import { db } from '../../firebase';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * /report command
 * Prompts the user to type a report. The next message they send
 * is captured and stored in botReports/{chatId}/reports (subcollection).
 *
 * Uses a simple in-memory Set to track which chatIds are
 * currently in "report mode" — awaiting their next message.
 */

const awaitingReport = new Set<string>();

export function registerReportCommand() {
  bot.command('report', async (ctx) => {
    const chatId = String(ctx.chat.id);
    awaitingReport.add(chatId);

    return ctx.reply(
      `Am I not functioning well? 🤔\n\n` +
      `Send a report to the Spotix team and they'll be in touch.\n\n` +
      `Just type your report in the next message and I'll send it right over 📝`
    );
  });

  // Intercept the next message from users in report mode
  bot.on('text', async (ctx, next) => {
    const chatId = String(ctx.chat.id);

    if (!awaitingReport.has(chatId)) {
      return next(); // Not in report mode — pass to other handlers
    }

    // Remove from report mode immediately so we don't capture further messages
    awaitingReport.delete(chatId);

    const reportText = ctx.message.text.trim();

    if (!reportText) {
      return ctx.reply(`That message was empty. Use /report again if you'd like to send a report.`);
    }

    try {
      await db
        .collection('botReports')
        .doc(chatId)
        .collection('reports')
        .add({
          chatId,
          telegramUsername: ctx.from.username || null,
          report: reportText,
          createdAt: FieldValue.serverTimestamp(),
        });

      return ctx.reply(
        `✅ Report sent! The Spotix team has received your message and will look into it.\n\n` +
        `You can also DM <a href="https://t.me/techKid26">@techKid26</a> directly for faster support.`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[/report] Error saving report:', err);
      return ctx.reply(`Something went wrong saving your report. Please try again or DM @techKid26 directly.`);
    }
  });
}
