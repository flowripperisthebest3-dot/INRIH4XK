const list = [
  ...require('./general'),
  ...require('./fun'),
  ...require('./tools'),
  ...require('./media'),
  ...require('./group'),
  ...require('./owner'),
];

const map = new Map();
for (const c of list) {
  map.set(c.name, c);
  (c.aliases || []).forEach((a) => map.set(a, c));
}

module.exports = { list, find: (name) => map.get(name) };
