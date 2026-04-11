import { bot } from '../bot';
import { db } from '../../firebase';
import { FieldValue } from 'firebase-admin/firestore';
import { getLoadingMessage } from '../../services/loading';

/**
 * /disconnect command
 * Shows a warning message with an inline confirm button.
 * On confirmation, clears telegram fields from the user doc.
 */
export function registerDisconnectCommand() {
  bot.command('disconnect', async (ctx) => {
    return ctx.reply(
      `You're going? 😔 What happened? Was it something I didn't do well?\n\n` +
      `Use /report to send a report or DM <a href="https://t.me/techKid26">@techKid26</a> for inquiries.\n\n` +
      `If this is your intended action, go ahead and hit the button below.`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🔌 Yes, disconnect me',
                callback_data: 'confirm_disconnect',
              },
            ],
          ],
        },
      }
    );
  });

  // Handle the inline button callback
  bot.action('confirm_disconnect', async (ctx) => {
    const chatId = String(ctx.chat?.id);

    await ctx.answerCbQuery();
    await ctx.reply(getLoadingMessage());

    try {
      const usersSnap = await db
        .collection('users')
        .where('telegram.chatId', '==', chatId)
        .where('telegram.connected', '==', true)
        .limit(1)
        .get();

      if (usersSnap.empty) {
        return ctx.reply(`It doesn't look like you're connected to anything. Nothing to disconnect!`);
      }

      const userRef = usersSnap.docs[0].ref;

      await userRef.update({
        'telegram.chatId': FieldValue.delete(),
        'telegram.telegramUsername': FieldValue.delete(),
        'telegram.connected': false,
        'telegram.linkedAt': FieldValue.delete(),
      });

      return ctx.reply(
        `You've been disconnected 👋\n\n` +
        `Your Spotix account is no longer linked to this bot. ` +
        `If you ever come back, you know where to find me — just use /connect.`
      );
    } catch (err) {
      console.error('[/disconnect] Error:', err);
      return ctx.reply(`Something went wrong. Please try again.`);
    }
  });
}
