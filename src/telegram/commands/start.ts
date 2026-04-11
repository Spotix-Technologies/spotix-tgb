import { bot } from '../bot';
import { db } from '../../firebase';
import { getTimeOfDay } from '../../services/time';

/**
 * /start command
 * - If user is already connected: welcome back with their username
 * - If new: greet and prompt /connect
 */
export function registerStartCommand() {
  bot.start(async (ctx) => {
    const timeOfDay = getTimeOfDay();
    const chatId = String(ctx.chat.id);

    try {
      // Check if this chatId is already linked to a Spotix account
      const usersSnap = await db
        .collection('users')
        .where('telegram.chatId', '==', chatId)
        .where('telegram.connected', '==', true)
        .limit(1)
        .get();

      if (!usersSnap.empty) {
        const user = usersSnap.docs[0].data();
        const username = user.username || 'there';

        return ctx.reply(
          `Good ${timeOfDay} <b>@${username}</b>, welcome back 😊\n\n` +
          `What are we doing this ${timeOfDay}? Use /help to see what I can do for you.`,
          { parse_mode: 'HTML' }
        );
      }
    } catch (err) {
      console.error('[/start] DB check error:', err);
      // Fall through to new user greeting if DB check fails
    }

    // New user
    return ctx.reply(
      `Good ${timeOfDay}, welcome to <b>Spotix Booker Bot</b> 🎟️\n\n` +
      `Looks like you're new here, let's get to know ourselves.\n\n` +
      `I already said who I am — now you click /connect and paste in that key you copied from Spotix so I can know who you are too.`,
      { parse_mode: 'HTML' }
    );
  });
}
