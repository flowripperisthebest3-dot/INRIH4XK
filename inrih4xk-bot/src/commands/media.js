const pino = require('pino');
const { downloadMediaMessage, normalizeMessageContent, jidNormalizedUser } = require('@whiskeysockets/baileys');
const config = require('../config');

module.exports = [
  {
    name: 'vv', aliases: ['viewonce', 'reveal'], category: 'tools',
    desc: 'Reply to a view-once photo/video/voice note to save it',
    ownerOnly: !config.vvPublic,
    run: async (c) => {
      const q = c.quoted;
      if (!q?.stanzaId) return c.reply(`Reply to a view-once message with ${c.prefix}vv`);

      // Prefer the copy we cached when the message arrived (most reliable).
      const hit = c.session.voCache.get(q.stanzaId);
      let key, content;
      if (hit) {
        key = hit.key; content = hit.message;
      } else if (q.message) {
        content = normalizeMessageContent(q.message);
        key = { remoteJid: c.jid, id: q.stanzaId, participant: q.participant };
      }
      const media = content && (content.imageMessage || content.videoMessage || content.audioMessage);
      if (!media) {
        return c.reply("I can't find a view-once photo/video/voice note there. I can only reveal ones that arrived while the bot was online, within the last 30 minutes.");
      }

      let buffer;
      try {
        buffer = await downloadMediaMessage({ key, message: content }, 'buffer', {}, {
          logger: pino({ level: 'silent' }),
          reuploadRequest: c.sock.updateMediaMessage,
        });
      } catch (e) {
        return c.reply('⚠️ Could not download that media (it may have expired).');
      }

      const out = content.imageMessage ? { image: buffer, caption: media.caption || '' }
        : content.videoMessage ? { video: buffer, caption: media.caption || '' }
        : { audio: buffer, mimetype: media.mimetype || 'audio/ogg; codecs=opus', ptt: !!media.ptt };

      if (config.vvSendTo === 'self') {
        const me = jidNormalizedUser(c.sock.user.id);
        await c.antiban.send(c.sock, me, out, { typing: false });
      } else {
        await c.send(out);
      }
    },
  },
];
