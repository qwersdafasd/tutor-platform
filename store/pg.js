/**
 * Postgres 数据层（Supabase / 线上用）。实现与 store/json.js 相同的异步 API。
 * 通过环境变量 DATABASE_URL 连接。
 */
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Supabase 需要 SSL
  max: 3, // serverless 环境下限制连接数，避免占满免费库
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 15000,
});
const q = (sql, params) => pool.query(sql, params);
const num = (v) => (v == null ? 0 : Number(v));

function rowToTutor(r) {
  return {
    userId: r.user_id, name: r.name, phone: r.phone, school: r.school || "", major: r.major || "",
    grade: r.grade || "", subjects: r.subjects || [], modes: r.modes || [], region: r.region || "",
    hourlyRate: num(r.hourly_rate), bio: r.bio || "", tags: r.tags || [],
    verified: !!r.verified, boosted: !!r.boosted, verifyInfo: r.verify_info || undefined,
    createdAt: num(r.created_at), avg: r.avg != null ? Number(r.avg) : 0, count: num(r.count),
  };
}
function rowToReq(r) {
  return { id: r.id, parentId: r.parent_id, subject: r.subject, grade: r.grade, mode: r.mode,
    region: r.region || "", budget: r.budget || "", desc: r.descr || "", phone: r.phone, createdAt: num(r.created_at) };
}
function rowToMsg(r) {
  return { id: r.id, fromId: r.from_id, toId: r.to_id, text: r.text, read: !!r.read, createdAt: num(r.created_at) };
}

module.exports = {
  kind: "postgres",

  async init() {
    await q(`CREATE TABLE IF NOT EXISTS users(
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, phone TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL, pwd TEXT NOT NULL, created_at BIGINT NOT NULL)`);
    await q(`CREATE TABLE IF NOT EXISTS tutors(
      user_id INTEGER PRIMARY KEY REFERENCES users(id), name TEXT, phone TEXT,
      school TEXT, major TEXT, grade TEXT, subjects JSONB DEFAULT '[]'::jsonb, modes JSONB DEFAULT '[]'::jsonb,
      region TEXT, hourly_rate INTEGER DEFAULT 0, bio TEXT, tags JSONB DEFAULT '[]'::jsonb,
      verified BOOLEAN DEFAULT false, boosted BOOLEAN DEFAULT false, verify_info JSONB, created_at BIGINT)`);
    await q(`CREATE TABLE IF NOT EXISTS requests(
      id SERIAL PRIMARY KEY, parent_id INTEGER REFERENCES users(id), subject TEXT, grade TEXT,
      mode TEXT, region TEXT, budget TEXT, descr TEXT, phone TEXT, created_at BIGINT)`);
    await q(`CREATE TABLE IF NOT EXISTS reviews(
      id SERIAL PRIMARY KEY, tutor_id INTEGER, parent_id INTEGER, rating INTEGER, comment TEXT, created_at BIGINT)`);
    await q(`CREATE TABLE IF NOT EXISTS favorites(
      user_id INTEGER, tutor_id INTEGER, created_at BIGINT, PRIMARY KEY(user_id, tutor_id))`);
    await q(`CREATE TABLE IF NOT EXISTS messages(
      id SERIAL PRIMARY KEY, from_id INTEGER, to_id INTEGER, text TEXT, read BOOLEAN DEFAULT false, created_at BIGINT)`);
    await q(`CREATE TABLE IF NOT EXISTS sessions(
      token TEXT PRIMARY KEY, user_id INTEGER, created_at BIGINT)`);
    console.log("✅ Postgres 数据表已就绪");
  },

  /* 用户 / 会话 */
  async createUser(u) {
    const r = await q(`INSERT INTO users(name,phone,role,pwd,created_at) VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [u.name, u.phone, u.role, u.pwd, Date.now()]);
    const row = r.rows[0];
    return { id: row.id, name: row.name, phone: row.phone, role: row.role, pwd: row.pwd, createdAt: num(row.created_at) };
  },
  async findUserByPhone(phone) {
    const r = await q(`SELECT * FROM users WHERE phone=$1`, [phone]);
    if (!r.rows[0]) return null; const u = r.rows[0];
    return { id: u.id, name: u.name, phone: u.phone, role: u.role, pwd: u.pwd, createdAt: num(u.created_at) };
  },
  async findUserById(id) {
    const r = await q(`SELECT * FROM users WHERE id=$1`, [id]);
    if (!r.rows[0]) return null; const u = r.rows[0];
    return { id: u.id, name: u.name, phone: u.phone, role: u.role, pwd: u.pwd, createdAt: num(u.created_at) };
  },
  async createSession(token, userId) { await q(`INSERT INTO sessions(token,user_id,created_at) VALUES($1,$2,$3)`, [token, userId, Date.now()]); },
  async getSessionUserId(token) { const r = await q(`SELECT user_id FROM sessions WHERE token=$1`, [token]); return r.rows[0]?.user_id || null; },
  async deleteSession(token) { await q(`DELETE FROM sessions WHERE token=$1`, [token]); },

  /* 老师 */
  async createTutor(t) {
    await q(`INSERT INTO tutors(user_id,name,phone,school,major,grade,region,bio,created_at)
      VALUES($1,$2,$3,'','','','','',$4) ON CONFLICT (user_id) DO NOTHING`, [t.userId, t.name, t.phone, Date.now()]);
  },
  async getTutor(userId) {
    const r = await q(`SELECT t.*, 0 avg, 0 count FROM tutors t WHERE user_id=$1`, [userId]);
    return r.rows[0] ? rowToTutor(r.rows[0]) : null;
  },
  async updateTutor(userId, f) {
    const cur = (await q(`SELECT * FROM tutors WHERE user_id=$1`, [userId])).rows[0];
    if (!cur) return null;
    const v = {
      school: f.school ?? cur.school, major: f.major ?? cur.major, grade: f.grade ?? cur.grade,
      subjects: Array.isArray(f.subjects) ? f.subjects : (cur.subjects || []),
      modes: Array.isArray(f.modes) ? f.modes : (cur.modes || []), region: f.region ?? cur.region,
      hourlyRate: f.hourlyRate != null ? Number(f.hourlyRate) : cur.hourly_rate,
      bio: f.bio ?? cur.bio, tags: Array.isArray(f.tags) ? f.tags : (cur.tags || []), name: f.name ?? cur.name,
    };
    await q(`UPDATE tutors SET school=$2,major=$3,grade=$4,subjects=$5::jsonb,modes=$6::jsonb,region=$7,
      hourly_rate=$8,bio=$9,tags=$10::jsonb,name=$11 WHERE user_id=$1`,
      [userId, v.school, v.major, v.grade, JSON.stringify(v.subjects), JSON.stringify(v.modes), v.region,
       v.hourlyRate, v.bio, JSON.stringify(v.tags), v.name]);
    return this.getTutor(userId);
  },
  async verifyTutor(userId, info) {
    await q(`UPDATE tutors SET verified=true, verify_info=$2::jsonb WHERE user_id=$1`, [userId, JSON.stringify(info)]);
    return this.getTutor(userId);
  },
  async tutorRating(userId) {
    const r = await q(`SELECT ROUND(AVG(rating)::numeric,1) avg, COUNT(*) count FROM reviews WHERE tutor_id=$1`, [userId]);
    return { avg: r.rows[0].avg != null ? Number(r.rows[0].avg) : 0, count: num(r.rows[0].count) };
  },
  async listTutors({ subject, region, mode, q: kw } = {}) {
    const where = [`(COALESCE(t.school,'')<>'' OR jsonb_array_length(COALESCE(t.subjects,'[]'::jsonb))>0)`];
    const p = []; let i = 1;
    if (subject) { where.push(`t.subjects @> jsonb_build_array($${i}::text)`); p.push(subject); i++; }
    if (mode) { where.push(`t.modes @> jsonb_build_array($${i}::text)`); p.push(mode); i++; }
    if (region) { where.push(`COALESCE(t.region,'') ILIKE '%'||$${i}||'%'`); p.push(region); i++; }
    if (kw) {
      where.push(`(COALESCE(t.name,'')||' '||COALESCE(t.school,'')||' '||COALESCE(t.major,'')||' '||COALESCE(t.bio,'')||' '||COALESCE(t.tags::text,'')||' '||COALESCE(t.subjects::text,'')) ILIKE '%'||$${i}||'%'`);
      p.push(kw); i++;
    }
    const r = await q(`SELECT t.*, COALESCE(rv.avg,0) avg, COALESCE(rv.count,0) count FROM tutors t
      LEFT JOIN (SELECT tutor_id, ROUND(AVG(rating)::numeric,1) avg, COUNT(*) count FROM reviews GROUP BY tutor_id) rv
      ON rv.tutor_id=t.user_id WHERE ${where.join(" AND ")}`, p);
    return r.rows.map(rowToTutor);
  },
  async allTutorsVisible() { return this.listTutors({}); },

  /* 需求 */
  async createRequest(r) {
    const row = (await q(`INSERT INTO requests(parent_id,subject,grade,mode,region,budget,descr,phone,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [r.parentId, r.subject, r.grade, r.mode, r.region, r.budget, r.desc, r.phone, Date.now()])).rows[0];
    return rowToReq(row);
  },
  async listRequests({ subject, region, mode } = {}) {
    const where = []; const p = []; let i = 1;
    if (subject) { where.push(`r.subject=$${i}`); p.push(subject); i++; }
    if (mode) { where.push(`r.mode=$${i}`); p.push(mode); i++; }
    if (region) { where.push(`COALESCE(r.region,'') ILIKE '%'||$${i}||'%'`); p.push(region); i++; }
    const sql = `SELECT r.*, COALESCE(u.name,'家长') parent_name FROM requests r LEFT JOIN users u ON u.id=r.parent_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY r.created_at DESC`;
    const rows = (await q(sql, p)).rows;
    return rows.map((x) => ({ ...rowToReq(x), parentName: x.parent_name }));
  },
  async allRequests() { return this.listRequests({}); },
  async requestsByParent(parentId) {
    const rows = (await q(`SELECT * FROM requests WHERE parent_id=$1 ORDER BY created_at DESC`, [parentId])).rows;
    return rows.map(rowToReq);
  },

  /* 评价 */
  async createReview(r) {
    const row = (await q(`INSERT INTO reviews(tutor_id,parent_id,rating,comment,created_at) VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [r.tutorId, r.parentId, r.rating, r.comment, Date.now()])).rows[0];
    return { id: row.id, tutorId: row.tutor_id, parentId: row.parent_id, rating: row.rating, comment: row.comment, createdAt: num(row.created_at) };
  },
  async listReviews(tutorId) {
    const rows = (await q(`SELECT rv.*, COALESCE(u.name,'匿名') parent_name FROM reviews rv LEFT JOIN users u ON u.id=rv.parent_id
      WHERE rv.tutor_id=$1 ORDER BY rv.created_at DESC`, [tutorId])).rows;
    return rows.map((r) => ({ id: r.id, tutorId: r.tutor_id, parentId: r.parent_id, rating: r.rating, comment: r.comment, createdAt: num(r.created_at), parentName: r.parent_name }));
  },

  /* 收藏 */
  async toggleFavorite(userId, tutorId) {
    const ex = await q(`SELECT 1 FROM favorites WHERE user_id=$1 AND tutor_id=$2`, [userId, tutorId]);
    if (ex.rows.length) { await q(`DELETE FROM favorites WHERE user_id=$1 AND tutor_id=$2`, [userId, tutorId]); return false; }
    await q(`INSERT INTO favorites(user_id,tutor_id,created_at) VALUES($1,$2,$3)`, [userId, tutorId, Date.now()]);
    return true;
  },
  async favoriteIds(userId) { return (await q(`SELECT tutor_id FROM favorites WHERE user_id=$1`, [userId])).rows.map((r) => r.tutor_id); },
  async listFavorites(userId) {
    const ids = await this.favoriteIds(userId);
    if (!ids.length) return [];
    const r = await q(`SELECT t.*, COALESCE(rv.avg,0) avg, COALESCE(rv.count,0) count FROM tutors t
      LEFT JOIN (SELECT tutor_id, ROUND(AVG(rating)::numeric,1) avg, COUNT(*) count FROM reviews GROUP BY tutor_id) rv
      ON rv.tutor_id=t.user_id WHERE t.user_id = ANY($1)`, [ids]);
    return r.rows.map((row) => ({ ...rowToTutor(row), faved: true }));
  },

  /* 私信 */
  async createMessage(m) {
    const row = (await q(`INSERT INTO messages(from_id,to_id,text,read,created_at) VALUES($1,$2,$3,false,$4) RETURNING *`,
      [m.fromId, m.toId, m.text, Date.now()])).rows[0];
    return rowToMsg(row);
  },
  async conversations(userId) {
    const mine = (await q(`SELECT * FROM messages WHERE from_id=$1 OR to_id=$1 ORDER BY created_at ASC`, [userId])).rows.map(rowToMsg);
    const map = new Map();
    for (const m of mine) {
      const other = m.fromId === userId ? m.toId : m.fromId;
      if (!map.has(other)) map.set(other, { lastAt: 0, last: "", unread: 0 });
      const c = map.get(other);
      if (m.createdAt >= c.lastAt) { c.lastAt = m.createdAt; c.last = m.text; }
      if (m.toId === userId && !m.read) c.unread++;
    }
    const ids = [...map.keys()];
    const users = ids.length ? (await q(`SELECT id,name,role FROM users WHERE id = ANY($1)`, [ids])).rows : [];
    const uMap = new Map(users.map((u) => [u.id, u]));
    return [...map.entries()].map(([otherId, c]) => {
      const u = uMap.get(otherId) || {};
      return { userId: otherId, name: u.name || "用户", role: u.role, last: c.last, lastAt: c.lastAt, unread: c.unread };
    }).sort((a, b) => b.lastAt - a.lastAt);
  },
  async thread(userId, other) {
    const rows = (await q(`SELECT * FROM messages WHERE (from_id=$1 AND to_id=$2) OR (from_id=$2 AND to_id=$1) ORDER BY created_at ASC`, [userId, other])).rows;
    await q(`UPDATE messages SET read=true WHERE to_id=$1 AND from_id=$2 AND read=false`, [userId, other]);
    return rows.map(rowToMsg);
  },
  async unreadCount(userId) { return num((await q(`SELECT COUNT(*) FROM messages WHERE to_id=$1 AND read=false`, [userId])).rows[0].count); },
};
