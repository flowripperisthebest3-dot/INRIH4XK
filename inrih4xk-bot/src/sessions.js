// Session manager: one Baileys socket per linked WhatsApp number.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pino = require('pino');
const {
  default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion,
  Browsers, makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const config = require('./config');
const store = require('./store');
const { AntiBan } = require('./antiban');
const { onMessages } = require('./handler');
const { cachedMeta } = require('./group');
const { sleep, rand, httpError, SimpleCache } = require('./utils');

const root = path.join(config.sessionDir, 'sessions');
const sessions = new Map();
let waVersion;
const dirOf = (id) => path.join(root, id);
const isNumber = (n) => /^\d{8,15}$/.test(n);

function createSession(id) {
  const settings = store.session(id);
  const s = {
    id, sock: null, status: 'starting', paired: false, stopped: false, retries: 0, gen: 0,
    createdAt: settings.createdAt || Date.now(), connectedAt: null, user: null,
    token: null, gotQr: false, qrWaiter: null, pairTimer: null,
    antiban: new AntiBan(config.antiban), settings, groupCache: new Map(), voCache: new Map(),
  };
  Object.defineProperty(s, 'ownerIds', {
    get: () => [...new Set([id, ...(config.ownerIds.includes(id) ? config.ownerIds : [])])],
  });
  sessions.set(id, s);
  return s;
}

async function startSocket(s) {
  fs.mkdirSync(dirOf(s.id), { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(dirOf(s.id));
  if (!waVersion) waVersion = (await fetchLatestBaileysVersion().catch(() => ({}))).version;
  const logger = pino({ level: process.env.LOG_LEVEL || 'silent' });

  s.paired = !!(state.creds.registered || state.creds.account);
  s.gotQr = false;
  s.status = s.paired ? 'connecting' : 'pairing';

  const sock = makeWASocket({
    version: waVersion, logger,
    browser: Browsers.ubuntu('Chrome'),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    // Needed so WhatsApp can ask us to re-send a message; without it recipients see
    // "Waiting for this message. This may take a while."
    getMessage: async (key) => s.antiban.getSent(key.id),
    cachedGroupMetadata: async (jid) => cachedMeta(s, jid),
    msgRetryCounterCache: new SimpleCache(),
  });
  s.sock = sock;
  s.gen++;

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('groups.update', (arr) => arr.forEach((g) => s.groupCache.delete(g.id)));
  sock.ev.on('group-participants.update', (u) => s.groupCache.delete(u.id));
  sock.ev.on('messages.upsert', (m) => onMessages(s, m));

  sock.ev.on('connection.update', (u) => {
    if (s.sock !== sock) return;
    const { connection, lastDisconnect, qr } = u;
    if (qr) { s.gotQr = true; if (s.qrWaiter) s.qrWaiter(); }
    if (connection === 'open') {
      s.status = 'open'; s.paired = true; s.retries = 0;
      s.connectedAt = Date.now(); s.user = sock.user?.id || null;
      clearTimeout(s.pairTimer); s.pairTimer = null;
      console.log(`[${s.id}] connected`);
    }
    if (connection === 'close') handleClose(s, lastDisconnect?.error?.output?.statusCode);
  });

  // Unpaired sessions (abandoned pairing attempts) clean themselves up.
  if (!s.paired && !s.pairTimer) {
    s.pairTimer = setTimeout(() => { if (sessions.get(s.id) === s && s.status !== 'open') destroy(s.id).catch(() => {}); }, config.pairTimeoutMs);
  }
}

function handleClose(s, code) {
  if (s.stopped) return;
  s.connectedAt = null;
  if (code === DisconnectReason.loggedOut) {
    console.log(`[${s.id}] unlinked from the phone, removing session`);
    destroy(s.id).catch(() => {});
    return;
  }
  if (code === DisconnectReason.connectionReplaced) {
    s.status = 'replaced'; s.stopped = true;
    console.log(`[${s.id}] session opened elsewhere, not reconnecting`);
    return;
  }
  s.status = s.paired ? 'reconnecting' : 'pairing';
  const delay = code === DisconnectReason.restartRequired ? 500 : Math.min(60000, 2000 * 2 ** s.retries++);
  console.log(`[${s.id}] closed (${code}), reconnecting in ${Math.round(delay / 1000)}s`);
  setTimeout(() => {
    if (!s.stopped && sessions.get(s.id) === s) startSocket(s).catch((e) => console.error(`[${s.id}] restart failed:`, e.message));
  }, delay);
}

async function destroy(id, { logout = false } = {}) {
  const s = sessions.get(id);
  if (s) {
    s.stopped = true;
    clearTimeout(s.pairTimer);
    try { if (logout && s.sock) await s.sock.logout(); } catch {}
    try { s.sock?.end(undefined); } catch {}
    sessions.delete(id);
  }
  fs.rmSync(dirOf(id), { recursive: true, force: true });
  store.removeSession(id);
}

async function stop(id) {
  const s = get(id);
  s.stopped = true;
  try { s.sock?.end(undefined); } catch {}
  s.status = 'stopped'; s.connectedAt = null;
}

async function start(id) {
  const s = get(id);
  if (!s.stopped && s.status === 'open') return;
  s.stopped = false; s.retries = 0;
  await startSocket(s);
}

async function requestPairing(number, { admin = false } = {}) {
  if (!isNumber(number)) throw httpError(400, 'Enter your full number with country code, digits only (8-15 digits).');
  const g = store.global;
  if (!admin) {
    if (!g.pairingOpen) throw httpError(403, 'Linking is currently closed.');
    if (g.blocked.includes(number)) throw httpError(403, 'This number cannot be linked.');
  }
  let s = sessions.get(number);
  // Never touch an already-linked session, otherwise anyone could wipe someone else's login.
  if (s && s.paired) throw httpError(409, 'This number is already linked to the bot.');
  if (!s && sessions.size >= g.maxSessions) throw httpError(503, 'The bot is full right now. Try again later.');
  if (s) await destroy(number);

  s = createSession(number);
  await startSocket(s);
  if (!s.gotQr) await new Promise((r) => { const t = setTimeout(r, 7000); s.qrWaiter = () => { clearTimeout(t); r(); }; });
  if (s.sock.authState.creds.registered) throw httpError(409, 'This number is already linked to the bot.');

  let code;
  try {
    code = await s.sock.requestPairingCode(number);
  } catch (e) {
    await destroy(number);
    throw httpError(502, 'WhatsApp did not return a code. Check the number and try again.');
  }
  s.status = 'pairing';
  s.token = crypto.randomBytes(16).toString('hex');
  return { code: code.replace(/-/g, '').match(/.{1,4}/g).join('-'), token: s.token, expiresInSec: Math.round(config.pairTimeoutMs / 1000) };
}

function statusByToken(token) {
  if (!token) return { state: 'expired' };
  for (const s of sessions.values()) {
    if (s.token && s.token === token) return { state: s.status === 'open' ? 'connected' : 'waiting' };
  }
  return { state: 'expired' };
}

function get(id) {
  const s = sessions.get(id);
  if (!s) throw httpError(404, 'Session not found');
  return s;
}

function getOpen(id) {
  const s = get(id);
  if (s.status !== 'open') throw httpError(409, 'That number is not connected right now.');
  return s;
}

const pub = (s) => ({
  id: s.id, status: s.status, paired: s.paired, createdAt: s.createdAt,
  connectedAt: s.connectedAt, user: s.user, mode: s.settings.mode, stats: s.antiban.stats(),
});
const list = () => [...sessions.values()].map(pub);

async function sendText(id, to, text) {
  const s = getOpen(id);
  const jid = to.includes('@') ? to : `${to.replace(/\D/g, '')}@s.whatsapp.net`;
  return s.antiban.send(s.sock, jid, { text });
}

// Move a login created by the single-number version into the new layout (keeps you logged in).
function migrateLegacy() {
  const creds = path.join(config.sessionDir, 'creds.json');
  if (!fs.existsSync(creds)) return;
  try {
    const c = JSON.parse(fs.readFileSync(creds, 'utf8'));
    const num = String(c.me?.id || '').split('@')[0].split(':')[0];
    if (!isNumber(num)) return;
    const dest = dirOf(num);
    fs.mkdirSync(dest, { recursive: true });
    for (const f of fs.readdirSync(config.sessionDir)) {
      if (f === 'sessions') continue;
      fs.renameSync(path.join(config.sessionDir, f), path.join(dest, f));
    }
    if (store.legacy) { Object.assign(store.session(num), store.legacy); store.clearLegacy(); store.save(); }
    console.log(`[migrate] moved existing login for ${num}`);
  } catch (e) {
    console.error('[migrate] failed:', e.message);
  }
}

async function boot() {
  fs.mkdirSync(root, { recursive: true });
  migrateLegacy();
  for (const id of fs.readdirSync(root)) {
    if (!isNumber(id) || !fs.statSync(dirOf(id)).isDirectory()) continue;
    if (!fs.existsSync(path.join(dirOf(id), 'creds.json'))) { fs.rmSync(dirOf(id), { recursive: true, force: true }); continue; }
    const s = createSession(id);
    startSocket(s).catch((e) => console.error(`[${id}] start failed:`, e.message));
    await sleep(rand(1500, 3000)); // stagger so many numbers don't connect at once
  }
  console.log(`[boot] ${sessions.size} session(s) loaded`);
}

module.exports = {
  boot, list, get, getOpen, requestPairing, statusByToken, sendText, destroy, stop, start,
  restart: async (id) => { await stop(id); await start(id); },
  logout: (id) => destroy(id, { logout: true }),
  count: () => sessions.size,
  connected: () => [...sessions.values()].filter((s) => s.status === 'open').length,
};
