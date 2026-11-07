/* Local database. Uses SQLite on the phone (cordova-sqlite-storage) and falls back to
   localStorage in the browser, so the same calls work in both places.
   The main page owns the real connection (window.TraceDB); the peers iframe delegates to it,
   because native plugin callbacks only reach the top window. */
const DB = (() => {
  const COLS = ['id', 'name', 'phone', 'status', 'paired', 'fav', 'allow', 'lat', 'lng', 'ts', 'dist', 'bearing', 'log', 'req'];
  const LS = 'tap.peers.v2', LS_HISTORY = 'tap.history.v1';
  const HISTORY_LIMIT = 200; // received locations kept per peer
  let sql = null, opening = null;

  const pack = p => COLS.map(c => c === 'log' || c === 'req' ? JSON.stringify(p[c] ?? null) : ['paired', 'fav', 'allow'].includes(c) ? +!!p[c] : (p[c] ?? null));
  const unpack = r => ({ ...r, paired: !!r.paired, fav: !!r.fav, allow: !!r.allow, log: JSON.parse(r.log || '[]') || [], req: JSON.parse(r.req || 'null') });
  const lsRead = (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch (e) { return []; } };
  const lsWrite = (k, a) => { try { localStorage.setItem(k, JSON.stringify(a)); } catch (e) {} };
  // db.executeSql calls back with (resultSet) only, while transaction.executeSql uses (tx, resultSet): take the last argument.
  const run = (q, a = []) => new Promise((ok, no) => sql.executeSql(q, a, (...r) => ok(r[r.length - 1]), (...e) => no(e[e.length - 1])));
  const rowsOf = r => Array.from({ length: r.rows.length }, (_, i) => r.rows.item(i));

  // On a device, wait for deviceready so the SQLite plugin exists before choosing a storage engine.
  const whenReady = () => (window.sqlitePlugin || !window.cordova) ? Promise.resolve()
    : new Promise(ok => { document.addEventListener('deviceready', () => ok(), { once: true }); setTimeout(ok, 5000); });

  const upsert = p => {
    if (!sql) { const a = lsRead(LS), i = a.findIndex(x => x.id === p.id); i < 0 ? a.push(p) : a[i] = p; lsWrite(LS, a); return Promise.resolve(); }
    return run('INSERT OR REPLACE INTO peers (' + COLS.join(',') + ') VALUES (' + COLS.map(() => '?').join(',') + ')', pack(p));
  };

  const local = {
    kind: () => sql ? 'SQLite' : 'Local storage',
    open() {
      opening = opening || whenReady().then(() => {
        if (!window.sqlitePlugin) return;
        sql = window.sqlitePlugin.openDatabase({ name: 'traceapeer.db', location: 'default' });
        return run('CREATE TABLE IF NOT EXISTS peers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, status TEXT, paired INTEGER, fav INTEGER, allow INTEGER, lat REAL, lng REAL, ts INTEGER, dist REAL, bearing INTEGER, log TEXT, req TEXT)')
          .then(() => run('CREATE TABLE IF NOT EXISTS peer_locations (id INTEGER PRIMARY KEY AUTOINCREMENT, peer_id INTEGER NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, ts INTEGER NOT NULL, dist REAL, bearing INTEGER)'))
          .then(() => run('CREATE INDEX IF NOT EXISTS idx_peer_locations_peer ON peer_locations (peer_id, ts)'));
      }).catch(e => { opening = null; sql = null; throw e; });
      return opening;
    },
    all() { // Read
      if (!sql) return Promise.resolve(lsRead(LS));
      return run('SELECT * FROM peers ORDER BY id').then(r => rowsOf(r).map(unpack));
    },
    insert: upsert, // Create
    update: upsert, // Update
    remove(id) {    // Delete (the peer and its location history)
      if (!sql) { lsWrite(LS, lsRead(LS).filter(x => x.id !== id)); lsWrite(LS_HISTORY, lsRead(LS_HISTORY).filter(x => x.peer_id !== id)); return Promise.resolve(); }
      return run('DELETE FROM peer_locations WHERE peer_id = ?', [id]).then(() => run('DELETE FROM peers WHERE id = ?', [id]));
    },
    addLocation(rec) { // History: one row per location received by SMS
      const row = [rec.peer_id, rec.lat, rec.lng, rec.ts, rec.dist ?? null, rec.bearing ?? null];
      if (!sql) {
        const h = lsRead(LS_HISTORY); h.push({ peer_id: rec.peer_id, lat: rec.lat, lng: rec.lng, ts: rec.ts, dist: row[4], bearing: row[5] });
        const mine = h.filter(x => x.peer_id === rec.peer_id).sort((a, b) => b.ts - a.ts).slice(HISTORY_LIMIT);
        lsWrite(LS_HISTORY, h.filter(x => !mine.includes(x))); return Promise.resolve();
      }
      return run('INSERT INTO peer_locations (peer_id, lat, lng, ts, dist, bearing) VALUES (?,?,?,?,?,?)', row)
        .then(() => run('DELETE FROM peer_locations WHERE peer_id = ? AND id NOT IN (SELECT id FROM peer_locations WHERE peer_id = ? ORDER BY ts DESC LIMIT ?)', [rec.peer_id, rec.peer_id, HISTORY_LIMIT]));
    },
    clearHistory() { // Wipes received-location history, last known positions and activity logs; peers themselves are kept
      const wipe = p => ({ ...p, log: [], lat: null, lng: null, ts: null, dist: null, bearing: null });
      if (!sql) {
        const removed = lsRead(LS_HISTORY).length;
        lsWrite(LS_HISTORY, []); lsWrite(LS, lsRead(LS).map(wipe));
        return Promise.resolve({ locations: removed });
      }
      return run('DELETE FROM peer_locations').then(r => run("UPDATE peers SET log = '[]', lat = NULL, lng = NULL, ts = NULL, dist = NULL, bearing = NULL").then(() => ({ locations: r.rowsAffected })));
    }
  };

  const shared = () => { try { const h = window.parent; if (h && h !== window && h.TraceDB) return h.TraceDB; } catch (e) {} return local; };
  const api = {};
  Object.keys(local).forEach(k => { api[k] = (...a) => shared()[k](...a); });
  window.TraceDB = local;
  return api;
})();
