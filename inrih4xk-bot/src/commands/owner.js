const { bare } = require('../utils');

module.exports = [
  {
    name: 'mode', category: 'owner', desc: 'Set mode: mode public|self', ownerOnly: true,
    run: (c) => {
      const m = (c.args[0] || '').toLowerCase();
      if (!['public', 'self'].includes(m)) return c.reply(`Mode is *${c.store.data.mode}*. Usage: ${c.prefix}mode public|self`);
      c.store.data.mode = m; c.store.save();
      return c.reply(`✅ Mode set to *${m}*.`);
    },
  },
  {
    name: 'ban', category: 'owner', desc: 'Stop a user from using the bot', ownerOnly: true,
    run: (c) => {
      const t = c.targets[0];
      if (!t) return c.reply(`Usage: ${c.prefix}ban @user (reply, mention or number)`);
      const n = bare(t);
      if (!c.store.data.banned.includes(n)) c.store.data.banned.push(n);
      c.store.save();
      return c.reply(`🚫 @${n} can no longer use the bot.`, { mentions: [t] });
    },
  },
  {
    name: 'unban', category: 'owner', desc: 'Let a user use the bot again', ownerOnly: true,
    run: (c) => {
      const t = c.targets[0];
      if (!t) return c.reply(`Usage: ${c.prefix}unban @user`);
      c.store.data.banned = c.store.data.banned.filter((x) => x !== bare(t));
      c.store.save();
      return c.reply(`✅ @${bare(t)} unbanned.`, { mentions: [t] });
    },
  },
  {
    name: 'banned', category: 'owner', desc: 'List bot-banned users', ownerOnly: true,
    run: (c) => c.reply(c.store.data.banned.length ? '🚫 ' + c.store.data.banned.join(', ') : 'No banned users.'),
  },
  {
    name: 'setprefix', category: 'owner', desc: 'Change the command prefix', ownerOnly: true,
    run: (c) => {
      const p = c.args[0];
      if (!p || p.length > 3) return c.reply(`Usage: ${c.prefix}setprefix !   (1-3 characters)`);
      c.store.data.prefix = p; c.store.save();
      return c.reply(`✅ Prefix is now *${p}*`);
    },
  },
  {
    name: 'leave', category: 'owner', desc: 'Make the bot leave this group', ownerOnly: true, groupOnly: true,
    run: async (c) => { await c.reply('👋 Bye!'); await c.sock.groupLeave(c.jid); },
  },
  {
    name: 'restart', category: 'owner', desc: 'Restart the bot process', ownerOnly: true,
    run: async (c) => { await c.reply('♻️ Restarting...'); setTimeout(() => process.exit(1), 1500); },
  },
];
