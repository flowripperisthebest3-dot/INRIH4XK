// Baileys needs a global `crypto` (built into Node 20+, missing on Node 18)
const { webcrypto } = require('crypto');
if (!globalThis.crypto) globalThis.crypto = webcrypto;

require('./src/logs'); // capture console output for the admin panel
const config = require('./src/config');
const store = require('./src/store');
store.load();
const sessions = require('./src/sessions');
const { createServer } = require('./src/server');

createServer().listen(config.port, () => console.log(`[web] ${config.botName} listening on ${config.port}`));
if (!config.adminKey) console.warn('[warn] ADMIN_KEY is not set: the admin panel is disabled.');

sessions.boot()
  .then(async () => {
    if (config.autoPair && config.pairingNumber) {
      try {
        const r = await sessions.requestPairing(config.pairingNumber, { admin: true });
        console.log(`\n=== PAIRING CODE for ${config.pairingNumber}: ${r.code} ===\n`);
      } catch (e) { console.log('[autopair]', e.message); }
    }
  })
  .catch((e) => console.error('[boot] failed:', e));

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));
