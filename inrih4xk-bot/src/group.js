const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const { bare } = require('./utils');

const TTL = 60000;
const norm = (j) => (j ? jidNormalizedUser(j) : '');

async function getGroupMeta(session, jid, force = false) {
  const hit = session.groupCache.get(jid);
  if (!force && hit && Date.now() - hit.t < TTL) return hit.meta;
  const meta = await session.sock.groupMetadata(jid);
  session.groupCache.set(jid, { t: Date.now(), meta });
  return meta;
}

function cachedMeta(session, jid) {
  const h = session.groupCache.get(jid);
  return h && Date.now() - h.t < TTL ? h.meta : undefined;
}

function isAdminIn(meta, ids) {
  const set = new Set(ids.filter(Boolean).map(norm));
  return meta.participants.some((p) => p.admin && (set.has(norm(p.id)) || set.has(norm(p.jid)) || set.has(norm(p.lid))));
}

// Works for both phone-number ids and LID ids.
function resolveParticipant(meta, jid) {
  const b = bare(jid);
  return meta.participants.find((p) => bare(p.id) === b || bare(p.jid) === b || bare(p.lid) === b);
}

const botIds = (sock) => [sock.user?.id, sock.user?.lid];

module.exports = { getGroupMeta, cachedMeta, isAdminIn, resolveParticipant, botIds };
