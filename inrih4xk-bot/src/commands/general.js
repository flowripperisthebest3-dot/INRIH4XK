const config = require('../config');
const { fmtDuration } = require('../utils');

const tsMs = (t) => (t && t.toNumber ? t.toNumber() : Number(t)) * 1000;

module.exports = [
  {
    name: 'menu', aliases: ['help', 'commands'], category: 'general', desc: 'Show all commands',
    run: async (c) => {
      const { list } = require('./index');
      const cats = {};
      for (const cmd of list) (cats[cmd.category] ??= []).push(cmd);
      let out = `╭━━〔 *${config.botName}* 〕━━\n┃ Prefix: ${c.prefix}  |  Mode: ${c.store.data.mode}\n┃ Uptime: ${fmtDuration(process.uptime())}\n╰━━━━━━━━━━━━━\n`;
      for (const [cat, cmds] of Object.entries(cats)) {
        out += `\n*${cat.toUpperCase()}*\n` + cmds.map((x) => `• ${c.prefix}${x.name} - ${x.desc}`).join('\n') + '\n';
      }
      out += `\n_Replies are rate-limited on purpose (anti-ban)._`;
      return c.reply(out);
    },
  },
  {
    name: 'ping', category: 'general', desc: 'Check bot speed',
    run: async (c) => {
      const lat = Math.max(0, Date.now() - tsMs(c.msg.messageTimestamp));
      return c.reply(`🏓 Pong! ~${Number.isFinite(lat) ? lat : '?'}ms`);
    },
  },
  {
    name: 'alive', category: 'general', desc: 'Is the bot online?',
    run: (c) => c.reply(`✅ *${config.botName}* is alive.\nUptime: ${fmtDuration(process.uptime())}`),
  },
  {
    name: 'uptime', aliases: ['runtime'], category: 'general', desc: 'How long the bot has been running',
    run: (c) => c.reply(`⏱️ ${fmtDuration(process.uptime())}`),
  },
  {
    name: 'info', aliases: ['about'], category: 'general', desc: 'Bot information',
    run: (c) => {
      const mem = (process.memoryUsage().rss / 1048576).toFixed(0);
      return c.reply(`🤖 *${config.botName}*\nNode: ${process.version}\nMemory: ${mem} MB\nPlatform: ${process.platform}\nMode: ${c.store.data.mode}`);
    },
  },
  {
    name: 'owner', category: 'general', desc: 'Contact the owner',
    run: (c) => c.reply(config.ownerNumber ? `👤 Owner: wa.me/${config.ownerNumber}` : 'Owner number not configured.'),
  },
  {
    name: 'time', category: 'general', desc: 'Current time (optional timezone, e.g. Europe/London)',
    run: (c) => {
      const tz = c.args[0] || config.timezone;
      try { return c.reply(`🕒 ${new Date().toLocaleString('en-GB', { timeZone: tz })} (${tz})`); }
      catch { return c.reply('Invalid timezone. Example: Africa/Lagos'); }
    },
  },
  {
    name: 'antiban', aliases: ['stats'], category: 'general', desc: 'Anti-ban status and send stats',
    run: (c) => {
      const s = c.antiban.stats();
      return c.reply(
        `🛡️ *Anti-ban status*\nSent (total): ${s.sentTotal}\nSent (last min): ${s.sentLastMinute}/${s.limits.maxPerMinute}\nQueued: ${s.queued}\nDropped: ${s.dropped}\nDelay: ${s.limits.minDelayMs}-${s.limits.maxDelayMs}ms + typing\nUser cooldown: ${s.limits.userCooldownMs}ms`
      );
    },
  },
];
