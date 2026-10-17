const path = require('path');
const crypto = require('crypto');
const express = require('express');
const config = require('./config');
const store = require('./store');
const sessions = require('./sessions');
const logs = require('./logs');
const { httpError, bare } = require('./utils');

function limiter(windowMs, max) {
  const hits = new Map();
  const clean = (k) => { const now = Date.now(); const a = (hits.get(k) || []).filter((t) => now - t < windowMs); hits.set(k, a); return a; };
  setInterval(() => { for (const k of hits.keys()) if (!clean(k).length) hits.delete(k); }, 600000).unref();
  return {
    hit: (k) => { const a = clean(k); if (a.length >= max) return false; a.push(Date.now()); return true; },
    full: (k) => clean(k).length >= max,
  };
}

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (e) {
    if (!e.status) console.error('[api]', e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' });
  }
};
const idOf = (req) => {
  const id = req.params.id;
  if (!/^\d{8,15}$/.test(id)) throw httpError(400, 'Bad number');
  return id;
};
const digitsList = (v) => (Array.isArray(v) ? v : []).map((x) => String(x).replace(/\D/g, '')).filter((x) => x.length >= 8 && x.length <= 15);

function createServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '20kb' }));
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
      'Cache-Control': req.path.startsWith('/api') ? 'no-store' : 'no-cache',
    });
    next();
  });

  // ---------- Public ----------
  app.get('/health', (req, res) => res.json({ ok: true, sessions: sessions.count(), connected: sessions.connected() }));

  app.get('/api/status', (req, res) => {
    const g = store.global;
    res.json({ botName: config.botName, open: g.pairingOpen && sessions.count() < g.maxSessions });
  });

  const ipLimit = limiter(3600000, 6);
  const numLimit = limiter(90000, 1);
  const numDay = limiter(86400000, 6);

  app.post('/api/pair', wrap(async (req, res) => {
    const number = String(req.body?.number || '').replace(/\D/g, '');
    if (!req.body?.consent) throw httpError(400, 'Please accept the notice first.');
    if (!/^\d{8,15}$/.test(number)) throw httpError(400, 'Enter your full number with country code, digits only (8-15 digits).');
    if (!ipLimit.hit(req.ip)) throw httpError(429, 'Too many attempts from your network. Try again later.');
    if (!numLimit.hit(number) || !numDay.hit(number)) throw httpError(429, 'A code was requested for this number recently. Wait a minute and try again.');
    res.json(await sessions.requestPairing(number));
  }));

  app.get('/api/pair/status', (req, res) => res.json(sessions.statusByToken(String(req.query.token || ''))));

  // ---------- Admin ----------
  const authFail = limiter(900000, 10);
  const admin = express.Router();
  admin.use((req, res, next) => {
    if (!config.adminKey) return res.status(403).json({ error: 'ADMIN_KEY is not set on the server.' });
    if (authFail.full(req.ip)) return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
    const ok = crypto.timingSafeEqual(sha(req.get('x-admin-key') || ''), sha(config.adminKey));
    if (!ok) { authFail.hit(req.ip); return res.status(401).json({ error: 'Wrong admin key.' }); }
    next();
  });

  admin.post('/login', (req, res) => res.json({ ok: true }));

  admin.get('/overview', (req, res) => {
    const g = store.global;
    res.json({
      botName: config.botName, uptime: process.uptime(), node: process.version,
      memMB: Math.round(process.memoryUsage().rss / 1048576),
      sessions: sessions.list(),
      global: { pairingOpen: g.pairingOpen, maxSessions: g.maxSessions, blocked: g.blocked, antiban: { ...config.antiban } },
    });
  });

  admin.post('/pair', wrap(async (req, res) => {
    const number = String(req.body?.number || '').replace(/\D/g, '');
    res.json(await sessions.requestPairing(number, { admin: true }));
  }));

  admin.get('/session/:id', wrap(async (req, res) => {
    const s = sessions.get(idOf(req));
    res.json({ id: s.id, status: s.status, settings: s.settings, stats: s.antiban.stats() });
  }));

  admin.post('/session/:id/settings', wrap(async (req, res) => {
    const s = sessions.get(idOf(req));
    const b = req.body || {};
    if (['public', 'self'].includes(b.mode)) s.settings.mode = b.mode;
    if (typeof b.prefix === 'string' && b.prefix.length <= 3) s.settings.prefix = b.prefix.trim();
    if (b.banned) s.settings.banned = digitsList(b.banned);
    if (b.antilink) s.settings.antilink = (Array.isArray(b.antilink) ? b.antilink : []).map(String).filter((j) => /^[\w-]+@g\.us$/.test(j));
    store.save();
    res.json({ ok: true, settings: s.settings });
  }));

  admin.post('/session/:id/send', wrap(async (req, res) => {
    const { to, text } = req.body || {};
    if (!to || !text || String(text).length > 4000) throw httpError(400, 'Recipient and text (max 4000 chars) are required.');
    await sessions.sendText(idOf(req), String(to), String(text));
    res.json({ ok: true });
  }));

  admin.get('/session/:id/groups', wrap(async (req, res) => {
    const s = sessions.getOpen(idOf(req));
    const all = await s.sock.groupFetchAllParticipating();
    res.json(Object.values(all).map((g) => ({ id: g.id, subject: g.subject, size: g.participants.length, announce: !!g.announce })));
  }));

  admin.get('/session/:id/group/:gid', wrap(async (req, res) => {
    const s = sessions.getOpen(idOf(req));
    const m = await s.sock.groupMetadata(req.params.gid);
    res.json({
      id: m.id, subject: m.subject, announce: !!m.announce,
      participants: m.participants.map((p) => ({ id: p.id, jid: p.jid || null, admin: p.admin || null })),
    });
  }));

  admin.post('/session/:id/group/:gid/:action', wrap(async (req, res) => {
    const s = sessions.getOpen(idOf(req));
    const { gid, action } = req.params;
    if (!/^[\w-]+@g\.us$/.test(gid)) throw httpError(400, 'Bad group id');
    if (action === 'mute') await s.sock.groupSettingUpdate(gid, 'announcement');
    else if (action === 'unmute') await s.sock.groupSettingUpdate(gid, 'not_announcement');
    else if (action === 'leave') await s.sock.groupLeave(gid);
    else if (action === 'link') return res.json({ link: `https://chat.whatsapp.com/${await s.sock.groupInviteCode(gid)}` });
    else if (['promote', 'demote', 'remove'].includes(action)) {
      const p = String(req.body?.participant || '');
      if (!p) throw httpError(400, 'participant required');
      const r = await s.sock.groupParticipantsUpdate(gid, [p], action);
      const st = String(r?.[0]?.status || '');
      if (st !== '200') throw httpError(400, `WhatsApp refused (status ${st}). The number must be a group admin.`);
    } else throw httpError(400, 'Unknown action');
    s.groupCache.delete(gid);
    res.json({ ok: true });
  }));

  admin.post('/session/:id/:action', wrap(async (req, res) => {
    const id = idOf(req);
    const a = req.params.action;
    if (a === 'restart') await sessions.restart(id);
    else if (a === 'stop') await sessions.stop(id);
    else if (a === 'start') await sessions.start(id);
    else if (a === 'logout') await sessions.logout(id);
    else if (a === 'delete') await sessions.destroy(id);
    else throw httpError(400, 'Unknown action');
    res.json({ ok: true });
  }));

  admin.post('/global', wrap(async (req, res) => {
    const b = req.body || {};
    const g = store.global;
    const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };
    if (typeof b.pairingOpen === 'boolean') g.pairingOpen = b.pairingOpen;
    if (b.maxSessions !== undefined) g.maxSessions = clamp(b.maxSessions, 1, 100, g.maxSessions);
    if (b.blocked) g.blocked = digitsList(b.blocked);
    if (b.antiban) {
      const a = b.antiban, c = config.antiban;
      c.minDelayMs = clamp(a.minDelayMs, 0, 60000, c.minDelayMs);
      c.maxDelayMs = Math.max(c.minDelayMs, clamp(a.maxDelayMs, 0, 60000, c.maxDelayMs));
      c.maxPerMinute = clamp(a.maxPerMinute, 1, 60, c.maxPerMinute);
      c.userCooldownMs = clamp(a.userCooldownMs, 0, 60000, c.userCooldownMs);
      g.antiban = { minDelayMs: c.minDelayMs, maxDelayMs: c.maxDelayMs, maxPerMinute: c.maxPerMinute, userCooldownMs: c.userCooldownMs };
    }
    store.save();
    res.json({ ok: true });
  }));

  admin.get('/logs', (req, res) => res.json(logs.get()));
  admin.post('/server/restart', (req, res) => {
    res.json({ ok: true });
    setTimeout(() => process.exit(1), 800); // non-zero exit so Railway/Render restart the service
  });

  app.use('/api/admin', admin);

  // Legacy helper: /pair?key=ADMIN_KEY&number=...
  app.get('/pair', wrap(async (req, res) => {
    if (!config.adminKey || sha(req.query.key || '').compare(sha(config.adminKey)) !== 0) throw httpError(403, 'forbidden');
    res.json(await sessions.requestPairing(String(req.query.number || '').replace(/\D/g, ''), { admin: true }));
  }));

  const pub = path.join(__dirname, '..', 'public');
  app.get('/admin', (req, res) => res.sendFile(path.join(pub, 'admin.html')));
  app.use(express.static(pub));
  return app;
}

module.exports = { createServer };
