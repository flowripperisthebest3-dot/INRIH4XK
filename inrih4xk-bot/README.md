# INRIH4XK v2 - multi-number WhatsApp bot

- **`/`** - public page where people enter their number and get a pairing code
- **`/admin`** - admin panel (needs `ADMIN_KEY`)
- Many numbers at once, each with its own session, settings and anti-ban queue
- ~35 commands including `.vv` (reveal view-once)

> No bot can guarantee a number is never banned. WhatsApp does not allow unofficial clients.
> The anti-ban layer lowers risk; it does not remove it. Use spare numbers.

## Deploy (Railway or Render)
1. Push this folder to GitHub, deploy it (Start command: `npm start`, Node 20+).
2. **Add a persistent Volume/Disk** and set `SESSION_DIR` / `DATA_DIR` to paths on it
   (Railway: mount `/data` -> `SESSION_DIR=/data/session`, `DATA_DIR=/data/data`).
   Without it every redeploy wipes all logins.
3. Set variables (see `.env.example`): at minimum `OWNER_NUMBER` and `ADMIN_KEY` (long random string).
4. Open your domain: `/` for the linking page, `/admin` for the panel.

**Upgrading from v1:** your existing login is moved automatically on first start (keep the same
`SESSION_DIR`). You don't need to pair again.

## Linking page (`/`)
User enters their number + ticks the consent box -> gets a code -> enters it in
WhatsApp > Linked devices > Link with phone number. The page shows "Connected" when done.
Protections: per-IP limit (6/hour), per-number limit (1 per 90 s, 6 per day), an already-linked
number can't be re-paired by someone else, abandoned attempts are deleted after `PAIR_TIMEOUT_SEC`,
and `MAX_SESSIONS` caps how many numbers you host.

## Admin panel (`/admin`)
- **Dashboard:** connected numbers, uptime, memory, open/close public linking, restart server
- **Numbers:** restart / stop / start / unlink (logs the number out) / delete each number
- **Manage a number:** mode (public/self), prefix, banned users, anti-link groups, anti-ban stats,
  send a message (through the anti-ban queue), list groups, mute/unmute, invite link, leave,
  and promote / demote / remove members
- **Add number:** link a number yourself and get a code
- **Settings:** open/close linking, max numbers, block numbers from linking, live anti-ban limits
- **Logs:** live server logs

There is deliberately **no bulk broadcast** feature: mass messaging is the fastest way to get
numbers banned (and it's spam).

## Commands (default prefix `.`)
| Category | Commands |
|---|---|
| General | menu, ping, alive, uptime, info, owner, time, antiban |
| Fun | dice, flip, 8ball, choose |
| Tools | calc, say, b64, pass, **vv** |
| Group (admins) | groupinfo, admins, tagall, hidetag, kick, promote, demote, mute, unmute, link, antilink on/off |
| Owner | mode, ban, unban, banned, setprefix, leave, restart |

Group admin commands need the bot's number to be a **group admin**. Promote/kick accept a
mention, a reply, or a phone number, and now report the real result from WhatsApp.

### `.vv`
Reply to a view-once photo, video or voice note with `.vv`. The bot saves it to **your own
chat** (`VV_SEND_TO=chat` to send it in the same chat instead). It only works on messages that
arrived while the bot was online, within the last 30 minutes. Owner-only by default
(`VV_PUBLIC=true` to allow everyone). Be considerate: the sender chose view-once for a reason.

## Fixes in this version
- **"Waiting for this message. This may take a while."** The bot now keeps sent messages so
  WhatsApp can re-request them (the old version didn't), and caches group info. If it still
  happens: make sure the same number isn't logged in on two servers, then unlink and re-link
  (a corrupted session causes it).
- **Promote/kick didn't work:** numbers are now matched to the group's real participant IDs
  (WhatsApp now uses LIDs in many groups), the "admin" pre-check no longer blocks wrongly, and the
  bot reports WhatsApp's actual answer instead of always saying "done".
- `.restart` / admin "Restart server" exit with a non-zero code so Railway/Render restart the app.

## Privacy and responsibility
A linked number gives this server the ability to send and receive messages as that account.
The bot only reacts to commands and stores no chat history, but you (the host) hold the sessions.
Tell users plainly (the page does), keep `ADMIN_KEY` secret, and let people unlink on request.

## Add your own command
```js
{ name: 'hello', category: 'general', desc: 'Say hello',
  // optional: ownerOnly, groupOnly, adminOnly
  run: async (c) => c.reply(`Hello @${c.sender.split('@')[0]}!`, { mentions: [c.sender] }) }
```
Add it to a file in `src/commands/`. Always reply with `c.reply` / `c.send` so the anti-ban queue is used.

## Troubleshooting
- **Admin says ADMIN_KEY is not set:** add the variable and redeploy.
- **Owner commands fail in groups:** put your LID in `OWNER_LID`.
- **No code / "WhatsApp did not return a code":** check the number format (country code, no `+`, no leading 0).
- **Status stuck on "reconnecting":** check the Logs tab; "replaced" means the number is logged in elsewhere.
