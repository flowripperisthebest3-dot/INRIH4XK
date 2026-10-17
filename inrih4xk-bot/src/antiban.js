// Ban-risk reduction layer (one instance per linked number).
// Nothing here can guarantee a number is never banned; it only makes the bot
// behave less like a spam script.
const { sleep, rand } = require('./utils');

class AntiBan {
  constructor(cfg) {
    this.cfg = cfg; // shared object: edits in the admin panel apply live
    this.queue = [];
    this.running = false;
    this.sentTimes = [];
    this.userHits = new Map();
    this.ownIds = new Set();
    this.sentMsgs = new Map(); // id -> message, needed so WhatsApp retries can re-send
    this.totalSent = 0;
    this.dropped = 0;
  }

  allowUser(jid) {
    const now = Date.now();
    if (now - (this.userHits.get(jid) || 0) < this.cfg.userCooldownMs) return false;
    this.userHits.set(jid, now);
    if (this.userHits.size > 5000) for (const [k, t] of this.userHits) if (now - t > 600000) this.userHits.delete(k);
    return true;
  }

  isOwnSend(id) { return this.ownIds.has(id); }
  getSent(id) { return this.sentMsgs.get(id); }

  _remember(res) {
    const id = res?.key?.id;
    if (!id) return;
    this.ownIds.add(id);
    this.sentMsgs.set(id, res.message);
    for (const set of [this.ownIds, this.sentMsgs]) {
      while (set.size > 1000) set.delete(set.keys().next().value);
    }
  }

  send(sock, jid, content, opts = {}) {
    return new Promise((resolve, reject) => {
      if (this.queue.length >= this.cfg.maxQueue) {
        this.dropped++;
        return reject(new Error('antiban: queue full, message dropped'));
      }
      this.queue.push({ sock, jid, content, opts, resolve, reject });
      this._run();
    });
  }

  async _run() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length) {
      const job = this.queue.shift();
      try {
        await this._waitForBudget();
        const text = job.content.text || job.content.caption || '';
        const base = rand(this.cfg.minDelayMs, Math.max(this.cfg.minDelayMs, this.cfg.maxDelayMs));
        if (job.opts.typing !== false) {
          await job.sock.presenceSubscribe(job.jid).catch(() => {});
          await job.sock.sendPresenceUpdate('composing', job.jid).catch(() => {});
          await sleep(Math.min(base + text.length * this.cfg.typingMsPerChar, 9000));
          await job.sock.sendPresenceUpdate('paused', job.jid).catch(() => {});
        } else {
          await sleep(base);
        }
        const res = await job.sock.sendMessage(job.jid, job.content, job.opts.quoted ? { quoted: job.opts.quoted } : {});
        this._remember(res);
        this.sentTimes.push(Date.now());
        this.totalSent++;
        job.resolve(res);
      } catch (e) {
        job.reject(e);
      }
    }
    this.running = false;
  }

  async _waitForBudget() {
    for (;;) {
      const cutoff = Date.now() - 60000;
      this.sentTimes = this.sentTimes.filter((t) => t > cutoff);
      if (this.sentTimes.length < this.cfg.maxPerMinute) return;
      await sleep(1000);
    }
  }

  stats() {
    const cutoff = Date.now() - 60000;
    return {
      sentTotal: this.totalSent,
      sentLastMinute: this.sentTimes.filter((t) => t > cutoff).length,
      queued: this.queue.length,
      dropped: this.dropped,
      limits: { ...this.cfg },
    };
  }
}

module.exports = { AntiBan };
