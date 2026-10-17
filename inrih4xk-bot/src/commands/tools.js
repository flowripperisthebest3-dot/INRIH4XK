const crypto = require('crypto');

module.exports = [
  {
    name: 'calc', aliases: ['math'], category: 'tools', desc: 'Calculator: calc (2+3)*4',
    run: (c) => {
      const expr = c.args.join(' ').replace(/\^/g, '**');
      if (!expr || expr.length > 100 || !/^[0-9+\-*/().%\s]+$/.test(expr)) {
        return c.reply(`Usage: ${c.prefix}calc (2+3)*4   (numbers and + - * / ( ) % ^ only)`);
      }
      try {
        const result = Function(`"use strict"; return (${expr})`)();
        return c.reply(Number.isFinite(result) ? `🧮 ${result}` : 'Result is not a finite number.');
      } catch {
        return c.reply('Invalid expression.');
      }
    },
  },
  {
    name: 'say', aliases: ['echo'], category: 'tools', desc: 'Repeat your text',
    run: (c) => (c.args.length ? c.reply(c.args.join(' ').slice(0, 500)) : c.reply(`Usage: ${c.prefix}say hello`)),
  },
  {
    name: 'b64', category: 'tools', desc: 'Base64: b64 enc <text> | b64 dec <text>',
    run: (c) => {
      const [mode, ...rest] = c.args;
      const input = rest.join(' ');
      if (!input || !['enc', 'dec'].includes(mode)) return c.reply(`Usage: ${c.prefix}b64 enc hello  |  ${c.prefix}b64 dec aGVsbG8=`);
      return c.reply(mode === 'enc' ? Buffer.from(input).toString('base64') : Buffer.from(input, 'base64').toString('utf8'));
    },
  },
  {
    name: 'pass', aliases: ['password'], category: 'tools', desc: 'Generate a random password (length 8-64)',
    run: (c) => {
      const len = Math.min(64, Math.max(8, parseInt(c.args[0], 10) || 16));
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?';
      let out = '';
      for (let i = 0; i < len; i++) out += chars[crypto.randomInt(chars.length)];
      return c.reply(`🔑 ${out}`);
    },
  },
];
