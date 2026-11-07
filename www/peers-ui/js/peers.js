(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const KEY = 'tap.peers', TKEY = 'tap.theme';

  /* ---- Service layer: swap these stubs for real Cordova plugins later (SMS, GPS, contacts) ---- */
  const SmsService = { send: (peer, kind) => new Promise(r => setTimeout(r, 1400)) };

  const STATUS = { active: ['2G SMS Active', 'ok'], queue: ['Offline Queueing', 'warn'], pending: ['Handshake Pending', 'info'] };
  const NETS = [['2G SMS Active', 'ok', 'sms'], ['Offline Queueing', 'warn', 'queue'], ['No Signal', 'danger', 'none']];
  const COLORS = ['#0f766e', '#b45309', '#7c3aed', '#be185d', '#15803d', '#475569'];
  const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  const seed = () => { const m = 60000, n = Date.now(); return [
    { id: 1, name: 'Mika Reyes', phone: '0917 555 0142', status: 'active', paired: true, fav: true, allow: true, lat: 14.5995, lng: 120.9842, ts: n - 4 * m, dist: 1.2, bearing: 45, log: [{ t: n - 4 * m, x: 'Location received' }, { t: n - 5 * m, x: 'Ping sent via SMS' }] },
    { id: 2, name: 'Jun Dela Cruz', phone: '0928 555 0199', status: 'queue', paired: true, fav: false, allow: true, lat: 14.6091, lng: 120.9822, ts: n - 37 * m, dist: 3.8, bearing: 280, log: [{ t: n - 36 * m, x: 'Ping queued, waiting for signal' }, { t: n - 37 * m, x: 'Location received' }] },
    { id: 3, name: 'Mama', phone: '0905 555 0123', status: 'pending', paired: false, fav: true, allow: true, lat: null, lng: null, ts: null, dist: null, bearing: null, log: [{ t: n - 2 * m, x: 'Handshake request sent' }] }
  ]; };

  const S = { peers: [], net: 'sms', outbox: [], f: 'all', q: '', sort: 'recent', sel: null, del: null };
  let ni = 0;

  const load = () => { try { const d = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(d)) return d; } catch (e) {} return seed(); };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S.peers)); } catch (e) {} };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ago = t => { if (!t) return 'No location yet'; const m = Math.floor((Date.now() - t) / 60000); return m < 1 ? 'Just now' : m < 60 ? m + ' min ago' : Math.floor(m / 60) + ' hr ago'; };
  const clock = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const ini = n => n.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const dir = b => DIRS[Math.round(b / 45) % 8];
  const distTxt = p => p.dist == null ? 'Distance unknown' : p.dist + ' km ' + dir(p.bearing);
  const find = id => S.peers.find(p => p.id === id);
  const log = (p, x) => { p.log.unshift({ t: Date.now(), x }); p.log = p.log.slice(0, 20); };
  const buzz = () => { try { navigator.vibrate && navigator.vibrate(15); } catch (e) {} };
  function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('show'), 2400); }

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

  /* ---- Filtering and sorting ---- */
  function visible() {
    const q = S.q.trim().toLowerCase();
    let a = S.peers.filter(p => (S.f === 'all' || (S.f === 'fav' ? p.fav : p.status === S.f)) && (!q || p.name.toLowerCase().includes(q) || p.phone.replace(/\s/g, '').includes(q.replace(/\s/g, ''))));
    const cmp = { recent: (x, y) => (y.ts || 0) - (x.ts || 0), near: (x, y) => (x.dist ?? 1e9) - (y.dist ?? 1e9), name: (x, y) => x.name.localeCompare(y.name) }[S.sort];
    return a.sort((x, y) => (y.fav - x.fav) || cmp(x, y));
  }

  /* ---- Rendering ---- */
  function cardHTML(p) {
    const [l, k] = STATUS[p.status];
    return `<article class="card" data-id="${p.id}">
      <div class="row"><div class="av" style="background:${COLORS[p.id % COLORS.length]}">${esc(ini(p.name))}</div>
        <div class="meta"><b>${esc(p.name)}${p.fav ? ' ★' : ''}</b><span>${esc(p.phone)}</span></div>
        <span class="badge ${k}">${l}</span></div>
      <div class="info"><span>📍 ${distTxt(p)}</span><span>🕒 ${ago(p.ts)}</span></div>
      <div class="quick"><button class="btn sm primary" data-act="ping" ${p.paired ? '' : 'disabled'}>Ping via SMS</button><button class="btn sm" data-act="refresh" ${p.paired ? '' : 'disabled'}>Refresh</button></div></article>`;
  }
  function render() {
    const n = k => S.peers.filter(p => p.status === k).length;
    $('#sub').textContent = `${S.peers.length} peers · ${n('active')} active · ${n('pending')} pending`;
    const chips = [['all', 'All', S.peers.length], ['active', 'Active', n('active')], ['queue', 'Queued', n('queue')], ['pending', 'Pending', n('pending')], ['fav', '★ Favourites', S.peers.filter(p => p.fav).length]];
    $('#chips').innerHTML = chips.map(c => `<button class="chip ${S.f === c[0] ? 'on' : ''}" data-f="${c[0]}">${c[1]} ${c[2]}</button>`).join('');
    const v = visible();
    $('#list').innerHTML = v.length ? v.map(cardHTML).join('') : `<div class="empty">${S.peers.length ? 'No peers match your filter.' : 'No peers yet.<br>Tap “Add Peer” to send a handshake request.'}</div>`;
    const b = $('#banner');
    b.hidden = !(S.net !== 'sms' || S.outbox.length);
    b.textContent = S.net === 'none' ? `No signal. ${S.outbox.length} message(s) waiting; they send when signal returns.` : `Offline queueing: ${S.outbox.length} message(s) waiting for SMS signal.`;
    if (S.sel) detail(find(S.sel));
  }
  function detail(p) {
    if (!p) return closeAll();
    const [l, k] = STATUS[p.status];
    $('#detailBody').innerHTML = `<div class="grab"></div>
      <div class="row head"><div class="av lg" style="background:${COLORS[p.id % COLORS.length]}">${esc(ini(p.name))}</div>
        <div class="meta"><b>${esc(p.name)}</b><span>${esc(p.phone)}</span></div>
        <button class="icon-btn" data-act="fav" aria-label="Toggle favourite">${p.fav ? '★' : '☆'}</button></div>
      <span class="badge ${k}">${l}</span>
      <div class="grid2">
        <div class="tile"><small>Distance</small><b>${distTxt(p)}</b></div>
        <div class="tile"><small>Last update</small><b>${ago(p.ts)}</b></div>
        <div class="tile"><small>Coordinates</small><b>${p.lat == null ? 'Not shared yet' : p.lat + ', ' + p.lng}</b></div>
        <div class="tile"><small>Bearing</small>${p.bearing == null ? '<b>Unknown</b>' : `<span class="needle"><i style="transform:rotate(${p.bearing}deg)">↑</i></span><b>${dir(p.bearing)} ${p.bearing}°</b>`}</div>
      </div>
      <label class="switch-row"><span>Allow this peer to request my location</span><input type="checkbox" data-act="allow" ${p.allow ? 'checked' : ''}></label>
      <h3>Activity</h3><ul class="log">${p.log.slice(0, 5).map(e => `<li>${esc(e.x)}<span>${clock(e.t)}</span></li>`).join('')}</ul>
      <div class="actions">
        <button class="btn primary" data-act="ping" ${p.paired ? '' : 'disabled'}>Ping via SMS</button>
        <button class="btn" data-act="refresh" ${p.paired ? '' : 'disabled'}>Refresh Location</button>
        <button class="btn" data-act="pair" ${p.paired ? 'disabled' : ''}>${p.paired ? 'Paired ✓' : 'Pair Device'}</button>
        <button class="btn del" data-act="del">Delete Peer</button></div>`;
    $('#detail').classList.add('show');
  }
  function closeAll() { S.sel = null; ['#detail', '#addSheet', '#confirm'].forEach(s => $(s).classList.remove('show')); }

  /* ---- Actions ---- */
  function run(p, kind) {
    p.status = 'queue'; render();
    SmsService.send(p, kind).then(() => {
      p.status = 'active'; p.paired = true; p.ts = Date.now();
      if (p.dist == null) { p.dist = +(Math.random() * 4 + 0.3).toFixed(1); p.bearing = Math.floor(Math.random() * 360); p.lat = +(14.55 + Math.random() * 0.1).toFixed(5); p.lng = +(120.95 + Math.random() * 0.1).toFixed(5); }
      log(p, kind === 'pair' ? 'Handshake accepted' : 'Location received'); save(); render(); toast('Location received from ' + p.name);
    });
  }
  function request(p, kind) {
    if (kind !== 'pair' && !p.paired) return toast('Pair with ' + p.name + ' first');
    buzz();
    if (S.net !== 'sms') {
      if (kind !== 'pair') p.status = 'queue';
      S.outbox.push({ id: p.id, kind }); log(p, 'Queued, waiting for signal'); save(); render(); return toast('No SMS signal. Message queued.');
    }
    log(p, kind === 'pair' ? 'Handshake request sent' : 'Ping sent via SMS'); toast(kind === 'pair' ? 'Handshake request sent' : 'SMS ping sent to ' + p.name);
    run(p, kind);
  }
  function setNet() {
    ni = (ni + 1) % 3; S.net = NETS[ni][2];
    const b = $('#net'); b.textContent = NETS[ni][0]; b.className = 'badge ' + NETS[ni][1];
    if (S.net === 'sms') { const items = S.outbox.splice(0); items.forEach((o, i) => { const p = find(o.id); if (p) setTimeout(() => run(p, o.kind), i * 700); }); toast(items.length ? 'Signal back. Sending ' + items.length + ' queued message(s)' : '2G SMS active'); }
    render();
  }
  function act(p, a, el) {
    if (a === 'ping') request(p, 'ping');
    else if (a === 'pair') request(p, 'pair');
    else if (a === 'refresh') { if (!p.paired) return toast('Pair with ' + p.name + ' first'); toast('Latest saved location · ' + ago(p.ts).toLowerCase()); }
    else if (a === 'fav') { p.fav = !p.fav; save(); render(); }
    else if (a === 'allow') { p.allow = el.checked; log(p, p.allow ? 'Tracking allowed' : 'Tracking blocked'); save(); render(); }
    else if (a === 'del') { S.del = p.id; $('#cTitle').textContent = 'Delete ' + p.name + '?'; $('#confirm').classList.add('show'); }
  }

  /* ---- Add peer form ---- */
  const clearErr = () => ['phone', 'nick'].forEach(k => { $('#' + k + 'Err').textContent = ''; $('#' + k).classList.remove('bad'); });
  const fail = (k, m) => { $('#' + k + 'Err').textContent = m; $('#' + k).classList.add('bad'); };
  function openAdd() { $('#phone').value = $('#nick').value = ''; $('#allow').checked = true; clearErr(); $('#addSheet').classList.add('show'); }
  function submitAdd() {
    clearErr();
    const raw = $('#phone').value.replace(/[\s\-().]/g, ''), nick = $('#nick').value.replace(/[<>"'`&]/g, '').trim();
    let ok = true;
    if (!/^(09\d{9}|\+639\d{9})$/.test(raw)) { fail('phone', 'Enter a valid PH number, e.g. 0917 123 4567'); ok = false; }
    else if (S.peers.some(p => p.phone.replace(/\s/g, '').slice(-10) === raw.slice(-10))) { fail('phone', 'This number is already in your peers'); ok = false; }
    if (!nick) { fail('nick', 'Nickname is required'); ok = false; }
    if (!ok) return;
    const d = raw.slice(-10), id = Math.max(0, ...S.peers.map(p => p.id)) + 1;
    S.peers.unshift({ id, name: nick, phone: '0' + d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6), status: 'pending', paired: false, fav: false, allow: $('#allow').checked, lat: null, lng: null, ts: null, dist: null, bearing: null, log: [{ t: Date.now(), x: S.net === 'sms' ? 'Handshake request sent' : 'Handshake queued, waiting for signal' }] });
    save(); closeAll(); render(); toast(S.net === 'sms' ? 'Handshake request sent via SMS' : 'Handshake queued until signal returns');
  }
  function importContact() {
    const fill = (n, ph) => { $('#nick').value = (n || '').slice(0, 20); $('#phone').value = ph || ''; toast('Contact imported'); };
    if (navigator.contacts && navigator.contacts.pickContact) navigator.contacts.pickContact(c => fill(c.displayName || (c.name && c.name.formatted), c.phoneNumbers && c.phoneNumbers[0] && c.phoneNumbers[0].value), () => {});
    else fill('Ate Joy', '0936 555 0177'); // demo fallback when cordova-plugin-contacts is missing
  }

  /* ---- Wiring ---- */
  function init() {
    S.peers = load(); applyTheme(currentTheme());
    $('#theme').onclick = () => applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    $('#net').onclick = setNet;
    $('#q').oninput = e => { S.q = e.target.value; render(); };
    $('#sort').onchange = e => { S.sort = e.target.value; render(); };
    $('#chips').onclick = e => { const f = e.target.dataset.f; if (f) { S.f = f; render(); } };
    $('#list').onclick = e => { const c = e.target.closest('.card'); if (!c) return; const p = find(+c.dataset.id), a = e.target.dataset.act; if (a) act(p, a, e.target); else { S.sel = p.id; detail(p); } };
    $('#detailBody').onclick = e => { const p = find(S.sel), a = e.target.dataset.act; if (p && a && a !== 'allow') act(p, a, e.target); };
    $('#detailBody').onchange = e => { const p = find(S.sel); if (p && e.target.dataset.act === 'allow') act(p, 'allow', e.target); };
    $('#add').onclick = openAdd; $('#cancel').onclick = closeAll; $('#send').onclick = submitAdd; $('#import').onclick = importContact;
    $('#cNo').onclick = () => $('#confirm').classList.remove('show');
    $('#cYes').onclick = () => { S.peers = S.peers.filter(p => p.id !== S.del); save(); closeAll(); render(); toast('Peer deleted'); };
    ['#detail', '#addSheet', '#confirm'].forEach(s => $(s).addEventListener('click', e => { if (e.target.id === s.slice(1)) { s === '#detail' ? closeAll() : $(s).classList.remove('show'); } }));
    document.addEventListener('backbutton', () => { // Android hardware back button
      const open = ['#confirm', '#addSheet', '#detail'].find(s => $(s).classList.contains('show'));
      if (open) { open === '#detail' ? closeAll() : $(open).classList.remove('show'); }
      else if (navigator.app && navigator.app.exitApp) navigator.app.exitApp();
    }, false);
    setInterval(() => { if (!document.querySelector('.overlay.show')) render(); }, 30000);
    render();
  }
  let started = false;
  const start = () => { if (!started) { started = true; init(); } };
  document.addEventListener('deviceready', start, false);
  document.addEventListener('DOMContentLoaded', () => setTimeout(start, window.cordova ? 1500 : 0));
})();
