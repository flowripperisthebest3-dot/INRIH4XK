const { normalizeMessageContent, getContentType, jidNormalizedUser } = require('@whiskeysockets/baileys');
const config = require('./config');
const store = require('./store');
const commands = require('./commands');
const { getGroupMeta, isAdminIn, botIds } = require('./group');
const { bare } = require('./utils');

const LINK_RE = /chat\.whatsapp\.com\/[A-Za-z0-9]{10,}/i;

async function onMessages(session, { messages, type }) {
  if (type !== 'notify' || session.stopped) return;
  for (const msg of messages) {
    try {
      await processMessage(session, msg);
    } catch (e) {
      console.error(`[${session.id}] handler:`, e.message);
    }
  }
}

// Remember view-once media in memory (30 min) so .vv can reveal it later.
function cacheViewOnce(session, msg, content) {
  const m = msg.message;
  const wrapped = !!(m.viewOnceMessage || m.viewOnceMessageV2 || m.viewOnceMessageV2Extension);
  const media = content.imageMessage || content.videoMessage || content.audioMessage;
  if (!media || !(wrapped || media.viewOnce)) return;
  const c = session.voCache;
  const now = Date.now();
  c.set(msg.key.id, { key: msg.key, message: content, t: now });
  for (const [k, v] of c) if (now - v.t > 1800000 || c.size > 100) c.delete(k);
}

async function processMessage(session, msg) {
  const { sock, antiban, settings } = session;
  if (!msg.message) return;
  const jid = msg.key.remoteJid;
  if (!jid || jid === 'status@broadcast' || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return;
  if (antiban.isOwnSend(msg.key.id)) return;

  const content = normalizeMessageContent(msg.message);
  if (!content) return;
  cacheViewOnce(session, msg, content);

  const text = (
    content.conversation || content.extendedTextMessage?.text ||
    content.imageMessage?.caption || content.videoMessage?.caption || ''
  ).trim();
  if (!text) return;

  const isGroup = jid.endsWith('@g.us');
  const fromMe = !!msg.key.fromMe;
  const sender = fromMe ? jidNormalizedUser(sock.user.id) : isGroup ? msg.key.participant : jid;
  if (!sender) return;
  const isOwner = fromMe || session.ownerIds.includes(bare(sender));

  // Anti-link
  if (isGroup && !fromMe && !isOwner && settings.antilink.includes(jid) && LINK_RE.test(text)) {
    const meta = await getGroupMeta(session, jid).catch(() => null);
    if (meta && isAdminIn(meta, botIds(sock)) && !isAdminIn(meta, [sender])) {
      await sock.sendMessage(jid, { delete: msg.key }).catch(() => {});
      await antiban.send(sock, jid, { text: `🚫 @${bare(sender)}, group links are not allowed here.`, mentions: [sender] }, { typing: false }).catch(() => {});
      return;
    }
  }

  // Commands
  const prefix = settings.prefix || config.prefix;
  if (!text.startsWith(prefix)) return;
  const [rawName, ...args] = text.slice(prefix.length).trim().split(/\s+/);
  const cmd = commands.find((rawName || '').toLowerCase());
  if (!cmd) return;

  if (!isOwner && settings.banned.includes(bare(sender))) return;
  if (!isOwner && settings.mode === 'self') return;
  if (!isOwner && !antiban.allowUser(sender)) return;

  sock.readMessages([msg.key]).catch(() => {});

  const ci = content[getContentType(content)]?.contextInfo || {};
  const targets = [...(ci.mentionedJid || [])];
  if (!targets.length && ci.participant) targets.push(ci.participant);
  if (!targets.length && /^\d{7,15}$/.test(args[0] || '')) targets.push(`${args[0]}@s.whatsapp.net`);

  const send = (c) => antiban.send(sock, jid, c, { quoted: msg });
  const ctx = {
    session, sock, msg, jid, sender, isGroup, isOwner, args, text, prefix, targets, config, antiban,
    store: { data: settings, save: store.save },
    quoted: { stanzaId: ci.stanzaId, participant: ci.participant, message: ci.quotedMessage },
    send,
    reply: (t, extra = {}) => send({ text: t, ...extra }),
    group: (force) => getGroupMeta(session, jid, force),
    invalidate: () => session.groupCache.delete(jid),
  };

  try {
    if (cmd.ownerOnly && !isOwner) return await ctx.reply('⛔ Owner only command.');
    if (cmd.groupOnly && !isGroup) return await ctx.reply('ℹ️ This command works in groups only.');
    if (cmd.adminOnly && !isOwner) {
      const meta = await ctx.group();
      if (!isAdminIn(meta, [sender])) return await ctx.reply('⛔ Group admins only.');
    }
    await cmd.run(ctx);
  } catch (e) {
    console.error(`[${session.id}] cmd ${cmd.name}:`, e.message);
    await ctx.reply('⚠️ Something went wrong running that command.').catch(() => {});
  }
}

module.exports = { onMessages };
