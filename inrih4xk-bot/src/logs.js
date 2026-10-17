// Keeps the last lines of console output so the admin panel can show them.
const buf = [];
const MAX = 400;
const fmt = (x) => {
  if (typeof x === 'string') return x;
  if (x && x.stack) return x.stack;
  try { return JSON.stringify(x); } catch { return String(x); }
};
for (const level of ['log', 'warn', 'error']) {
  const orig = console[level].bind(console);
  console[level] = (...a) => {
    buf.push({ t: Date.now(), level, msg: a.map(fmt).join(' ') });
    if (buf.length > MAX) buf.shift();
    orig(...a);
  };
}
module.exports = { get: () => buf.slice() };
