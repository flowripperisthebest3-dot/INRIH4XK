const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const bare = (jid) => String(jid || '').split('@')[0].split(':')[0];
const httpError = (status, message) => Object.assign(new Error(message), { status });

function fmtDuration(s) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return `${d}d ${h}h ${m}m ${sec}s`;
}

// Tiny TTL cache with the interface Baileys expects for retry counters.
class SimpleCache {
  constructor(ttlMs = 300000) { this.m = new Map(); this.ttl = ttlMs; }
  get(k) { const e = this.m.get(k); if (!e) return undefined; if (Date.now() > e.x) { this.m.delete(k); return undefined; } return e.v; }
  set(k, v) { this.m.set(k, { v, x: Date.now() + this.ttl }); if (this.m.size > 5000) this.m.delete(this.m.keys().next().value); }
  del(k) { this.m.delete(k); }
  flushAll() { this.m.clear(); }
}

module.exports = { sleep, rand, bare, httpError, fmtDuration, SimpleCache };
