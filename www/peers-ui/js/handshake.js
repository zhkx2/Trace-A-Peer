/* SMS consent handshake with two factors:
   1) the peer must approve inside the app on their own phone, and
   2) a one-time 6-digit code, shown only on the requester's screen, must be given to the peer
      out-of-band (call, chat, in person) and typed in. The code is never in the request SMS,
      so a stranger who texts a "request" cannot get consent without knowing it.
   Messages (plain SMS):
     TAP1|REQ|<id>|<requester name>      requester -> peer
     TAP1|ACC|<id>|<code>                peer -> requester (consent + code)
     TAP1|DEN|<id>|USER|CODE|LOCK|EXP    declined / wrong code / too many tries / expired
     TAP1|CFM|<id>                       requester -> peer (verified, pairing complete) */
const Handshake = (() => {
  const TTL = 10 * 60000, MAX_TRIES = 3;
  let ctx = {};
  const norm = s => String(s).replace(/\D/g, '').slice(-10);
  const clean = s => String(s || '').replace(/[|<>"'`&]/g, '').trim().slice(0, 20);
  const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => (b % 36).toString(36)).join('');
  const otp = () => String(100000 + crypto.getRandomValues(new Uint32Array(1))[0] % 900000);
  const log = (p, x) => { p.log.unshift({ t: Date.now(), x }); p.log = p.log.slice(0, 20); };
  const msg = (type, id, extra) => ['TAP1', type, id].concat(extra === undefined ? [] : [extra]).join('|');

  function send(phone, body) { // needs cordova-sms-plugin
    const s = window.sms;
    if (!s) { console.log('[no SMS plugin] to', phone, ':', body); return Promise.resolve(false); }
    return new Promise((ok, no) => {
      const go = () => s.send(String(phone).replace(/\s/g, ''), body, { android: { intent: '' } }, () => ok(true), e => no(e));
      s.hasPermission(h => h ? go() : s.requestPermission(go, () => no('SMS permission denied')), no);
    });
  }
  const trySend = (p, body) => send(p.phone, body).catch(e => { ctx.say('SMS failed: ' + e); return false; });
  const pair = p => { p.paired = true; p.status = 'active'; p.allow = true; p.req = null; log(p, 'Paired, location sharing allowed'); ctx.save(p); ctx.changed(); };

  function start(p, myName) { // requester side: new code, send REQ
    const q = p.req = { id: rid(), dir: 'out', code: otp(), exp: Date.now() + TTL, tries: 0, state: 'open' };
    p.status = 'pending'; p.paired = false; log(p, 'Handshake request sent'); ctx.save(p); ctx.changed();
    return trySend(p, msg('REQ', q.id, clean(myName) || 'Someone'));
  }
  function accept(p, code) { // peer side: user gave consent and typed the code
    if (Date.now() > p.req.exp) { ctx.say('This request has expired'); ctx.remove(p); return Promise.resolve(false); }
    p.req.state = 'sent'; log(p, 'Consent sent, waiting for confirmation'); ctx.save(p); ctx.changed();
    return trySend(p, msg('ACC', p.req.id, code));
  }
  function decline(p) { trySend(p, msg('DEN', p.req.id, 'USER')); ctx.remove(p); }

  function handle(addr, body) { // called for every incoming SMS; returns true if it was ours
    const m = /^TAP1\|(REQ|ACC|DEN|CFM)\|([a-z0-9]{6})(?:\|(.*))?$/.exec(String(body || '').trim());
    if (!m) return false;
    const type = m[1], id = m[2], rest = m[3] || '', n = norm(addr);
    if (type === 'REQ') {
      let p = ctx.peers().find(x => norm(x.phone) === n);
      if (p && p.paired) return true;
      if (!p) p = ctx.create(clean(rest) || 'Unknown', addr);
      p.status = 'pending'; p.req = { id, dir: 'in', exp: Date.now() + TTL, tries: 0, state: 'open' };
      log(p, 'Request received'); ctx.save(p); ctx.changed(); ctx.consent(p); return true;
    }
    const p = ctx.peers().find(x => x.req && x.req.id === id && norm(x.phone) === n); // must match id AND sender
    if (!p) return true;
    const q = p.req;
    if (type === 'ACC' && q.dir === 'out' && q.state === 'open') {
      if (Date.now() > q.exp) { q.state = 'expired'; log(p, 'Request expired'); trySend(p, msg('DEN', id, 'EXP')); }
      else if (rest.trim() === q.code) { pair(p); trySend(p, msg('CFM', id)); ctx.say(p.name + ' is now a trusted peer'); return true; }
      else { q.tries++; const lock = q.tries >= MAX_TRIES; if (lock) q.state = 'locked'; log(p, lock ? 'Too many wrong codes' : 'Wrong code received'); trySend(p, msg('DEN', id, lock ? 'LOCK' : 'CODE')); }
      ctx.save(p); ctx.changed();
    } else if (type === 'DEN' && q.dir === 'out' && rest === 'USER') {
      q.state = 'declined'; p.status = 'declined'; log(p, 'Declined by peer'); ctx.save(p); ctx.changed(); ctx.say(p.name + ' declined the request');
    } else if (type === 'DEN' && q.dir === 'in') {
      if (rest === 'CODE') { q.state = 'open'; q.tries++; ctx.save(p); ctx.changed(); ctx.say('Wrong code. ' + (MAX_TRIES - q.tries) + ' attempt(s) left'); ctx.consent(p); }
      else { ctx.say('Request cancelled (' + rest.toLowerCase() + ')'); ctx.remove(p); }
    } else if (type === 'CFM' && q.dir === 'in') { pair(p); ctx.say(p.name + ' is now a trusted peer'); }
    return true;
  }

  function listen() { // needs cordova-plugin-sms-receive
    const r = window.cordova && cordova.plugins && cordova.plugins.SMSReceive;
    if (!r) return false;
    document.addEventListener('onSMSArrive', e => { const m = e.data || e; handle(m.address, m.body); });
    r.startWatch(() => {}, err => console.warn('SMS watch:', err));
    return true;
  }
  return { init: c => { ctx = c; return listen(); }, start, accept, decline, handle, MAX_TRIES };
})();
