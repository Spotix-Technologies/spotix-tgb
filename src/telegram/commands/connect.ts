import { bot } from '../bot';
import { db } from '../../firebase';
import { FieldValue } from 'firebase-admin/firestore';
import { getLoadingMessage } from '../../services/loading';

/**
 * /connect <token>
 *
 * Flow:
 * 1. User pastes their Spotix-generated token after /connect
 * 2. We look up telegramTokens/{token} in Firestore
 * 3. If valid and not expired, we fetch users/{userId} for their fullName
 * 4. We save chatId, telegramUsername, and connected=true onto the user doc
 * 5. We delete the token doc so it can't be reused
 */
export function registerConnectCommand() {
  // Handle: /connect <token>
  bot.command('connect', async (ctx) => {
    const parts = ctx.message.text.trim().split(/\s+/);
    const token = parts[1];

    if (!token) {
      return ctx.reply(
        `Please paste your token right after the command, like this:\n\n` +
        `<code>/connect YOUR_TOKEN_HERE</code>`,
        { parse_mode: 'HTML' }
      );
    }

    await ctx.reply(getLoadingMessage());

    try {
      // 1. Look up the token
      const tokenRef = db.collection('telegramTokens').doc(token);
      const tokenDoc = await tokenRef.get();

      if (!tokenDoc.exists) {
        return ctx.reply(
          `❌ That token doesn't look right. Please go back to Spotix, generate a new one, and try again.`
        );
      }

      const tokenData = tokenDoc.data()!;

      // 2. Check expiry
      const expiresAt: FirebaseFirestore.Timestamp = tokenData.expiresAt;
      if (expiresAt && expiresAt.toDate() < new Date()) {
        await tokenRef.delete();
        return ctx.reply(
          `⏰ That token has expired. Please go back to Spotix and generate a fresh one.`
        );
      }

      const userId: string = tokenData.userId;

      // 3. Fetch the user's full name
      const userRef = db.collection('users').doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        return ctx.reply(`❌ We couldn't find your Spotix account. Please contact support.`);
      }

      const userData = userDoc.data()!;
      const fullName: string = userData.fullName || 'there';

      const chatId = String(ctx.chat.id);
      const telegramUsername = ctx.from.username || null;

      // 4. Save chatId, telegramUsername, and connected flag to user doc
      await userRef.update({
        'telegram.chatId': chatId,
        'telegram.telegramUsername': telegramUsername,
        'telegram.connected': true,
        'telegram.linkedAt': FieldValue.serverTimestamp(),
      });

      // 5. Delete the token so it can't be reused
      await tokenRef.delete();

      return ctx.reply(
        `Ah, nice to meet you <b>${fullName}</b> 👋\n\n` +
        `Your Spotix account is now linked. Click /help so you'll know how to talk to me.`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[/connect] Error:', err);
      return ctx.reply(`Something went wrong on our end. Please try again in a moment.`);
    }
  });
}
