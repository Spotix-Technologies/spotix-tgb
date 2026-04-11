# Spotix Telegram Bot

Real-time Telegram notifications and organizer controls for Spotix, running inside your existing Fastify (`spotix-api`) service.

---

## Features

| Feature | Description |
|---|---|
| `/start` | Greets the user by time of day and prompts account linking |
| `/connect <token>` | Links a Spotix organizer account to their Telegram |
| `/help` | Shows all available commands |
| `/status` | Lists the organizer's events with ticket counts |
| `/withdraw` | Initiates a payout via the existing Fastify payout endpoint |
| 🎟️ Auto-notify | Fires on every new ticket purchase for the organizer's events |
| 💸 Auto-notify | Fires when a payout status changes (processing / success / failed / reversed) |

---

## Project Structure

```
src/
├── firebase.ts                   # Firebase Admin SDK init
├── server.ts                     # Fastify entry point + webhook + listeners
├── listeners/
│   ├── attendeeListener.ts       # collectionGroup listener on events/{id}/attendees
│   └── payoutListener.ts         # collection listener on payouts/{id}
├── telegram/
│   ├── bot.ts                    # Telegraf bot instance
│   ├── notify.ts                 # sendMessage helper
│   ├── index.ts                  # Registers all commands
│   └── commands/
│       ├── start.ts              # /start
│       ├── connect.ts            # /connect <token>
│       ├── help.ts               # /help
│       ├── status.ts             # /status
│       └── withdraw.ts           # /withdraw + /confirmwithdraw
└── services/
    └── time.ts                   # Time-of-day helper (WAT-aware)
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env` and fill in:

```env
TELEGRAM_BOT_TOKEN=your_token_from_botfather
SERVER_URL=https://spotix-api.onrender.com
PORT=3000
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
```

> **FIREBASE_SERVICE_ACCOUNT**: Go to Firebase Console → Project Settings → Service Accounts → Generate new private key. Stringify the entire JSON and paste it as the value.

### 3. Create your Telegram bot

1. Open [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the prompts
3. Copy the token into `TELEGRAM_BOT_TOKEN`

### 4. Firestore: `telegramTokens` collection

When an organizer wants to connect their Telegram, your Spotix web app should:

1. Generate a short unique token (e.g. `crypto.randomUUID()`)
2. Write it to Firestore:

```ts
// On your Spotix web/API side
await db.collection('telegramTokens').doc(token).set({
  userId: currentUserId,
  expiresAt: Timestamp.fromDate(new Date(Date.now() + 15 * 60 * 1000)), // 15 min expiry
  createdAt: FieldValue.serverTimestamp(),
});
```

3. Show the organizer the token and a link: `https://t.me/YourBotUsername`
4. They open the bot, type `/connect <token>`

### 5. Firestore: `users/{userId}` fields written on connect

After `/connect` succeeds, the bot writes:

```ts
{
  telegram: {
    chatId: "123456789",          // Telegram chat ID (string)
    telegramUsername: "jerry",    // Telegram @username (nullable)
    connected: true,              // Boolean connectivity flag
    linkedAt: Timestamp,          // When they linked
  }
}
```

### 6. Run locally

```bash
npm run dev
```

### 7. Deploy to Render

This code is meant to be merged into your existing `spotix-api` Fastify repo. Copy the `src/listeners/` and `src/telegram/` folders in, add the env vars to Render, and call `startAttendeeListener()` and `startPayoutListener()` from your existing server entry point.

---

## Firestore Indexes Required

The `/status` command queries events by `organizerId`. Make sure this index exists:

```
Collection: events
Fields: organizerId ASC, createdAt DESC
```

The `/withdraw` command queries payouts by `userId + status`:

```
Collection: payouts
Fields: userId ASC, status ASC
```

Both of these should already exist per your existing Spotix architecture.

---

## Notes

- **Listener replay guard**: Both listeners use a `listenerStartTime` or in-memory cache to avoid processing historical data on server restart.
- **WAT timezone**: The time-of-day greeting uses UTC+1 (West Africa Time). Adjust in `src/services/time.ts` if needed.
- **Payout initiation**: `/withdraw` calls `POST /payouts/initiate` on your own Fastify server internally. Make sure that route exists and accepts `{ userId }`.
