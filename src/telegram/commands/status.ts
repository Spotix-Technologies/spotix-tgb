import { bot } from '../bot';
import { db } from '../../firebase';
import { getLoadingMessage } from '../../services/loading';

/**
 * /status command
 * Fetches all events where organizerId === the linked userId,
 * then returns a summary for each with correct field names.
 */
export function registerStatusCommand() {
  bot.command('status', async (ctx) => {
    const chatId = String(ctx.chat.id);

    await ctx.reply(getLoadingMessage());

    try {
      // Find the user linked to this chatId
      const usersSnap = await db
        .collection('users')
        .where('telegram.chatId', '==', chatId)
        .where('telegram.connected', '==', true)
        .limit(1)
        .get();

      if (usersSnap.empty) {
        return ctx.reply(
          `You haven't linked your Spotix account yet. Use /connect to get started.`
        );
      }

      const userId = usersSnap.docs[0].id;

      // Fetch events for this organizer
      const eventsSnap = await db
        .collection('events')
        .where('organizerId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();

      if (eventsSnap.empty) {
        return ctx.reply(`You don't have any events yet. Head to Spotix to create one.`);
      }

      let message = `<b>Your Events 📋</b>\n\n`;

      for (const doc of eventsSnap.docs) {
        const event = doc.data();

        const ticketsSold = event.ticketsSold ?? 0;
        const status = event.status || 'active';
        const emoji = status === 'active' ? '🟢' : '🔴';
        const statusLabel = status === 'active' ? 'Active' : 'Inactive';

        const totalRevenue = event.totalRevenue != null
          ? `₦${Number(event.totalRevenue).toLocaleString('en-NG')}`
          : 'N/A';

        const totalPaidOut = event.totalPaidOut != null
          ? `₦${Number(event.totalPaidOut).toLocaleString('en-NG')}`
          : 'N/A';

        message +=
          `${emoji} <b>${event.eventName || 'Unnamed Event'}</b>\n` +
          `📅 Date: ${event.eventDate || 'TBD'}\n` +
          `🔖 Status: ${statusLabel}\n` +
          `🎟️ Tickets Sold: ${ticketsSold}\n` +
          `💰 Total Revenue: ${totalRevenue}\n` +
          `💸 Total Paid Out: ${totalPaidOut}\n\n`;
      }

      return ctx.reply(message, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[/status] Error:', err);
      return ctx.reply(`Something went wrong fetching your events. Try again in a moment.`);
    }
  });
}
