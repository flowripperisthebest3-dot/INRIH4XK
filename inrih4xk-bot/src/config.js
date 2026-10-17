require('dotenv').config();

const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);
const digits = (v) => String(v || '').replace(/\D/g, '');

const ownerNumber = digits(process.env.OWNER_NUMBER);
const ownerLids = String(process.env.OWNER_LID || '').split(',').map(digits).filter(Boolean);

module.exports = {
  botName: process.env.BOT_NAME || 'INRIH4XK',
  prefix: process.env.PREFIX || '.',
  timezone: process.env.TIMEZONE || 'Africa/Lagos',
  ownerNumber,
  ownerIds: [ownerNumber, ...ownerLids].filter(Boolean),
  pairingNumber: digits(process.env.PAIRING_NUMBER) || ownerNumber,
  autoPair: process.env.AUTO_PAIR === 'true',
  adminKey: process.env.ADMIN_KEY || '',
  sessionDir: process.env.SESSION_DIR || './session',
  dataDir: process.env.DATA_DIR || './data',
  port: num(process.env.PORT, 3000),
  maxSessions: num(process.env.MAX_SESSIONS, 10),
  pairTimeoutMs: num(process.env.PAIR_TIMEOUT_SEC, 180) * 1000,
  vvPublic: process.env.VV_PUBLIC === 'true',
  vvSendTo: process.env.VV_SEND_TO === 'chat' ? 'chat' : 'self',
  antiban: {
    minDelayMs: num(process.env.MIN_DELAY_MS, 1500),
    maxDelayMs: num(process.env.MAX_DELAY_MS, 4000),
    maxPerMinute: num(process.env.MAX_MSGS_PER_MIN, 12),
    userCooldownMs: num(process.env.USER_COOLDOWN_MS, 3000),
    typingMsPerChar: 25,
    maxQueue: 40,
  },
};
