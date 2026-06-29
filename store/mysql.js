/**
 * MySQL 数据层(本地/自建库用)。实现与 store/json.js、store/pg.js 相同的异步 API。
 *
 * 连接配置(.env):
 *   MYSQL_URL=mysql://user:pass@host:3306/tutor_platform   (优先)
 *   或分项:MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE
 *
 * 与 Postgres 的差异处理:
 *   - JSONB → JSON 列;数组写入用 JSON.stringify,读取用 parseJSON 容错。
 *   - 自增主键用 AUTO_INCREMENT,插入后取 result.insertId。
 *   - 布尔用 TINYINT(1),读取用 !! 转。
 *   - 保留字列名(read/text)一律用反引号包裹。
 */
const mysql = require("mysql2/promise");

// 解析连接配置:优先 MYSQL_URL,否则用分项环境变量(带本地默认值)
function dbConfig() {
  if (process.env.MYSQL_URL) {
    const u = new URL(process.env.MYSQL_URL);
    return {
      host: u.hostname, port: +(u.port || 3306),
      user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, "") || "tutor_platform",
    };
  }
  return {
    host: process.env.MYSQL_HOST || "127.0.0.1", port: +(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root", password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "tutor_platform",
  };
}
const CFG = dbConfig();

const pool = mysql.createPool({
  ...CFG, waitForConnections: true, connectionLimit: 30, queueLimit: 0, charset: "utf8mb4",
});
// 查询助手:返回 rows(mysql2 的 execute 返回 [rows, fields])
const q = async (sql, params = []) => (await pool.execute(sql, params))[0];
const num = (v) => (v == null ? 0 : Number(v));
const parseJSON = (v, dft = []) => {
  if (v == null) return dft;
  if (typeof v === "object") return v; // mysql2 已自动解析 JSON 列
  try { return JSON.parse(v); } catch { return dft; }
};

/* ---------- 行 → 业务对象 ---------- */
function rowToTutor(r) {
  const now = Date.now();
  const vipExpire = num(r.vip_expire), boostExpire = num(r.boost_expire);
  return {
    userId: r.user_id, name: r.name, phone: r.phone, school: r.school || "", major: r.major || "",
    grade: r.grade || "", subjects: parseJSON(r.subjects), modes: parseJSON(r.modes), region: r.region || "",
    hourlyRate: num(r.hourly_rate), bio: r.bio || "", tags: parseJSON(r.tags),
    verified: !!r.verified, verifyInfo: r.verify_info ? parseJSON(r.verify_info, undefined) : undefined,
    vipExpire, boostExpire, vip: vipExpire > now, boosted: boostExpire > now,
    createdAt: num(r.created_at), avg: r.avg != null ? Number(r.avg) : 0, count: num(r.count),
  };
}
const rowToOrder = (r) => ({ id: r.id, userId: r.user_id, type: r.type, plan: r.plan, amount: num(r.amount),
  days: num(r.days), outTradeNo: r.out_trade_no, status: r.status, createdAt: num(r.created_at), paidAt: num(r.paid_at) });
const rowToReq = (r) => ({ id: r.id, parentId: r.parent_id, subject: r.subject, grade: r.grade, mode: r.mode,
  region: r.region || "", budget: r.budget || "", desc: r.descr || "", phone: r.phone, status: r.status || "open", createdAt: num(r.created_at) });
const rowToApplication = (r) => ({ id: r.id, requestId: r.request_id, tutorId: r.tutor_id, message: r.message || "", status: r.status, createdAt: num(r.created_at) });
const rowToMsg = (r) => ({ id: r.id, fromId: r.from_id, toId: r.to_id, text: r.text || "",
  kind: r.kind || "text", fileUrl: r.file_url || undefined, fileName: r.file_name || undefined,
  read: !!r.read, createdAt: num(r.created_at) });
const rowToUser = (r) => ({ id: r.id, name: r.name, phone: r.phone, role: r.role, pwd: r.pwd,
  banned: !!r.banned, createdAt: num(r.created_at) });
const rowToTeacherOrder = (r) => ({ id: r.id, requestId: r.request_id, tutorId: r.tutor_id, parentId: r.parent_id,
  subject: r.subject, grade: r.grade, mode: r.mode, region: r.region || "",
  hourlyRate: num(r.hourly_rate), status: r.status, createdAt: num(r.created_at), completedAt: num(r.completed_at) });
const rowToPrefs = (r) => ({ quietStart: r.quiet_start || "", quietEnd: r.quiet_end || "", onlyVerified: !!r.only_verified });
const rowToNotification = (r) => ({ id: r.id, userId: r.user_id, type: r.type, title: r.title, body: r.body || "", refId: r.ref_id, read: !!r.read, createdAt: num(r.created_at) });
const rowToLesson = (r) => ({ id: r.id, orderId: r.order_id, title: r.title || "", startTime: num(r.start_time), endTime: num(r.end_time), status: r.status, notes: r.notes || "", createdAt: num(r.created_at) });
// 会话列表里展示的"最后一条"摘要
const msgPreview = (m) => m.kind === "image" ? "[图片]" : m.kind === "file" ? `[文件] ${m.fileName || ""}`.trim() : (m.text || "");

module.exports = {
  kind: "mysql",

  async init() {
    // 库可能尚不存在:先用不带 database 的连接建库,再用主 pool 建表
    const { database, ...rest } = CFG;
    const boot = await mysql.createConnection(rest);
    await boot.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await boot.end();

    await q(`CREATE TABLE IF NOT EXISTS users(
      id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(80) NOT NULL, phone VARCHAR(40) UNIQUE NOT NULL,
      role VARCHAR(20) NOT NULL, pwd VARCHAR(200) NOT NULL,
      banned TINYINT(1) DEFAULT 0, created_at BIGINT NOT NULL)`);
    await q(`CREATE TABLE IF NOT EXISTS tutors(
      user_id INT PRIMARY KEY, name VARCHAR(80), phone VARCHAR(40),
      school VARCHAR(120), major VARCHAR(120), grade VARCHAR(40), subjects JSON, modes JSON,
      region VARCHAR(80), hourly_rate INT DEFAULT 0, bio TEXT, tags JSON,
      verified TINYINT(1) DEFAULT 0, verify_info JSON, vip_expire BIGINT DEFAULT 0, boost_expire BIGINT DEFAULT 0,
      created_at BIGINT)`);
    await q(`CREATE TABLE IF NOT EXISTS requests(
      id INT AUTO_INCREMENT PRIMARY KEY, parent_id INT, subject VARCHAR(40), grade VARCHAR(40),
      mode VARCHAR(20), region VARCHAR(80), budget VARCHAR(60), descr TEXT, phone VARCHAR(40), created_at BIGINT)`);
    await q(`CREATE TABLE IF NOT EXISTS reviews(
      id INT AUTO_INCREMENT PRIMARY KEY, tutor_id INT, parent_id INT, rating INT, comment TEXT, created_at BIGINT)`);
    await q(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS direction VARCHAR(20) DEFAULT 'to_tutor'`);
    await q(`CREATE TABLE IF NOT EXISTS notifications(
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      type VARCHAR(30),
      title VARCHAR(200),
      body TEXT,
      ref_id INT,
      \`read\` TINYINT(1) DEFAULT 0,
      created_at BIGINT)`);
    await q(`CREATE TABLE IF NOT EXISTS favorites(
      user_id INT, tutor_id INT, created_at BIGINT, PRIMARY KEY(user_id, tutor_id))`);
    await q(`CREATE TABLE IF NOT EXISTS messages(
      id INT AUTO_INCREMENT PRIMARY KEY, from_id INT, to_id INT, \`text\` TEXT,
      kind VARCHAR(10) DEFAULT 'text', file_url VARCHAR(255), file_name VARCHAR(160),
      \`read\` TINYINT(1) DEFAULT 0, created_at BIGINT)`);
    await q(`CREATE TABLE IF NOT EXISTS sessions(
      token VARCHAR(64) PRIMARY KEY, user_id INT, created_at BIGINT)`);
    await q(`ALTER TABLE requests ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'open'`);
    await q(`CREATE TABLE IF NOT EXISTS applications(
      id INT AUTO_INCREMENT PRIMARY KEY, request_id INT NOT NULL, tutor_id INT NOT NULL,
      message TEXT, status VARCHAR(20) DEFAULT 'pending', created_at BIGINT NOT NULL)`);
    await q(`CREATE TABLE IF NOT EXISTS teacher_orders(
      id INT AUTO_INCREMENT PRIMARY KEY, request_id INT, tutor_id INT, parent_id INT,
      subject VARCHAR(40), grade VARCHAR(40), mode VARCHAR(20), region VARCHAR(80),
      hourly_rate INT DEFAULT 0, status VARCHAR(20) DEFAULT 'teaching',
      created_at BIGINT, completed_at BIGINT DEFAULT 0)`);
    await q(`CREATE TABLE IF NOT EXISTS blocked(
      user_id INT, blocked_id INT, created_at BIGINT, PRIMARY KEY(user_id, blocked_id))`);
    await q(`CREATE TABLE IF NOT EXISTS user_prefs(
      user_id INT PRIMARY KEY, quiet_start VARCHAR(10) DEFAULT '', quiet_end VARCHAR(10) DEFAULT '',
      only_verified TINYINT(1) DEFAULT 0)`);
    await q(`CREATE TABLE IF NOT EXISTS lessons(
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT,
      title VARCHAR(120) DEFAULT '',
      start_time BIGINT,
      end_time BIGINT,
      status VARCHAR(20) DEFAULT 'scheduled',
      notes TEXT,
      created_at BIGINT
    )`);
    console.log("✅ MySQL 数据表已就绪");
  },

  /* 用户 / 会话 */
  async createUser(u) {
    const r = await q(`INSERT INTO users(name,phone,role,pwd,banned,created_at) VALUES(?,?,?,?,0,?)`,
      [u.name, u.phone, u.role, u.pwd, Date.now()]);
    return { id: r.insertId, name: u.name, phone: u.phone, role: u.role, pwd: u.pwd, banned: false, createdAt: Date.now() };
  },
  async findUserByPhone(phone) { const rows = await q(`SELECT * FROM users WHERE phone=?`, [phone]); return rows[0] ? rowToUser(rows[0]) : null; },
  async findUserById(id) { const rows = await q(`SELECT * FROM users WHERE id=?`, [id]); return rows[0] ? rowToUser(rows[0]) : null; },
  async createSession(token, userId) { await q(`INSERT INTO sessions(token,user_id,created_at) VALUES(?,?,?)`, [token, userId, Date.now()]); },
  async getSessionUserId(token) { if (!token) return null; const rows = await q(`SELECT user_id FROM sessions WHERE token=?`, [token]); return rows[0] ? rows[0].user_id : null; },
  async deleteSession(token) { await q(`DELETE FROM sessions WHERE token=?`, [token]); },

  /* 老师 */
  async createTutor(t) {
    await q(`INSERT INTO tutors(user_id,name,phone,school,major,grade,subjects,modes,region,hourly_rate,bio,tags,verified,vip_expire,boost_expire,created_at)
      VALUES(?,?,?,'','','',?,?,'',0,'',?,0,0,0,?)`,
      [t.userId, t.name, t.phone, "[]", "[]", "[]", Date.now()]);
  },
  async getTutor(userId) { const rows = await q(`SELECT * FROM tutors WHERE user_id=?`, [userId]); return rows[0] ? rowToTutor(rows[0]) : null; },
  async updateTutor(userId, f) {
    const cur = await this.getTutor(userId); if (!cur) return null;
    const v = {
      school: f.school ?? cur.school, major: f.major ?? cur.major, grade: f.grade ?? cur.grade,
      subjects: Array.isArray(f.subjects) ? f.subjects : cur.subjects,
      modes: Array.isArray(f.modes) ? f.modes : cur.modes, region: f.region ?? cur.region,
      hourlyRate: f.hourlyRate != null ? Number(f.hourlyRate) : cur.hourlyRate,
      bio: f.bio ?? cur.bio, tags: Array.isArray(f.tags) ? f.tags : cur.tags, name: f.name ?? cur.name,
    };
    await q(`UPDATE tutors SET school=?,major=?,grade=?,subjects=?,modes=?,region=?,hourly_rate=?,bio=?,tags=?,name=? WHERE user_id=?`,
      [v.school, v.major, v.grade, JSON.stringify(v.subjects), JSON.stringify(v.modes), v.region, v.hourlyRate, v.bio, JSON.stringify(v.tags), v.name, userId]);
    return this.getTutor(userId);
  },
  async verifyTutor(userId, info) {
    await q(`UPDATE tutors SET verified=1, verify_info=? WHERE user_id=?`, [JSON.stringify(info), userId]);
    return this.getTutor(userId);
  },
  async tutorRating(userId) {
    const rows = await q(`SELECT AVG(rating) avg, COUNT(*) count FROM reviews WHERE tutor_id=?`, [userId]);
    const r = rows[0]; return { avg: r.avg != null ? Math.round(Number(r.avg) * 10) / 10 : 0, count: num(r.count) };
  },
  // 把评分聚合进老师列表(避免 N 次查询)
  async _withRatings(tutors) {
    if (!tutors.length) return tutors;
    const rows = await q(`SELECT tutor_id, AVG(rating) avg, COUNT(*) count FROM reviews GROUP BY tutor_id`);
    const m = new Map(rows.map((x) => [x.tutor_id, { avg: Math.round(Number(x.avg) * 10) / 10, count: num(x.count) }]));
    return tutors.map((t) => ({ ...t, ...(m.get(t.userId) || { avg: 0, count: 0 }) }));
  },
  async listTutors({ subject, region, mode, q: kw } = {}) {
    // 可见 = 填了学校或至少一个科目
    const rows = await q(`SELECT * FROM tutors WHERE (school IS NOT NULL AND school<>'') OR JSON_LENGTH(subjects)>0`);
    let list = rows.map(rowToTutor);
    if (subject) list = list.filter((t) => t.subjects.includes(subject));
    if (region) list = list.filter((t) => (t.region || "").includes(region));
    if (mode) list = list.filter((t) => t.modes.includes(mode));
    if (kw) {
      const k = kw.toLowerCase();
      list = list.filter((t) => [t.name, t.school, t.major, t.bio, (t.tags || []).join(" "), (t.subjects || []).join(" ")]
        .join(" ").toLowerCase().includes(k));
    }
    return this._withRatings(list);
  },
  async allTutorsVisible() {
    const rows = await q(`SELECT * FROM tutors WHERE (school IS NOT NULL AND school<>'') OR JSON_LENGTH(subjects)>0`);
    return this._withRatings(rows.map(rowToTutor));
  },

  /* 需求 */
  async createRequest(r) {
    const ins = await q(`INSERT INTO requests(parent_id,subject,grade,mode,region,budget,descr,phone,status,created_at) VALUES(?,?,?,?,?,?,?,?,'open',?)`,
      [r.parentId, r.subject, r.grade, r.mode, r.region || "", r.budget || "", r.desc || "", r.phone || "", Date.now()]);
    return { id: ins.insertId, ...r, status: "open", createdAt: Date.now() };
  },
  async listRequests({ subject, region, mode, status } = {}) {
    const rows = await q(`SELECT r.*, u.name parent_name FROM requests r LEFT JOIN users u ON u.id=r.parent_id ORDER BY r.created_at DESC`);
    let list = rows.map((r) => ({ ...rowToReq(r), parentName: r.parent_name || "家长" }));
    if (subject) list = list.filter((r) => r.subject === subject);
    if (region) list = list.filter((r) => (r.region || "").includes(region));
    if (mode) list = list.filter((r) => r.mode === mode);
    if (status) list = list.filter((r) => r.status === status);
    return list;
  },
  async getRequest(id) {
    const rows = await q(`SELECT r.*, u.name parent_name FROM requests r LEFT JOIN users u ON u.id=r.parent_id WHERE r.id=?`, [id]);
    return rows[0] ? { ...rowToReq(rows[0]), status: rows[0].status || "open", parentName: rows[0].parent_name || "家长" } : null;
  },
  async allRequests() {
    const rows = await q(`SELECT r.*, u.name parent_name FROM requests r LEFT JOIN users u ON u.id=r.parent_id`);
    return rows.map((r) => ({ ...rowToReq(r), parentName: r.parent_name || "家长" }));
  },
  async requestsByParent(parentId) {
    const rows = await q(`SELECT * FROM requests WHERE parent_id=? ORDER BY created_at DESC`, [parentId]);
    return rows.map(rowToReq);
  },
  async setRequestStatus(id, status) {
    await q(`UPDATE requests SET status=? WHERE id=?`, [status, id]);
  },

  /* 评价 */
  async createReview(r) {
    const ins = await q(`INSERT INTO reviews(tutor_id,parent_id,rating,comment,created_at) VALUES(?,?,?,?,?)`,
      [r.tutorId, r.parentId, r.rating, r.comment || "", Date.now()]);
    return { id: ins.insertId, ...r, createdAt: Date.now() };
  },
  async listReviews(tutorId) {
    const rows = await q(`SELECT rv.*, u.name parent_name FROM reviews rv LEFT JOIN users u ON u.id=rv.parent_id WHERE rv.tutor_id=? ORDER BY rv.created_at DESC`, [tutorId]);
    return rows.map((r) => ({ id: r.id, tutorId: r.tutor_id, parentId: r.parent_id, rating: r.rating, comment: r.comment || "", createdAt: num(r.created_at), parentName: r.parent_name || "匿名" }));
  },

  /* 双向评价 - 家长评分 */
  async reviewParent(orderId, parentId, tutorId, rating, comment) {
    const ins = await q(`INSERT INTO reviews(order_id,parent_id,tutor_id,rating,comment,direction,created_at) VALUES(?,?,?,?,?,'to_parent',?)`,
      [orderId, parentId, tutorId, rating, comment || "", Date.now()]);
    return { id: ins.insertId, orderId, parentId, tutorId, rating, comment: comment || "", direction: "to_parent", createdAt: Date.now() };
  },
  async parentRatings(parentId) {
    const rows = await q(`SELECT AVG(rating) avg, COUNT(*) count FROM reviews WHERE direction='to_parent' AND parent_id=?`, [parentId]);
    const r = rows[0];
    return { avg: r.avg != null ? Math.round(Number(r.avg) * 10) / 10 : 0, count: num(r.count) };
  },

  /* 通知中心 */
  async createNotification(n) {
    const ins = await q(`INSERT INTO notifications(user_id,type,title,body,ref_id,\`read\`,created_at) VALUES(?,?,?,?,?,0,?)`,
      [n.userId, n.type, n.title, n.body || "", n.refId || null, Date.now()]);
    return { id: ins.insertId, userId: n.userId, type: n.type, title: n.title, body: n.body || "", refId: n.refId || null, read: false, createdAt: Date.now() };
  },
  async listNotifications(userId) {
    const rows = await q(`SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50`, [userId]);
    return rows.map(rowToNotification);
  },
  async markNotificationRead(id) {
    await q(`UPDATE notifications SET \`read\`=1 WHERE id=?`, [id]);
  },
  async unreadNotificationCount(userId) {
    const rows = await q(`SELECT COUNT(*) count FROM notifications WHERE user_id=? AND \`read\`=0`, [userId]);
    return num(rows[0].count);
  },
  async markAllNotificationsRead(userId) {
    await q(`UPDATE notifications SET \`read\`=1 WHERE user_id=? AND \`read\`=0`, [userId]);
  },

  /* 收藏 */
  async toggleFavorite(userId, tutorId) {
    const rows = await q(`SELECT 1 FROM favorites WHERE user_id=? AND tutor_id=?`, [userId, tutorId]);
    if (rows.length) { await q(`DELETE FROM favorites WHERE user_id=? AND tutor_id=?`, [userId, tutorId]); return false; }
    await q(`INSERT INTO favorites(user_id,tutor_id,created_at) VALUES(?,?,?)`, [userId, tutorId, Date.now()]);
    return true;
  },
  async favoriteIds(userId) { const rows = await q(`SELECT tutor_id FROM favorites WHERE user_id=?`, [userId]); return rows.map((r) => r.tutor_id); },
  async listFavorites(userId) {
    const rows = await q(`SELECT t.* FROM favorites f JOIN tutors t ON t.user_id=f.tutor_id WHERE f.user_id=?`, [userId]);
    const list = await this._withRatings(rows.map(rowToTutor));
    return list.map((t) => ({ ...t, faved: true }));
  },

  /* 私信 */
  async createMessage(m) {
    const ins = await q(`INSERT INTO messages(from_id,to_id,\`text\`,kind,file_url,file_name,\`read\`,created_at) VALUES(?,?,?,?,?,?,0,?)`,
      [m.fromId, m.toId, m.text || "", m.kind || "text", m.fileUrl || null, m.fileName || null, Date.now()]);
    return { id: ins.insertId, fromId: m.fromId, toId: m.toId, text: m.text || "", kind: m.kind || "text",
      fileUrl: m.fileUrl, fileName: m.fileName, read: false, createdAt: Date.now() };
  },
  async conversations(userId) {
    const rows = await q(`SELECT * FROM messages WHERE from_id=? OR to_id=? ORDER BY created_at ASC`, [userId, userId]);
    const mine = rows.map(rowToMsg);
    const map = new Map();
    for (const m of mine) {
      const other = m.fromId === userId ? m.toId : m.fromId;
      if (!map.has(other)) map.set(other, { lastAt: 0, last: "", unread: 0 });
      const c = map.get(other);
      if (m.createdAt >= c.lastAt) { c.lastAt = m.createdAt; c.last = msgPreview(m); }
      if (m.toId === userId && !m.read) c.unread++;
    }
    const ids = [...map.keys()];
    let uMap = new Map();
    if (ids.length) {
      const us = await q(`SELECT id,name,role FROM users WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
      uMap = new Map(us.map((u) => [u.id, u]));
    }
    return [...map.entries()].map(([otherId, c]) => {
      const u = uMap.get(otherId) || {};
      return { userId: otherId, name: u.name || "用户", role: u.role, last: c.last, lastAt: c.lastAt, unread: c.unread };
    }).sort((a, b) => b.lastAt - a.lastAt);
  },
  async thread(userId, other) {
    const rows = await q(`SELECT * FROM messages WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?) ORDER BY created_at ASC`, [userId, other, other, userId]);
    await q(`UPDATE messages SET \`read\`=1 WHERE to_id=? AND from_id=? AND \`read\`=0`, [userId, other]);
    return rows.map(rowToMsg);
  },
  async unreadCount(userId) { const rows = await q(`SELECT COUNT(*) c FROM messages WHERE to_id=? AND \`read\`=0`, [userId]); return num(rows[0].c); },

  /* 订单 / 权益 */
  async createOrder(o) {
    const ins = await q(`INSERT INTO orders(user_id,type,plan,amount,days,out_trade_no,status,created_at,paid_at) VALUES(?,?,?,?,?,?,'pending',?,0)`,
      [o.userId, o.type, o.plan, o.amount, o.days, o.outTradeNo, Date.now()]);
    return { id: ins.insertId, userId: o.userId, type: o.type, plan: o.plan, amount: o.amount, days: o.days,
      outTradeNo: o.outTradeNo, status: "pending", createdAt: Date.now(), paidAt: 0 };
  },
  async getOrder(id) { const rows = await q(`SELECT * FROM orders WHERE id=?`, [id]); return rows[0] ? rowToOrder(rows[0]) : null; },
  async getOrderByOutTradeNo(no) { const rows = await q(`SELECT * FROM orders WHERE out_trade_no=?`, [no]); return rows[0] ? rowToOrder(rows[0]) : null; },
  async markOrderPaid(id) {
    const r = await q(`UPDATE orders SET status='paid', paid_at=? WHERE id=? AND status='pending'`, [Date.now(), id]);
    const cur = await this.getOrder(id); if (!cur) return null;
    return { order: cur, already: r.affectedRows === 0 };
  },
  async grantEntitlement(userId, type, days) {
    const col = type === "vip" ? "vip_expire" : "boost_expire";
    await q(`UPDATE tutors SET ${col}=GREATEST(COALESCE(${col},0), ?)+? WHERE user_id=?`, [Date.now(), days * 86400000, userId]);
    return this.getTutor(userId);
  },
  async listOrders(userId) { const rows = await q(`SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC`, [userId]); return rows.map(rowToOrder); },

  /* 接单申请 */
  async createApplication(a) {
    const ins = await q(`INSERT INTO applications(request_id,tutor_id,message,status,created_at) VALUES(?,?,?,'pending',?)`,
      [a.requestId, a.tutorId, a.message || "", Date.now()]);
    return { id: ins.insertId, requestId: a.requestId, tutorId: a.tutorId, message: a.message || "", status: "pending", createdAt: Date.now() };
  },
  async getApplication(id) { const rows = await q(`SELECT * FROM applications WHERE id=?`, [id]); return rows[0] ? rowToApplication(rows[0]) : null; },
  async listApplications(requestId) {
    const rows = await q(`SELECT a.*, u.name tutor_name, t.school tutor_school, t.verified tutor_verified
      FROM applications a LEFT JOIN users u ON u.id=a.tutor_id LEFT JOIN tutors t ON t.user_id=a.tutor_id
      WHERE a.request_id=? ORDER BY a.created_at DESC`, [requestId]);
    return rows.map((r) => ({ ...rowToApplication(r), tutorName: r.tutor_name || "老师", tutorSchool: r.tutor_school || "", tutorVerified: !!r.tutor_verified }));
  },
  async approveApplication(id) {
    const upd = await q(`UPDATE applications SET status='approved' WHERE id=? AND status='pending'`, [id]);
    if (!upd.affectedRows) return null;
    const a = await this.getApplication(id);
    if (a) await q(`UPDATE requests SET status='matched' WHERE id=?`, [a.requestId]);
    return a;
  },
  async rejectApplication(id) {
    await q(`UPDATE applications SET status='rejected' WHERE id=?`, [id]);
    return this.getApplication(id);
  },

  /* 授课订单 */
  async createTeacherOrder(data) {
    const ins = await q(`INSERT INTO teacher_orders(request_id,tutor_id,parent_id,subject,grade,mode,region,hourly_rate,status,created_at,completed_at)
      VALUES(?,?,?,?,?,?,?,?,'teaching',?,0)`,
      [data.requestId, data.tutorId, data.parentId, data.subject, data.grade, data.mode, data.region, data.hourlyRate, Date.now()]);
    return { id: ins.insertId, requestId: data.requestId, tutorId: data.tutorId, parentId: data.parentId,
      subject: data.subject, grade: data.grade, mode: data.mode, region: data.region,
      hourlyRate: data.hourlyRate, status: "teaching", createdAt: Date.now(), completedAt: 0 };
  },
  async getTeacherOrder(id) {
    const rows = await q(`SELECT o.*, tu.name tutor_name, pu.name parent_name
      FROM teacher_orders o LEFT JOIN users tu ON tu.id=o.tutor_id LEFT JOIN users pu ON pu.id=o.parent_id WHERE o.id=?`, [id]);
    if (!rows[0]) return null;
    const r = rows[0];
    return { ...rowToTeacherOrder(r), tutorName: r.tutor_name || "老师", parentName: r.parent_name || "家长" };
  },
  async getTeacherOrderByRequest(requestId) {
    const rows = await q(`SELECT o.*, tu.name tutor_name, pu.name parent_name
      FROM teacher_orders o LEFT JOIN users tu ON tu.id=o.tutor_id LEFT JOIN users pu ON pu.id=o.parent_id WHERE o.request_id=?`, [requestId]);
    if (!rows[0]) return null;
    const r = rows[0];
    return { ...rowToTeacherOrder(r), tutorName: r.tutor_name || "老师", parentName: r.parent_name || "家长" };
  },
  async listTeacherOrders(userId) {
    const rows = await q(`SELECT o.*, tu.name tutor_name, pu.name parent_name
      FROM teacher_orders o LEFT JOIN users tu ON tu.id=o.tutor_id LEFT JOIN users pu ON pu.id=o.parent_id
      WHERE o.tutor_id=? OR o.parent_id=? ORDER BY o.created_at DESC`, [userId, userId]);
    return rows.map((r) => {
      const o = rowToTeacherOrder(r);
      const isTutor = o.tutorId === userId;
      const peerName = isTutor ? (r.parent_name || "家长") : (r.tutor_name || "老师");
      return { ...o, peerName, peerRole: isTutor ? "parent" : "tutor" };
    });
  },
  async updateTeacherOrderStatus(id, status) {
    if (status !== "completed" && status !== "cancelled") return null;
    if (status === "completed") {
      await q(`UPDATE teacher_orders SET status=?, completed_at=? WHERE id=?`, [status, Date.now(), id]);
    } else {
      await q(`UPDATE teacher_orders SET status=? WHERE id=?`, [status, id]);
    }
    const rows = await q(`SELECT * FROM teacher_orders WHERE id=?`, [id]);
    return rows[0] ? rowToTeacherOrder(rows[0]) : null;
  },

  /* 课时 */
  async createLesson(data) {
    const ins = await q(`INSERT INTO lessons(order_id,title,start_time,end_time,status,notes,created_at) VALUES(?,?,?,?,'scheduled',?,?)`,
      [data.orderId, data.title || "", data.startTime, data.endTime, data.notes || "", Date.now()]);
    const rows = await q(`SELECT * FROM lessons WHERE id=?`, [ins.insertId]);
    return rowToLesson(rows[0]);
  },
  async listLessons(orderId) {
    const rows = await q(`SELECT * FROM lessons WHERE order_id=? ORDER BY start_time ASC`, [orderId]);
    return rows.map(rowToLesson);
  },
  async getLesson(id) {
    const rows = await q(`SELECT * FROM lessons WHERE id=?`, [id]);
    return rows[0] ? rowToLesson(rows[0]) : null;
  },
  async updateLesson(id, data) {
    const sets = []; const p = [];
    if (data.title !== undefined) { sets.push(`title=?`); p.push(data.title); }
    if (data.startTime !== undefined) { sets.push(`start_time=?`); p.push(data.startTime); }
    if (data.endTime !== undefined) { sets.push(`end_time=?`); p.push(data.endTime); }
    if (data.notes !== undefined) { sets.push(`notes=?`); p.push(data.notes); }
    if (sets.length) {
      p.push(id);
      await q(`UPDATE lessons SET ${sets.join(",")} WHERE id=?`, p);
    }
    const rows = await q(`SELECT * FROM lessons WHERE id=?`, [id]);
    return rows[0] ? rowToLesson(rows[0]) : null;
  },
  async updateLessonStatus(id, status) {
    if (status !== "completed" && status !== "cancelled") return null;
    await q(`UPDATE lessons SET status=? WHERE id=?`, [status, id]);
    const rows = await q(`SELECT * FROM lessons WHERE id=?`, [id]);
    return rows[0] ? rowToLesson(rows[0]) : null;
  },
  async deleteLesson(id) {
    await q(`DELETE FROM lessons WHERE id=?`, [id]);
  },

  /* 屏蔽用户 */
  async blockUser(userId, blockedId) {
    if (+userId === +blockedId) return false;
    const rows = await q(`SELECT 1 FROM blocked WHERE user_id=? AND blocked_id=?`, [userId, blockedId]);
    if (rows.length) return false;
    await q(`INSERT INTO blocked(user_id,blocked_id,created_at) VALUES(?,?,?)`, [userId, blockedId, Date.now()]);
    return true;
  },
  async unblockUser(userId, blockedId) {
    await q(`DELETE FROM blocked WHERE user_id=? AND blocked_id=?`, [userId, blockedId]);
  },
  async blockedIds(userId) {
    const rows = await q(`SELECT blocked_id FROM blocked WHERE user_id=?`, [userId]);
    return rows.map(r => r.blocked_id);
  },
  async isBlocked(userId, targetId) {
    const rows = await q(`SELECT 1 FROM blocked WHERE user_id=? AND blocked_id=?`, [userId, targetId]);
    return rows.length > 0;
  },

  /* 通知偏好 */
  async setUserPrefs(userId, prefs) {
    await q(`INSERT INTO user_prefs(user_id,quiet_start,quiet_end,only_verified)
      VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE
      quiet_start=COALESCE(?,quiet_start), quiet_end=COALESCE(?,quiet_end), only_verified=COALESCE(?,only_verified)`,
      [userId, prefs.quietStart ?? "", prefs.quietEnd ?? "", prefs.onlyVerified != null ? (prefs.onlyVerified ? 1 : 0) : 0,
       prefs.quietStart ?? null, prefs.quietEnd ?? null, prefs.onlyVerified != null ? (prefs.onlyVerified ? 1 : 0) : null]);
    const rows = await q(`SELECT * FROM user_prefs WHERE user_id=?`, [userId]);
    return rows[0] ? rowToPrefs(rows[0]) : { quietStart: "", quietEnd: "", onlyVerified: false };
  },
  async getUserPrefs(userId) {
    const rows = await q(`SELECT * FROM user_prefs WHERE user_id=?`, [userId]);
    return rows[0] ? rowToPrefs(rows[0]) : { quietStart: "", quietEnd: "", onlyVerified: false };
  },

  /* 已联系用户 */
  async contactedUserIds(userId) {
    const rows = await q(`SELECT DISTINCT CASE WHEN from_id=? THEN to_id ELSE from_id END AS other_id
      FROM messages WHERE from_id=? OR to_id=?`, [userId, userId, userId]);
    return rows.map((r) => r.other_id);
  },

  /* ============== 管理员 ============== */
  async listAllUsers() {
    const rows = await q(`SELECT * FROM users ORDER BY created_at DESC`);
    return rows.map((r) => { const u = rowToUser(r); delete u.pwd; return u; });
  },
  async setUserRole(id, role) { await q(`UPDATE users SET role=? WHERE id=?`, [role, id]); },
  async resetPassword(id, pwd) { await q(`UPDATE users SET pwd=? WHERE id=?`, [pwd, id]); },
  async setUserBanned(id, banned) { await q(`UPDATE users SET banned=? WHERE id=?`, [banned ? 1 : 0, id]); },
  // 删除用户并级联清理其全部关联数据
  async deleteUser(id) {
    await q(`DELETE FROM reviews WHERE parent_id=? OR tutor_id=?`, [id, id]);
    await q(`DELETE FROM requests WHERE parent_id=?`, [id]);
    await q(`DELETE FROM applications WHERE tutor_id=?`, [id]);
    await q(`DELETE FROM messages WHERE from_id=? OR to_id=?`, [id, id]);
    await q(`DELETE FROM favorites WHERE user_id=? OR tutor_id=?`, [id, id]);
    await q(`DELETE FROM orders WHERE user_id=?`, [id]);
    await q(`DELETE FROM sessions WHERE user_id=?`, [id]);
    await q(`DELETE FROM tutors WHERE user_id=?`, [id]);
    await q(`DELETE FROM users WHERE id=?`, [id]);
  },
  async deleteReview(id) { await q(`DELETE FROM reviews WHERE id=?`, [id]); },
  async deleteRequest(id) { await q(`DELETE FROM applications WHERE request_id=?`, [id]); await q(`DELETE FROM requests WHERE id=?`, [id]); },
  // 下架老师档案:删档案 + 收藏,保留用户账号
  async deleteTutorProfile(userId) {
    await q(`DELETE FROM favorites WHERE tutor_id=?`, [userId]);
    await q(`DELETE FROM reviews WHERE tutor_id=?`, [userId]);
    await q(`DELETE FROM tutors WHERE user_id=?`, [userId]);
  },
  async adminAllReviews() {
    const rows = await q(`SELECT rv.*, tu.name tutor_name, pu.name parent_name
      FROM reviews rv LEFT JOIN users tu ON tu.id=rv.tutor_id LEFT JOIN users pu ON pu.id=rv.parent_id ORDER BY rv.created_at DESC`);
    return rows.map((r) => ({ id: r.id, tutorId: r.tutor_id, parentId: r.parent_id, rating: r.rating,
      comment: r.comment || "", createdAt: num(r.created_at), tutorName: r.tutor_name || "-", parentName: r.parent_name || "匿名" }));
  },
  async adminStats() {
    const one = async (sql) => num((await q(sql))[0].c);
    return {
      users: await one(`SELECT COUNT(*) c FROM users`),
      tutors: await one(`SELECT COUNT(*) c FROM tutors`),
      requests: await one(`SELECT COUNT(*) c FROM requests`),
      reviews: await one(`SELECT COUNT(*) c FROM reviews`),
    };
  },
};
