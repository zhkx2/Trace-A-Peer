/* Local database. Uses SQLite on the phone (cordova-sqlite-storage) and falls back to
   localStorage in the browser, so the same CRUD calls work in both places. */
const DB = (() => {
  const COLS = ['id', 'name', 'phone', 'status', 'paired', 'fav', 'allow', 'lat', 'lng', 'ts', 'dist', 'bearing', 'log', 'req'];
  const LS = 'tap.peers.v2';
  let sql = null;
  const pack = p => COLS.map(c => c === 'log' || c === 'req' ? JSON.stringify(p[c] ?? null) : ['paired', 'fav', 'allow'].includes(c) ? +!!p[c] : (p[c] ?? null));
  const unpack = r => ({ ...r, paired: !!r.paired, fav: !!r.fav, allow: !!r.allow, log: JSON.parse(r.log || '[]') || [], req: JSON.parse(r.req || 'null') });
  const lsAll = () => { try { return JSON.parse(localStorage.getItem(LS)) || []; } catch (e) { return []; } };
  const lsSave = a => { try { localStorage.setItem(LS, JSON.stringify(a)); } catch (e) {} };
  const run = (q, a = []) => new Promise((ok, no) => sql.executeSql(q, a, (_, r) => ok(r), (_, e) => no(e)));
  const upsert = p => {
    if (!sql) { const a = lsAll(), i = a.findIndex(x => x.id === p.id); i < 0 ? a.push(p) : a[i] = p; lsSave(a); return Promise.resolve(); }
    return run('INSERT OR REPLACE INTO peers (' + COLS.join(',') + ') VALUES (' + COLS.map(() => '?').join(',') + ')', pack(p));
  };
  return {
    kind: () => sql ? 'SQLite' : 'Local storage',
    open() {
      if (!window.sqlitePlugin) return Promise.resolve();
      sql = window.sqlitePlugin.openDatabase({ name: 'traceapeer.db', location: 'default' });
      return run('CREATE TABLE IF NOT EXISTS peers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, status TEXT, paired INTEGER, fav INTEGER, allow INTEGER, lat REAL, lng REAL, ts INTEGER, dist REAL, bearing INTEGER, log TEXT, req TEXT)');
    },
    all() { // Read
      if (!sql) return Promise.resolve(lsAll());
      return run('SELECT * FROM peers ORDER BY id').then(r => Array.from({ length: r.rows.length }, (_, i) => unpack(r.rows.item(i))));
    },
    insert: upsert, // Create
    update: upsert, // Update
    remove(id) {    // Delete
      if (!sql) { lsSave(lsAll().filter(x => x.id !== id)); return Promise.resolve(); }
      return run('DELETE FROM peers WHERE id = ?', [id]);
    }
  };
})();
