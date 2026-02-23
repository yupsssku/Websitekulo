const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// KONFIGURASI — WAJIB SESUAIKAN
// ============================================================
const CONFIG = {
  API_KEY:        process.env.API_KEY        || 'API_KEY',
  API_BASE:       'https://www.rumahotp.com',
  PROFIT_NOKOS:   parseInt(process.env.PROFIT_NOKOS   || '500'),
  PROFIT_DEPOSIT: parseInt(process.env.PROFIT_DEPOSIT || '500'),
  MIN_DEPOSIT:    parseInt(process.env.MIN_DEPOSIT    || '2000'),
  SESSION_SECRET: process.env.SESSION_SECRET || 'vsim-ultra-secret-2025',
  SITE_NAME:      process.env.SITE_NAME      || 'Jeeyhosting',
  ADMIN_CODE:     process.env.ADMIN_CODE     || 'ADMIN2025',
};

// ============================================================
// DATABASE
// ============================================================
const DB_PATH = path.join(__dirname, 'database', 'data.db');
if (!fs.existsSync(path.join(__dirname, 'database'))) {
  fs.mkdirSync(path.join(__dirname, 'database'), { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    email       TEXT    UNIQUE NOT NULL,
    password    TEXT    NOT NULL,
    saldo       INTEGER DEFAULT 0,
    is_admin    INTEGER DEFAULT 0,
    is_banned   INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS orders (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    order_id     TEXT    UNIQUE,
    service      TEXT,
    country      TEXT,
    operator     TEXT,
    phone_number TEXT,
    otp_code     TEXT    DEFAULT '-',
    price        INTEGER DEFAULT 0,
    status       TEXT    DEFAULT 'pending',
    expires_at   INTEGER,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS deposits (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    deposit_id TEXT,
    amount     INTEGER DEFAULT 0,
    received   INTEGER DEFAULT 0,
    fee        INTEGER DEFAULT 0,
    status     TEXT    DEFAULT 'pending',
    method     TEXT    DEFAULT 'QRIS',
    qr_image   TEXT,
    expired_at INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS saldo_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    admin_id   INTEGER,
    type       TEXT,
    amount     INTEGER,
    before_bal INTEGER DEFAULT 0,
    after_bal  INTEGER DEFAULT 0,
    note       TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: CONFIG.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true }
}));

// ============================================================
// HELPERS
// ============================================================
async function apiGet(endpoint, params = {}) {
  try {
    const res = await axios.get(CONFIG.API_BASE + endpoint, {
      params,
      headers: { 'x-apikey': CONFIG.API_KEY, 'Accept': 'application/json' },
      timeout: 30000,
    });
    return res.data;
  } catch (e) {
    console.error('[API ERROR]', e.message);
    return { success: false, message: e.message };
  }
}

const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const nowTs = () => Math.floor(Date.now() / 1000);

const auth = (req, res, next) => {
  if (!req.session.userId) return res.json({ ok: false, msg: 'Sesi habis, login ulang', code: 401 });
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.session.userId);
  if (!user) return res.json({ ok: false, msg: 'User tidak ditemukan', code: 401 });
  if (user.is_banned) return res.json({ ok: false, msg: 'Akun kamu telah diblokir oleh admin', code: 403 });
  req.user = user;
  next();
};

const adminAuth = (req, res, next) => {
  auth(req, res, () => {
    if (!req.user.is_admin) return res.json({ ok: false, msg: 'Akses admin ditolak', code: 403 });
    next();
  });
};

// ============================================================
// AUTH ROUTES
// ============================================================
app.post('/api/register', async (req, res) => {
  const { name, email, password, admin_code } = req.body;
  if (!name?.trim() || !email?.trim() || !password) return res.json({ ok: false, msg: 'Semua field wajib diisi' });
  if (password.length < 6) return res.json({ ok: false, msg: 'Password minimal 6 karakter' });
  const emailRgx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRgx.test(email)) return res.json({ ok: false, msg: 'Format email tidak valid' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const isAdmin = admin_code === CONFIG.ADMIN_CODE ? 1 : 0;
    const result = db.prepare('INSERT INTO users (name,email,password,is_admin) VALUES (?,?,?,?)').run(name.trim(), email.toLowerCase().trim(), hash, isAdmin);
    req.session.userId = result.lastInsertRowid;
    res.json({ ok: true, admin: isAdmin === 1 });
  } catch (e) {
    res.json({ ok: false, msg: 'Email sudah terdaftar' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ ok: false, msg: 'Isi email dan password' });
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email.toLowerCase().trim());
  if (!user) return res.json({ ok: false, msg: 'Email atau password salah' });
  if (user.is_banned) return res.json({ ok: false, msg: 'Akun kamu telah diblokir oleh admin' });
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.json({ ok: false, msg: 'Email atau password salah' });
  req.session.userId = user.id;
  res.json({ ok: true, admin: user.is_admin === 1 });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', auth, (req, res) => {
  const u = req.user;
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM orders WHERE user_id=?) as total_orders,
      (SELECT COUNT(*) FROM deposits WHERE user_id=? AND status='success') as total_deps,
      (SELECT COALESCE(SUM(received),0) FROM deposits WHERE user_id=? AND status='success') as total_depo_amount
  `).get(u.id, u.id, u.id);
  res.json({
    ok: true,
    data: {
      id: u.id,
      name: u.name,
      email: u.email,
      saldo: u.saldo,
      saldo_f: rp(u.saldo),
      is_admin: u.is_admin,
      total_orders: stats.total_orders,
      total_deps: stats.total_deps,
      total_depo_amount: rp(stats.total_depo_amount),
      joined: u.created_at,
    }
  });
});

// ============================================================
// SERVICES & ORDER ROUTES
// ============================================================
app.get('/api/services', auth, async (req, res) => {
  const data = await apiGet('/api/v2/services');
  if (!data.success) return res.json({ ok: false, msg: 'Gagal memuat layanan dari server' });
  res.json({ ok: true, data: data.data });
});

app.get('/api/countries', auth, async (req, res) => {
  const { sid } = req.query;
  if (!sid) return res.json({ ok: false, msg: 'service_id wajib' });
  const data = await apiGet('/api/v2/countries', { service_id: sid });
  if (!data.success) return res.json({ ok: false, msg: 'Gagal memuat daftar negara' });
  const list = (data.data || [])
    .filter(c => c.pricelist && c.pricelist.length > 0)
    .map(c => ({
      ...c,
      pricelist: c.pricelist.map(p => ({
        ...p,
        orig_price: p.price,
        price: p.price + CONFIG.PROFIT_NOKOS,
        price_f: rp(p.price + CONFIG.PROFIT_NOKOS),
      }))
    }));
  res.json({ ok: true, data: list });
});

app.get('/api/operators', auth, async (req, res) => {
  const { country, pid } = req.query;
  const data = await apiGet('/api/v2/operators', { country, provider_id: pid });
  res.json({ ok: true, data: data.data || [] });
});

app.post('/api/order', auth, async (req, res) => {
  const { nid, pid, oid, price } = req.body;
  const finalPrice = parseInt(price);
  if (!finalPrice || finalPrice <= 0) return res.json({ ok: false, msg: 'Harga tidak valid' });
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (user.saldo < finalPrice) return res.json({ ok: false, msg: 'Saldo tidak cukup! Silakan top up terlebih dahulu.' });
  const data = await apiGet('/api/v2/orders', { number_id: nid, provider_id: pid, operator_id: oid });
  if (!data.success || !data.data) return res.json({ ok: false, msg: 'Gagal order. Stok habis, coba provider lain.' });
  const d = data.data;
  db.prepare('UPDATE users SET saldo=saldo-? WHERE id=?').run(finalPrice, user.id);
  const exp = nowTs() + (d.expires_in_minute * 60);
  db.prepare('INSERT INTO orders (user_id,order_id,service,country,operator,phone_number,price,status,expires_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(user.id, d.order_id, d.service, d.country, d.operator, d.phone_number, finalPrice, 'pending', exp);
  const updUser = db.prepare('SELECT saldo FROM users WHERE id=?').get(user.id);
  res.json({
    ok: true,
    data: {
      order_id:   d.order_id,
      phone:      d.phone_number,
      service:    d.service,
      country:    d.country,
      operator:   d.operator,
      price_f:    rp(finalPrice),
      status:     d.status || 'pending',
      expires:    d.expires_in_minute,
      saldo_f:    rp(updUser.saldo),
      saldo:      updUser.saldo,
    }
  });
});

app.get('/api/check_otp', auth, async (req, res) => {
  const { oid } = req.query;
  const order = db.prepare('SELECT * FROM orders WHERE order_id=? AND user_id=?').get(oid, req.user.id);
  if (!order) return res.json({ ok: false, msg: 'Order tidak ditemukan' });
  if (order.status === 'completed') return res.json({ ok: true, otp: order.otp_code, status: 'completed', phone: order.phone_number });
  const data = await apiGet('/api/v1/orders/get_status', { order_id: oid });
  if (!data.data) return res.json({ ok: false, msg: 'Gagal cek status' });
  const d = data.data;
  const otp = (d.otp_code && d.otp_code !== '-') ? d.otp_code : null;
  if (otp) db.prepare("UPDATE orders SET otp_code=?,status='completed' WHERE order_id=?").run(otp, oid);
  res.json({ ok: true, otp, status: d.status, phone: d.phone_number });
});

app.post('/api/cancel_order', auth, async (req, res) => {
  const { oid } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE order_id=? AND user_id=?').get(oid, req.user.id);
  if (!order) return res.json({ ok: false, msg: 'Order tidak ditemukan' });
  if (order.status !== 'pending') return res.json({ ok: false, msg: 'Order tidak bisa dibatalkan' });
  const data = await apiGet('/api/v1/orders/set_status', { order_id: oid, status: 'cancel' });
  if (data.success) {
    db.prepare('UPDATE users SET saldo=saldo+? WHERE id=?').run(order.price, req.user.id);
    db.prepare("UPDATE orders SET status='cancelled' WHERE order_id=?").run(oid);
    const updUser = db.prepare('SELECT saldo FROM users WHERE id=?').get(req.user.id);
    return res.json({ ok: true, refund: rp(order.price), saldo: rp(updUser.saldo) });
  }
  res.json({ ok: false, msg: 'Gagal cancel order di server' });
});

app.get('/api/history', auth, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(req.user.id);
  res.json({ ok: true, data: orders.map(o => ({ ...o, price_f: rp(o.price) })) });
});

// ============================================================
// DEPOSIT ROUTES
// ============================================================
app.post('/api/deposit', auth, async (req, res) => {
  const amount = parseInt(req.body.amount);
  if (!amount || amount < CONFIG.MIN_DEPOSIT) return res.json({ ok: false, msg: `Minimal deposit ${rp(CONFIG.MIN_DEPOSIT)}` });
  const pending = db.prepare("SELECT id FROM deposits WHERE user_id=? AND status='pending' AND expired_at>?").get(req.user.id, nowTs());
  if (pending) return res.json({ ok: false, msg: 'Kamu masih punya tagihan QRIS yang belum selesai' });
  const total = amount + CONFIG.PROFIT_DEPOSIT;
  const data = await apiGet('/api/v2/deposit/create', { amount: total, payment_id: 'qris' });
  if (!data.success || !data.data) return res.json({ ok: false, msg: 'Gagal membuat QRIS. Server sedang maintenance.' });
  const d = data.data;
  const fee = d.total - amount;
  const exp = Math.floor((d.expired_at_ts || (Date.now() + 300000)) / 1000);
  db.prepare('INSERT INTO deposits (user_id,deposit_id,amount,received,fee,status,method,qr_image,expired_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(req.user.id, d.id, d.total, amount, fee, 'pending', 'QRIS', d.qr_image, exp);
  res.json({ ok: true, data: { dep_id: d.id, total: d.total, total_f: rp(d.total), recv_f: rp(amount), fee_f: rp(fee), qr: d.qr_image, exp } });
});

app.get('/api/check_dep', auth, async (req, res) => {
  const { did } = req.query;
  const dep = db.prepare("SELECT * FROM deposits WHERE deposit_id=? AND user_id=? AND status='pending'").get(did, req.user.id);
  if (!dep) return res.json({ ok: true, status: 'not_found' });
  const data = await apiGet('/api/v2/deposit/get_status', { deposit_id: did });
  if (!data.data) return res.json({ ok: false, msg: 'Gagal cek status deposit' });
  const d = data.data;
  if (d.status === 'success') {
    db.prepare('UPDATE users SET saldo=saldo+? WHERE id=?').run(dep.received, req.user.id);
    db.prepare("UPDATE deposits SET status='success',method=? WHERE deposit_id=?").run(d.brand_name || 'QRIS', did);
    const updUser = db.prepare('SELECT saldo FROM users WHERE id=?').get(req.user.id);
    return res.json({ ok: true, status: 'success', recv_f: rp(dep.received), saldo_f: rp(updUser.saldo), saldo: updUser.saldo });
  }
  res.json({ ok: true, status: d.status });
});

app.post('/api/cancel_dep', auth, async (req, res) => {
  const { did } = req.body;
  const data = await apiGet('/api/v1/deposit/cancel', { deposit_id: did });
  if (data.success) {
    db.prepare("UPDATE deposits SET status='cancelled' WHERE deposit_id=? AND user_id=?").run(did, req.user.id);
    return res.json({ ok: true });
  }
  res.json({ ok: false, msg: 'Gagal cancel deposit' });
});

app.get('/api/dep_history', auth, (req, res) => {
  const deps = db.prepare('SELECT * FROM deposits WHERE user_id=? ORDER BY created_at DESC LIMIT 20').all(req.user.id);
  res.json({ ok: true, data: deps.map(d => ({ ...d, amount_f: rp(d.amount), recv_f: rp(d.received) })) });
});

// ============================================================
// ADMIN ROUTES
// ============================================================
app.get('/api/admin/stats', adminAuth, (req, res) => {
  const s = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE is_admin=0) as total_users,
      (SELECT COUNT(*) FROM users WHERE is_admin=0 AND is_banned=0) as active_users,
      (SELECT COUNT(*) FROM orders) as total_orders,
      (SELECT COUNT(*) FROM orders WHERE status='pending') as pending_orders,
      (SELECT COUNT(*) FROM orders WHERE status='completed') as completed_orders,
      (SELECT COALESCE(SUM(price),0) FROM orders WHERE status='completed') as total_revenue,
      (SELECT COALESCE(SUM(received),0) FROM deposits WHERE status='success') as total_depo,
      (SELECT COUNT(*) FROM deposits WHERE status='success') as total_depo_count,
      (SELECT COUNT(*) FROM orders WHERE date(created_at)=date('now')) as today_orders,
      (SELECT COALESCE(SUM(price),0) FROM orders WHERE status='completed' AND date(created_at)=date('now')) as today_revenue,
      (SELECT COALESCE(SUM(received),0) FROM deposits WHERE status='success' AND date(created_at)=date('now')) as today_depo
  `).get();
  res.json({
    ok: true,
    data: {
      total_users:      s.total_users,
      active_users:     s.active_users,
      total_orders:     s.total_orders,
      pending_orders:   s.pending_orders,
      completed_orders: s.completed_orders,
      total_revenue:    rp(s.total_revenue),
      total_depo:       rp(s.total_depo),
      total_depo_count: s.total_depo_count,
      today_orders:     s.today_orders,
      today_revenue:    rp(s.today_revenue),
      today_depo:       rp(s.today_depo),
    }
  });
});

app.get('/api/admin/users', adminAuth, (req, res) => {
  const { q } = req.query;
  let sql = `SELECT u.*,
    (SELECT COUNT(*) FROM orders WHERE user_id=u.id) as total_orders,
    (SELECT COUNT(*) FROM deposits WHERE user_id=u.id AND status='success') as total_deps,
    (SELECT COALESCE(SUM(received),0) FROM deposits WHERE user_id=u.id AND status='success') as total_depo_amount
    FROM users u WHERE u.is_admin=0`;
  const params = [];
  if (q) { sql += ' AND (u.name LIKE ? OR u.email LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY u.created_at DESC';
  const users = db.prepare(sql).all(...params);
  res.json({ ok: true, data: users.map(u => ({ ...u, saldo_f: rp(u.saldo), total_depo_f: rp(u.total_depo_amount) })) });
});

app.get('/api/admin/user/:id', adminAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.json({ ok: false, msg: 'User tidak ditemukan' });
  const orders = db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 20').all(user.id);
  const deps = db.prepare('SELECT * FROM deposits WHERE user_id=? ORDER BY created_at DESC LIMIT 20').all(user.id);
  const logs = db.prepare('SELECT sl.*, a.name as admin_name FROM saldo_logs sl LEFT JOIN users a ON sl.admin_id=a.id WHERE sl.user_id=? ORDER BY sl.created_at DESC LIMIT 20').all(user.id);
  res.json({
    ok: true,
    data: {
      user: { ...user, saldo_f: rp(user.saldo) },
      orders: orders.map(o => ({ ...o, price_f: rp(o.price) })),
      deposits: deps.map(d => ({ ...d, amount_f: rp(d.amount), recv_f: rp(d.received) })),
      logs: logs.map(l => ({ ...l, amount_f: rp(l.amount) })),
    }
  });
});

app.post('/api/admin/saldo', adminAuth, (req, res) => {
  const { user_id, amount, type, note } = req.body;
  const amt = parseInt(amount);
  if (!user_id || isNaN(amt) || amt <= 0) return res.json({ ok: false, msg: 'Data tidak valid' });
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(user_id);
  if (!user) return res.json({ ok: false, msg: 'User tidak ditemukan' });
  if (type === 'reduce' && user.saldo < amt) return res.json({ ok: false, msg: 'Saldo user tidak mencukupi' });
  const before = user.saldo;
  if (type === 'add') db.prepare('UPDATE users SET saldo=saldo+? WHERE id=?').run(amt, user_id);
  else if (type === 'reduce') db.prepare('UPDATE users SET saldo=saldo-? WHERE id=?').run(amt, user_id);
  else if (type === 'set') db.prepare('UPDATE users SET saldo=? WHERE id=?').run(amt, user_id);
  const after = db.prepare('SELECT saldo FROM users WHERE id=?').get(user_id).saldo;
  db.prepare('INSERT INTO saldo_logs (user_id,admin_id,type,amount,before_bal,after_bal,note) VALUES (?,?,?,?,?,?,?)').run(user_id, req.user.id, type, amt, before, after, note || '-');
  res.json({ ok: true, msg: `Saldo berhasil diperbarui`, saldo_f: rp(after), saldo: after });
});

app.post('/api/admin/ban', adminAuth, (req, res) => {
  const { user_id, ban } = req.body;
  db.prepare('UPDATE users SET is_banned=? WHERE id=?').run(ban ? 1 : 0, user_id);
  res.json({ ok: true, msg: ban ? 'User berhasil diblokir' : 'User berhasil dibuka blokir' });
});

app.delete('/api/admin/user/:id', adminAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=? AND is_admin=0').get(req.params.id);
  if (!user) return res.json({ ok: false, msg: 'User tidak ditemukan' });
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ ok: true, msg: 'User berhasil dihapus' });
});

app.get('/api/admin/orders', adminAuth, (req, res) => {
  const { status, q } = req.query;
  let sql = `SELECT o.*, u.name as user_name, u.email as user_email FROM orders o JOIN users u ON o.user_id=u.id WHERE 1=1`;
  const params = [];
  if (status && status !== 'all') { sql += ' AND o.status=?'; params.push(status); }
  if (q) { sql += ' AND (u.name LIKE ? OR u.email LIKE ? OR o.service LIKE ? OR o.phone_number LIKE ?)'; params.push(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`); }
  sql += ' ORDER BY o.created_at DESC LIMIT 200';
  const orders = db.prepare(sql).all(...params);
  res.json({ ok: true, data: orders.map(o => ({ ...o, price_f: rp(o.price) })) });
});

app.get('/api/admin/deposits', adminAuth, (req, res) => {
  const { status, q } = req.query;
  let sql = `SELECT d.*, u.name as user_name, u.email as user_email FROM deposits d JOIN users u ON d.user_id=u.id WHERE 1=1`;
  const params = [];
  if (status && status !== 'all') { sql += ' AND d.status=?'; params.push(status); }
  if (q) { sql += ' AND (u.name LIKE ? OR u.email LIKE ?)'; params.push(`%${q}%`,`%${q}%`); }
  sql += ' ORDER BY d.created_at DESC LIMIT 200';
  const deps = db.prepare(sql).all(...params);
  res.json({ ok: true, data: deps.map(d => ({ ...d, amount_f: rp(d.amount), recv_f: rp(d.received) })) });
});

app.get('/api/admin/logs', adminAuth, (req, res) => {
  const logs = db.prepare(`
    SELECT sl.*, u.name as user_name, u.email as user_email, a.name as admin_name
    FROM saldo_logs sl
    JOIN users u ON sl.user_id=u.id
    LEFT JOIN users a ON sl.admin_id=a.id
    ORDER BY sl.created_at DESC LIMIT 100
  `).all();
  res.json({ ok: true, data: logs.map(l => ({ ...l, amount_f: rp(l.amount), before_f: rp(l.before_bal), after_f: rp(l.after_bal) })) });
});

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/health', (req, res) => {
  res.json({ ok: true, status: 'running', time: new Date().toISOString() });
});

// ============================================================
// START
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   VirtualSIM Server - RUNNING ✅     ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║  URL   : http://0.0.0.0:${PORT}           ║`);
  console.log(`║  Admin : Daftar dengan kode ADMIN2025║`);
  console.log('╚══════════════════════════════════════╝\n');
});

process.on('uncaughtException', err => console.error('[CRASH]', err));
process.on('unhandledRejection', err => console.error('[REJECT]', err));
