/**
 * Rotating loading messages sent before a database fetch
 * so the user isn't left staring at silence.
 */
const LOADING_MESSAGES = [
  `Alright, I'll be just a moment ⏳`,
  `Uno momento... 🤌`,
  `I'll be right back with that info 🔍`,
  `Gimme a sec, pulling that up for you 📂`,
  `Hold on, let me check that real quick 👀`,
  `On it! Just a moment 🏃`,
  `Fetching that for you, won't be long ⚡`,
  `Let me dig that up... 🗂️`,
  `Two seconds, I promise 🕐`,
  `Loading your data, stay with me 🔄`,
];

export function getLoadingMessage(): string {
  return LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
}
