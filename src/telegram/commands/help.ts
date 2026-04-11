import { bot } from '../bot';

/**
 * /help command
 * Shows all available commands with a footer and inline Scanner download button.
 */
export function registerHelpCommand() {
  bot.help((ctx) => {
    ctx.reply(
      `<b>Here's how to talk to me 🤖</b>\n\n` +
      `<b>/connect</b> <code>&lt;token&gt;</code> — Link your Spotix account\n` +
      `<b>/status</b> — View all your events and their stats\n` +
      `<b>/withdraw</b> — Start a payout, tap buttons to select event, date and confirm\n` +
      `<b>/report</b> — Send a report to the Spotix team\n` +
      `<b>/disconnect</b> — Unlink your Spotix account\n` +
      `<b>/help</b> — Show this message again\n\n` +
      `I'll also ping you automatically when:\n` +
      `🎟️ A new ticket is purchased on any of your events\n` +
      `💸 Your payout status changes\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📦 <b>Spotix Offline Scanner Tool</b>\n` +
      `Check guests in at your events without internet. The Scanner Tool works fully offline — scan QR codes, ticket IDs, or faces right from your laptop. Tap the button below to download.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `<i>Bot Version: 1.0</i>\n` +
      `<i>Developed and maintained by Spotix Technologies</i>`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '⬇️ Download Scanner Tool', url: 'https://booker.spotix.com.ng/downloads' },
          ]],
        },
      }
    );
  });
}
