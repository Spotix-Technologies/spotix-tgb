// src/telegram/notify.ts

import { bot } from './bot';

/**
 * Send a plain text message to a Telegram chat.
 * Used by both the attendee and payout listeners.
 */
export async function sendMessage(chatId: string, text: string): Promise<void> {
  try {
    await bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' });
  } catch (err) {
    console.error(`[TG] Failed to send message to chatId ${chatId}:`, err);
  }
}
