const { rand } = require('../utils');

const BALL = [
  'It is certain.', 'Without a doubt.', 'Yes, definitely.', 'Most likely.', 'Signs point to yes.',
  'Ask again later.', 'Cannot predict now.', "Don't count on it.", 'My sources say no.', 'Very doubtful.',
];

module.exports = [
  {
    name: 'dice', aliases: ['roll'], category: 'fun', desc: 'Roll a die (optional sides, default 6)',
    run: (c) => {
      const sides = Math.min(1000, Math.max(2, parseInt(c.args[0], 10) || 6));
      return c.reply(`🎲 You rolled *${rand(1, sides)}* (d${sides})`);
    },
  },
  {
    name: 'flip', aliases: ['coin'], category: 'fun', desc: 'Flip a coin',
    run: (c) => c.reply(`🪙 ${Math.random() < 0.5 ? 'Heads' : 'Tails'}`),
  },
  {
    name: '8ball', category: 'fun', desc: 'Ask the magic 8-ball',
    run: (c) =>
      c.args.length
        ? c.reply(`🎱 ${BALL[rand(0, BALL.length - 1)]}`)
        : c.reply(`Usage: ${c.prefix}8ball will I win?`),
  },
  {
    name: 'choose', aliases: ['pick'], category: 'fun', desc: 'Pick one: choose pizza | rice | burger',
    run: (c) => {
      const opts = c.args.join(' ').split('|').map((s) => s.trim()).filter(Boolean);
      return opts.length < 2
        ? c.reply(`Usage: ${c.prefix}choose pizza | rice | burger`)
        : c.reply(`👉 ${opts[rand(0, opts.length - 1)]}`);
    },
  },
];
