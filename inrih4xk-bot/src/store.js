const fs = require('fs');
const path = require('path');
const config = require('./config');

const file = path.join(config.dataDir, 'settings.json');
const sessionDefaults = () => ({ mode: 'public', prefix: '', banned: [], antilink: [] });
let data = { global: { pairingOpen: true, maxSessions: config.maxSessions, blocked: [], antiban: {} }, sessions: {}, legacy: null };
let timer;

function load() {
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (raw.global || raw.sessions) {
        data.global = { ...data.global, ...raw.global };
        data.sessions = raw.sessions || {};
        data.legacy = raw.legacy || null;
      } else if (raw.mode !== undefined) {
        data.legacy = { ...sessionDefaults(), ...raw }; // settings from the single-number version
      }
    }
  } catch (e) {
    console.error('[store] load failed:', e.message);
  }
  Object.assign(config.antiban, data.global.antiban || {});
}

function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      fs.mkdirSync(config.dataDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('[store] save failed:', e.message);
    }
  }, 400);
}

// Returns the live settings object for one number (mutate it, then call save()).
function session(id) {
  const o = (data.sessions[id] ||= { createdAt: Date.now() });
  const d = sessionDefaults();
  for (const k of Object.keys(d)) if (!(k in o)) o[k] = d[k];
  return o;
}

function removeSession(id) {
  delete data.sessions[id];
  save();
}

module.exports = {
  load, save, session, removeSession,
  get global() { return data.global; },
  get legacy() { return data.legacy; },
  clearLegacy() { data.legacy = null; save(); },
};
