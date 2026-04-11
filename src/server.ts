import dotenv from 'dotenv';
dotenv.config();

import Fastify from 'fastify';
import { bot } from './telegram/bot';
import { registerAllCommands } from './telegram/index';
import { startAttendeeListener } from './listeners/attendeeListener';
import { startPayoutListener } from './listeners/payoutListener';

// Firebase must be initialized before any db usage
import './firebase';

const app = Fastify({ logger: true });

const PORT = Number(process.env.PORT) || 3000;
const SERVER_URL = process.env.SERVER_URL || '';
const WEBHOOK_PATH = '/telegram/webhook';

async function bootstrap() {
  // 1. Register all bot commands (start, connect, help, status, withdraw)
  registerAllCommands();

  // 2. Mount the Telegram webhook route on Fastify.
  //    Telegram POSTs here whenever a user messages the bot.
  //    bot.handleUpdate() is Telegraf's native update handler — no express adapter needed.
  app.post(WEBHOOK_PATH, async (req, reply) => {
    await bot.handleUpdate(req.body as any);
    reply.status(200).send('ok');
  });

  // 3. Health check endpoint (used by Better Uptime / Render)
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // 4. Start Fastify
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`[Server] Fastify listening on port ${PORT}`);

  // 5. Register the webhook URL with Telegram once at boot
  if (SERVER_URL) {
    await bot.telegram.setWebhook(`${SERVER_URL}${WEBHOOK_PATH}`);
    console.log(`[Telegram] Webhook registered: ${SERVER_URL}${WEBHOOK_PATH}`);
  } else {
    console.warn('[Telegram] SERVER_URL not set — webhook not registered. Set it in your .env');
  }

  // 6. Start Firestore real-time listeners
  startAttendeeListener();
  startPayoutListener();

  console.log('[Spotix Bot] All systems live ✅');
}

bootstrap().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
