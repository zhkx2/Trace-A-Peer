(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const TKEY = 'tap.theme', MEKEY = 'tap.me';
  const DEV_ALLOW_EMULATOR_NUMBERS = true; // lets emulator numbers like 5556 pass validation; set to false for the final build

  const STATUS = { active: ['2G SMS Active', 'ok'], queue: ['Offline Queueing', 'warn'], pending: ['Handshake Pending', 'info'], declined: ['Declined', 'danger'] };
  const NETS = [['2G SMS Active', 'ok', 'sms'], ['Offline Queueing', 'warn', 'queue'], ['No Signal', 'danger', 'none']];
  const COLORS = ['#0f766e', '#b45309', '#7c3aed', '#be185d', '#15803d', '#475569'];
  const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  const S = { peers: [], net: 'sms', outbox: [], f: 'all', q: '', sort: 'recent', sel: null, del: null, edit: null, consent: null };
  let ni = 0;

  const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ago = t => { if (!t) return 'No location yet'; const m = Math.floor((Date.now() - t) / 60000); return m < 1 ? 'Just now' : m < 60 ? m + ' min ago' : Math.floor(m / 60) + ' hr ago'; };
  const clock = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const ini = n => n.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const dir = b => DIRS[Math.round(b / 45) % 8];
  const distTxt = p => p.dist == null ? 'Distance unknown' : p.dist + ' km ' + dir(p.bearing);
  const find = id => S.peers.find(p => p.id === id);
  const log = (p, x) => { p.log.unshift({ t: Date.now(), x }); p.log = p.log.slice(0, 20); };
  const buzz = () => { try { navigator.vibrate && navigator.vibrate(15); } catch (e) {} };
  const norm = s => String(s).replace(/\D/g, '').slice(-10);
  const fmtPhone = raw => { const d = String(raw).replace(/\D/g, ''); if (d.length < 10) return String(raw); const t = d.slice(-10); return '0' + t.slice(0, 3) + ' ' + t.slice(3, 6) + ' ' + t.slice(6); };
  const validPhone = raw => /^(09\d{9}|\+639\d{9})$/.test(raw) || (DEV_ALLOW_EMULATOR_NUMBERS && /^55\d\d$/.test(raw));
  const mockFetch = () => new Promise(r => setTimeout(r, 1400)); // stand-in for the PING/LOC SMS round trip (next milestone)
  function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('show'), 2600); }

  /* ---- Theme ---- */
  function applyTheme(t, persist = true) {
    const theme = t === 'dark' ? 'dark' : 'light';
    document.body.classList.toggle('dark-theme', theme === 'dark');
    document.documentElement.setAttribute('data-theme', theme);
    $('#theme').textContent = theme === 'dark' ? '☀️' : '🌙';
    if (persist) { try { localStorage.setItem(TKEY, theme); } catch (e) {} }
    try { if (window.StatusBar) { theme === 'dark' ? StatusBar.styleLightContent() : StatusBar.styleDefault(); } } catch (e) {}
  }
  const currentTheme = () => { try { return localStorage.getItem(TKEY) === 'dark' ? 'dark' : 'light'; } catch (e) { return 'light'; } };

  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.origin !== window.location.origin || !event.data || event.data.type !== 'trace-a-peer:theme') return;
    applyTheme(event.data.theme, false);
  });

  /* ---- Read: search, filter, sort ---- */
  function visible() {
    const q = S.q.trim().toLowerCase();
    const a = S.peers.filter(p => (S.f === 'all' || (S.f === 'fav' ? p.fav : p.status === S.f)) && (!q || p.name.toLowerCase().includes(q) || p.phone.replace(/\s/g, '').includes(q.replace(/\s/g, ''))));
    const cmp = { recent: (x, y) => (y.ts || 0) - (x.ts || 0), near: (x, y) => (x.dist ?? 1e9) - (y.dist ?? 1e9), name: (x, y) => x.name.localeCompare(y.name) }[S.sort];
    return a.sort((x, y) => (y.fav - x.fav) || cmp(x, y));
  }

  /* ---- Rendering ---- */
  const pairLabel = p => p.paired ? 'Paired ✓' : p.req && p.req.dir === 'in' ? 'Respond to Request' : 'Resend Request';
  const pairOff = p => p.paired || (p.req && p.req.dir === 'in' && p.req.state === 'sent');
  const quick = p => p.paired
    ? '<button class="btn sm primary" data-act="ping">Ping via SMS</button><button class="btn sm" data-act="refresh">Refresh</button>'
    : `<button class="btn sm primary" data-act="pair" ${pairOff(p) ? 'disabled' : ''}>${pairLabel(p)}</button>`;
  function cardHTML(p) {
    const [l, k] = STATUS[p.status] || STATUS.pending;
    return `<article class="card" data-id="${p.id}">
      <div class="row"><div class="av" style="background:${COLORS[p.id % COLORS.length]}">${esc(ini(p.name))}</div>
        <div class="meta"><b>${esc(p.name)}${p.fav ? ' ★' : ''}</b><span>${esc(p.phone)}</span></div><span class="badge ${k}">${l}</span></div>
      <div class="info"><span>📍 ${distTxt(p)}</span><span>🕒 ${ago(p.ts)}</span></div><div class="quick">${quick(p)}</div></article>`;
  }
  function hsCard(p) {
    const q = p.req; if (p.paired || !q) return '';
    const left = Math.ceil((q.exp - Date.now()) / 60000);
    if (q.dir === 'out') {
      if (q.state === 'open' && left > 0) return `<div class="codecard"><small>Verification code. Give it to ${esc(p.name)} by call, chat, or in person.</small><b>${q.code.slice(0, 3)} ${q.code.slice(3)}</b><small>Expires in ${left} min · ${Handshake.MAX_TRIES - q.tries} tries left</small></div>`;
      const why = { declined: 'Declined by the peer.', locked: 'Too many wrong codes.' }[q.state] || 'Request expired.';
      return `<div class="codecard"><small>${why} Tap Resend Request for a new code.</small></div>`;
    }
    return `<div class="codecard"><small>${q.state === 'sent' ? 'Consent sent. Waiting for ' + esc(p.name) + '’s device to confirm.' : esc(p.name) + ' wants to see your location. Ask them for their 6-digit code.'}</small></div>`;
  }
  function render() {
    const n = k => S.peers.filter(p => p.status === k).length;
    $('#sub').textContent = `${S.peers.length} peers · ${n('active')} active · ${n('pending')} pending · ${DB.kind()}`;
    const chips = [['all', 'All', S.peers.length], ['active', 'Active', n('active')], ['queue', 'Queued', n('queue')], ['pending', 'Pending', n('pending')], ['fav', '★ Favourites', S.peers.filter(p => p.fav).length]];
    $('#chips').innerHTML = chips.map(c => `<button class="chip ${S.f === c[0] ? 'on' : ''}" data-f="${c[0]}">${c[1]} ${c[2]}</button>`).join('');
    const v = visible();
    $('#list').innerHTML = v.length ? v.map(cardHTML).join('') : `<div class="empty">${S.peers.length ? 'No peers match your filter.' : 'No peers yet.<br>Tap “Add Peer” to send a handshake request.'}</div>`;
    const b = $('#banner');
    b.hidden = !(S.net !== 'sms' || S.outbox.length);
    b.textContent = S.net === 'none' ? `No signal. ${S.outbox.length} ping(s) waiting; they send when signal returns.` : `Offline queueing: ${S.outbox.length} ping(s) waiting for SMS signal.`;
    if (S.sel) detail(find(S.sel));
  }
  function detail(p) {
    if (!p) return closeAll();
    const [l, k] = STATUS[p.status] || STATUS.pending;
    $('#detailBody').innerHTML = `<div class="grab"></div>
      <div class="row head"><div class="av lg" style="background:${COLORS[p.id % COLORS.length]}">${esc(ini(p.name))}</div>
        <div class="meta"><b>${esc(p.name)}</b><span>${esc(p.phone)}</span></div>
        <button class="icon-btn" data-act="fav" aria-label="Toggle favourite">${p.fav ? '★' : '☆'}</button></div>
      <span class="badge ${k}">${l}</span>${hsCard(p)}
      <div class="grid2">
        <div class="tile"><small>Distance</small><b>${distTxt(p)}</b></div>
        <div class="tile"><small>Last update</small><b>${ago(p.ts)}</b></div>
        <div class="tile"><small>Coordinates</small><b>${p.lat == null ? 'Not shared yet' : p.lat + ', ' + p.lng}</b></div>
        <div class="tile"><small>Bearing</small>${p.bearing == null ? '<b>Unknown</b>' : `<span class="needle"><i style="transform:rotate(${p.bearing}deg)">↑</i></span><b>${dir(p.bearing)} ${p.bearing}°</b>`}</div>
      </div>
      <label class="switch-row"><span>Allow this peer to request my location</span><input type="checkbox" data-act="allow" ${p.allow ? 'checked' : ''}></label>
      <h3>Activity</h3><ul class="log">${p.log.slice(0, 5).map(e => `<li>${esc(e.x)}<span>${clock(e.t)}</span></li>`).join('') || '<li>No activity yet</li>'}</ul>
      <div class="actions">
        <button class="btn primary" data-act="ping" ${p.paired ? '' : 'disabled'}>Ping via SMS</button>
        <button class="btn" data-act="refresh" ${p.paired ? '' : 'disabled'}>Refresh Location</button>
        <button class="btn" data-act="pair" ${pairOff(p) ? 'disabled' : ''}>${pairLabel(p)}</button>
        <button class="btn" data-act="edit">Edit Nickname</button>
        <button class="btn del span2" data-act="del">Delete Peer</button></div>`;
    $('#detail').classList.add('show');
  }
  function closeAll() { S.sel = null; ['#detail', '#addSheet', '#confirm', '#consent'].forEach(s => $(s).classList.remove('show')); }

  /* ---- Actions ---- */
  function run(p) { // mocked location fetch for paired peers
    p.status = 'queue'; render();
    mockFetch().then(() => {
      p.status = 'active'; p.ts = Date.now();
      if (p.dist == null) { p.dist = +(Math.random() * 4 + 0.3).toFixed(1); p.bearing = Math.floor(Math.random() * 360); p.lat = +(14.55 + Math.random() * 0.1).toFixed(5); p.lng = +(120.95 + Math.random() * 0.1).toFixed(5); }
      log(p, 'Location received'); DB.update(p); render(); toast('Location received from ' + p.name);
    });
  }
  function ping(p) {
    if (!p.paired) return toast('Pair with ' + p.name + ' first');
    buzz();
    if (S.net !== 'sms') { p.status = 'queue'; S.outbox.push(p.id); log(p, 'Ping queued, waiting for signal'); DB.update(p); render(); return toast('No SMS signal. Ping queued.'); }
    log(p, 'Ping sent via SMS'); toast('SMS ping sent to ' + p.name); run(p);
  }
  function setNet() {
    ni = (ni + 1) % 3; S.net = NETS[ni][2];
    const b = $('#net'); b.textContent = NETS[ni][0]; b.className = 'badge ' + NETS[ni][1];
    if (S.net === 'sms') { const ids = S.outbox.splice(0); ids.forEach((id, i) => { const p = find(id); if (p) setTimeout(() => run(p), i * 700); }); toast(ids.length ? 'Signal back. Sending ' + ids.length + ' queued ping(s)' : '2G SMS active'); }
    render();
  }
  function resend(p) { Handshake.start(p, ls.get(MEKEY) || 'Someone').then(ok => toast(ok ? 'New request sent' : 'SMS plugin unavailable, request not sent')); }
  function act(p, a, el) {
    if (a === 'ping') ping(p);
    else if (a === 'pair') p.req && p.req.dir === 'in' ? openConsent(p) : resend(p);
    else if (a === 'refresh') { if (!p.paired) return toast('Pair with ' + p.name + ' first'); toast('Latest saved location · ' + ago(p.ts).toLowerCase()); }
    else if (a === 'fav') { p.fav = !p.fav; DB.update(p); render(); }
    else if (a === 'allow') { p.allow = el.checked; log(p, p.allow ? 'Tracking allowed' : 'Tracking blocked'); DB.update(p); render(); }
    else if (a === 'edit') openAdd(p);
    else if (a === 'del') { S.del = p.id; $('#cTitle').textContent = 'Delete ' + p.name + '?'; $('#confirm').classList.add('show'); }
  }

  /* ---- Create / Update peer (form) ---- */
  const clearErr = () => ['phone', 'nick', 'me'].forEach(k => { $('#' + k + 'Err').textContent = ''; $('#' + k).classList.remove('bad'); });
  const fail = (k, m) => { $('#' + k + 'Err').textContent = m; $('#' + k).classList.add('bad'); };
  const newPeer = (name, phone) => ({ id: Math.max(0, ...S.peers.map(x => x.id)) + 1, name, phone, status: 'pending', paired: false, fav: false, allow: true, lat: null, lng: null, ts: null, dist: null, bearing: null, log: [], req: null });
  function openAdd(p) {
    S.edit = p ? p.id : null; clearErr();
    $('#addSheet').classList.toggle('edit', !!p);
    $('#addTitle').textContent = p ? 'Edit nickname' : 'Add a peer';
    $('#phone').value = p ? p.phone : ''; $('#phone').disabled = !!p; $('#nick').value = p ? p.name : '';
    $('#me').value = ls.get(MEKEY) || ''; $('#allow').checked = true;
    $('#send').textContent = p ? 'Save Changes' : 'Send Handshake Request';
    $('#addSheet').classList.add('show');
  }
  function submitAdd() {
    clearErr();
    const nick = $('#nick').value.replace(/[<>"'`&|]/g, '').trim();
    if (!nick) fail('nick', 'Nickname is required');
    if (S.edit) { // Update
      const p = find(S.edit); if (!nick || !p) return;
      p.name = nick; log(p, 'Nickname changed'); DB.update(p); $('#addSheet').classList.remove('show'); render(); return toast('Peer updated');
    }
    const raw = $('#phone').value.replace(/[\s\-().]/g, ''), me = $('#me').value.replace(/[<>"'`&|]/g, '').trim();
    let ok = !!nick;
    if (!validPhone(raw)) { fail('phone', 'Enter a valid PH number, e.g. 0917 123 4567'); ok = false; }
    else if (S.peers.some(p => norm(p.phone) === norm(raw))) { fail('phone', 'This number is already in your peers'); ok = false; }
    if (!me) { fail('me', 'Enter your name so the peer knows who is asking'); ok = false; }
    if (!ok) return;
    ls.set(MEKEY, me);
    const p = newPeer(nick, fmtPhone(raw)); p.allow = $('#allow').checked;
    S.peers.unshift(p); DB.insert(p); // Create
    closeAll(); S.sel = p.id; render();
    Handshake.start(p, me).then(sent => toast(sent ? 'Request sent. Give them the code shown.' : 'Saved, but SMS could not be sent (plugin missing?)'));
  }
  function importContact() {
    const fill = (n, ph) => { $('#nick').value = (n || '').slice(0, 20); $('#phone').value = ph || ''; toast('Contact imported'); };
    if (navigator.contacts && navigator.contacts.pickContact) navigator.contacts.pickContact(c => fill(c.displayName || (c.name && c.name.formatted), c.phoneNumbers && c.phoneNumbers[0] && c.phoneNumbers[0].value), () => {});
    else fill('Ate Joy', '0936 555 0177'); // demo fallback when cordova-plugin-contacts is missing
  }

  /* ---- Consent (peer side of the handshake) ---- */
  function openConsent(p) {
    S.consent = p.id;
    $('#coTitle').textContent = p.name + ' wants to see your location';
    $('#coBody').textContent = 'Request from ' + p.phone + '. To allow it, type the 6-digit code they give you. Decline if you do not know them.';
    $('#coCode').value = ''; $('#coErr').textContent = ''; $('#consent').classList.add('show');
  }
  function wireConsent() {
    $('#coAllow').onclick = () => {
      const p = find(S.consent), code = $('#coCode').value.trim();
      if (!p || !p.req) return $('#consent').classList.remove('show');
      if (!/^\d{6}$/.test(code)) return ($('#coErr').textContent = 'Enter the 6-digit code');
      $('#consent').classList.remove('show');
      Handshake.accept(p, code).then(ok => toast(ok ? 'Consent sent. Waiting for confirmation' : 'Could not send consent by SMS'));
    };
    $('#coNo').onclick = () => { const p = find(S.consent); $('#consent').classList.remove('show'); if (p && p.req) { Handshake.decline(p); toast('Request declined'); } };
  }
  const handshakeCtx = {
    peers: () => S.peers, save: p => DB.update(p), changed: render, say: toast, consent: openConsent,
    create: (name, addr) => { const p = newPeer(name, fmtPhone(addr)); S.peers.unshift(p); DB.insert(p); return p; },
    remove: p => { S.peers = S.peers.filter(x => x !== p); DB.remove(p.id); if (S.sel === p.id) closeAll(); render(); }
  };

  /* ---- Wiring ---- */
  function init() {
    applyTheme(currentTheme());
    $('#theme').onclick = () => applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    $('#net').onclick = setNet;
    $('#q').oninput = e => { S.q = e.target.value; render(); };
    $('#sort').onchange = e => { S.sort = e.target.value; render(); };
    $('#chips').onclick = e => { const f = e.target.dataset.f; if (f) { S.f = f; render(); } };
    $('#list').onclick = e => { const c = e.target.closest('.card'); if (!c) return; const p = find(+c.dataset.id), a = e.target.dataset.act; if (a) act(p, a, e.target); else { S.sel = p.id; detail(p); } };
    $('#detailBody').onclick = e => { const p = find(S.sel), a = e.target.dataset.act; if (p && a && a !== 'allow') act(p, a, e.target); };
    $('#detailBody').onchange = e => { const p = find(S.sel); if (p && e.target.dataset.act === 'allow') act(p, 'allow', e.target); };
    $('#add').onclick = () => openAdd(); $('#cancel').onclick = () => $('#addSheet').classList.remove('show'); $('#send').onclick = submitAdd; $('#import').onclick = importContact;
    $('#cNo').onclick = () => $('#confirm').classList.remove('show');
    $('#cYes').onclick = () => { const id = S.del; S.peers = S.peers.filter(p => p.id !== id); DB.remove(id); closeAll(); render(); toast('Peer deleted'); }; // Delete
    wireConsent();
    ['#detail', '#addSheet', '#confirm'].forEach(s => $(s).addEventListener('click', e => { if (e.target.id === s.slice(1)) { s === '#detail' ? closeAll() : $(s).classList.remove('show'); } }));
    document.addEventListener('backbutton', () => { // Android hardware back button
      const open = ['#confirm', '#consent', '#addSheet', '#detail'].find(s => $(s).classList.contains('show'));
      if (open) { open === '#detail' ? closeAll() : $(open).classList.remove('show'); }
      else if (navigator.app && navigator.app.exitApp) navigator.app.exitApp();
    }, false);
    setInterval(() => { if (!document.querySelector('.overlay.show')) render(); }, 30000);
    DB.open().then(() => DB.all()).then(rows => { S.peers = rows; render(); Handshake.init(handshakeCtx); })
      .catch(e => { console.error(e); toast('Database error: ' + e); render(); });
    window.TAP = { simulate: Handshake.handle }; // dev helper: TAP.simulate('5556', 'TAP1|...') fakes an incoming SMS
  }
  let started = false;
  const start = () => { if (!started) { started = true; init(); } };
  document.addEventListener('deviceready', start, false);
  document.addEventListener('DOMContentLoaded', () => setTimeout(start, window.cordova ? 1500 : 0));
})();
