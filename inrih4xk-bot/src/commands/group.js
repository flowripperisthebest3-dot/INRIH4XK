const { resolveParticipant } = require('../group');
const { bare, sleep, rand } = require('../utils');

const STATUS = {
  '403': "I'm not allowed to do that. Make sure I'm a group admin.",
  '401': 'not authorized (I must be a group admin)',
  '404': 'user not found',
  '409': 'already has that role',
  '500': 'WhatsApp refused the request',
};

const participantAction = (name, action, desc, doneText) => ({
  name, category: 'group', desc, groupOnly: true, adminOnly: true,
  run: async (c) => {
    if (!c.targets.length) return c.reply(`Usage: ${c.prefix}${name} @user  (reply, mention or number; max 5)`);
    const meta = await c.group(true);
    const lines = [], mentions = [];
    for (const jid of c.targets.slice(0, 5)) {
      mentions.push(jid);
      const p = resolveParticipant(meta, jid);
      if (!p) { lines.push(`❌ @${bare(jid)} is not in this group`); continue; }
      if (bare(p.id) === bare(c.sock.user.id) || bare(p.jid) === bare(c.sock.user.id)) continue;
      try {
        const res = await c.sock.groupParticipantsUpdate(c.jid, [p.id], action);
        const st = String(res?.[0]?.status || '');
        lines.push(st === '200' ? `✅ ${doneText} @${bare(jid)}` : `❌ @${bare(jid)}: ${STATUS[st] || 'error ' + st}`);
      } catch (e) {
        lines.push(`❌ @${bare(jid)}: ${/not-authorized|403/.test(e.message) ? STATUS['403'] : e.message}`);
      }
      await sleep(rand(1500, 3000));
    }
    c.invalidate();
    return c.reply(lines.join('\n') || 'Nothing to do.', { mentions });
  },
});

const adminCall = (fn, ok) => async (c) => {
  try { await fn(c); return c.reply(typeof ok === 'function' ? await ok(c) : ok); }
  catch (e) { return c.reply(/not-authorized|403|forbidden/i.test(e.message) ? `❌ ${STATUS['403']}` : `❌ ${e.message}`); }
};

module.exports = [
  {
    name: 'groupinfo', aliases: ['ginfo'], category: 'group', desc: 'Show group details', groupOnly: true,
    run: async (c) => {
      const m = await c.group();
      const admins = m.participants.filter((p) => p.admin).length;
      return c.reply(`👥 *${m.subject}*\nMembers: ${m.participants.length}\nAdmins: ${admins}\nCreated: ${new Date(m.creation * 1000).toDateString()}\n\n${m.desc || 'No description'}`);
    },
  },
  {
    name: 'admins', category: 'group', desc: 'List group admins', groupOnly: true,
    run: async (c) => {
      const m = await c.group();
      const ids = m.participants.filter((p) => p.admin).map((p) => p.id);
      return c.reply(`👮 *Admins*\n${ids.map((j) => '@' + bare(j)).join('\n')}`, { mentions: ids });
    },
  },
  {
    name: 'tagall', aliases: ['everyone'], category: 'group', desc: 'Mention everyone (admins only)', groupOnly: true, adminOnly: true,
    run: async (c) => {
      const m = await c.group();
      const ids = m.participants.map((p) => p.id);
      const note = c.args.join(' ') || 'Attention everyone!';
      const list = ids.length <= 100 ? '\n' + ids.map((j) => '@' + bare(j)).join(' ') : '';
      return c.reply(`📢 ${note}${list}`, { mentions: ids });
    },
  },
  {
    name: 'hidetag', aliases: ['ht'], category: 'group', desc: 'Silently notify everyone', groupOnly: true, adminOnly: true,
    run: async (c) => {
      const m = await c.group();
      return c.reply(c.args.join(' ') || '📢', { mentions: m.participants.map((p) => p.id) });
    },
  },
  participantAction('kick', 'remove', 'Remove member(s)', 'Removed'),
  participantAction('promote', 'promote', 'Make member(s) admin', 'Promoted'),
  participantAction('demote', 'demote', 'Remove admin rights', 'Demoted'),
  {
    name: 'mute', aliases: ['close'], category: 'group', desc: 'Only admins can send messages', groupOnly: true, adminOnly: true,
    run: adminCall((c) => c.sock.groupSettingUpdate(c.jid, 'announcement'), '🔇 Group muted (admins only).'),
  },
  {
    name: 'unmute', aliases: ['open'], category: 'group', desc: 'Everyone can send messages', groupOnly: true, adminOnly: true,
    run: adminCall((c) => c.sock.groupSettingUpdate(c.jid, 'not_announcement'), '🔊 Group opened.'),
  },
  {
    name: 'link', aliases: ['invite'], category: 'group', desc: 'Get the group invite link', groupOnly: true, adminOnly: true,
    run: async (c) => {
      try { return c.reply(`🔗 https://chat.whatsapp.com/${await c.sock.groupInviteCode(c.jid)}`); }
      catch (e) { return c.reply(`❌ ${STATUS['403']}`); }
    },
  },
  {
    name: 'antilink', category: 'group', desc: 'Delete group invite links: antilink on|off', groupOnly: true, adminOnly: true,
    run: async (c) => {
      const arg = (c.args[0] || '').toLowerCase();
      const d = c.store.data;
      if (arg === 'on') { if (!d.antilink.includes(c.jid)) d.antilink.push(c.jid); c.store.save(); return c.reply('🚫 Anti-link ON (I must be admin to delete).'); }
      if (arg === 'off') { d.antilink = d.antilink.filter((j) => j !== c.jid); c.store.save(); return c.reply('✅ Anti-link OFF.'); }
      return c.reply(`Anti-link is ${d.antilink.includes(c.jid) ? 'ON' : 'OFF'}. Usage: ${c.prefix}antilink on|off`);
    },
  },
];
