/**
 * JSON 文件数据层（本地开发用）。实现与 store/pg.js 相同的异步 API。
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ seq: 1 }, null, 2));
  const d = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  d.users ??= []; d.tutors ??= []; d.requests ??= []; d.reviews ??= [];
  d.favorites ??= []; d.messages ??= []; d.sessions ??= {}; d.seq ??= 1;
  return d;
}
let db = load();
const save = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
const nextId = () => db.seq++;
const userName = (id) => (db.users.find((u) => u.id === id) || {}).name;

function rating(userId) {
  const rs = db.reviews.filter((r) => r.tutorId === userId);
  if (!rs.length) return { avg: 0, count: 0 };
  return { avg: Math.round((rs.reduce((s, r) => s + r.rating, 0) / rs.length) * 10) / 10, count: rs.length };
}
const isVisible = (t) => t.school || (t.subjects || []).length;

module.exports = {
  kind: "json",
  async init() { /* 文件库无需建表 */ },

  /* 用户 / 会话 */
  async createUser(u) { const user = { id: nextId(), createdAt: Date.now(), ...u }; db.users.push(user); save(); return user; },
  async findUserByPhone(phone) { return db.users.find((u) => u.phone === phone) || null; },
  async findUserById(id) { return db.users.find((u) => u.id === id) || null; },
  async createSession(token, userId) { db.sessions[token] = userId; save(); },
  async getSessionUserId(token) { return db.sessions[token] || null; },
  async deleteSession(token) { delete db.sessions[token]; save(); },

  /* 老师 */
  async createTutor(t) {
    db.tutors.push({ userId: t.userId, name: t.name, phone: t.phone, school: "", major: "", grade: "",
      subjects: [], modes: [], region: "", hourlyRate: 0, bio: "", tags: [], verified: false, boosted: false, createdAt: Date.now() });
    save();
  },
  async getTutor(userId) { return db.tutors.find((t) => t.userId === userId) || null; },
  async updateTutor(userId, f) {
    const t = db.tutors.find((x) => x.userId === userId); if (!t) return null;
    Object.assign(t, {
      school: f.school ?? t.school, major: f.major ?? t.major, grade: f.grade ?? t.grade,
      subjects: Array.isArray(f.subjects) ? f.subjects : t.subjects,
      modes: Array.isArray(f.modes) ? f.modes : t.modes, region: f.region ?? t.region,
      hourlyRate: f.hourlyRate != null ? Number(f.hourlyRate) : t.hourlyRate,
      bio: f.bio ?? t.bio, tags: Array.isArray(f.tags) ? f.tags : t.tags, name: f.name ?? t.name,
    });
    save(); return t;
  },
  async verifyTutor(userId, info) {
    const t = db.tutors.find((x) => x.userId === userId); if (!t) return null;
    t.verified = true; t.verifyInfo = info; save(); return t;
  },
  async tutorRating(userId) { return rating(userId); },
  async listTutors({ subject, region, mode, q } = {}) {
    let list = db.tutors.filter(isVisible);
    if (subject) list = list.filter((t) => t.subjects.includes(subject));
    if (region) list = list.filter((t) => (t.region || "").includes(region));
    if (mode) list = list.filter((t) => t.modes.includes(mode));
    if (q) {
      const kw = q.toLowerCase();
      list = list.filter((t) => [t.name, t.school, t.major, t.bio, (t.tags || []).join(" "), (t.subjects || []).join(" ")]
        .join(" ").toLowerCase().includes(kw));
    }
    return list.map((t) => ({ ...t, ...rating(t.userId) }));
  },
  async allTutorsVisible() { return db.tutors.filter(isVisible).map((t) => ({ ...t, ...rating(t.userId) })); },

  /* 需求 */
  async createRequest(r) { const item = { id: nextId(), createdAt: Date.now(), ...r }; db.requests.push(item); save(); return item; },
  async listRequests({ subject, region, mode } = {}) {
    let list = [...db.requests];
    if (subject) list = list.filter((r) => r.subject === subject);
    if (region) list = list.filter((r) => (r.region || "").includes(region));
    if (mode) list = list.filter((r) => r.mode === mode);
    return list.map((r) => ({ ...r, parentName: userName(r.parentId) || "家长" })).sort((a, b) => b.createdAt - a.createdAt);
  },
  async allRequests() { return db.requests.map((r) => ({ ...r, parentName: userName(r.parentId) || "家长" })); },
  async requestsByParent(parentId) { return db.requests.filter((r) => r.parentId === parentId).sort((a, b) => b.createdAt - a.createdAt); },

  /* 评价 */
  async createReview(r) { const rev = { id: nextId(), createdAt: Date.now(), ...r }; db.reviews.push(rev); save(); return rev; },
  async listReviews(tutorId) {
    return db.reviews.filter((r) => r.tutorId === tutorId)
      .map((r) => ({ ...r, parentName: userName(r.parentId) || "匿名" })).sort((a, b) => b.createdAt - a.createdAt);
  },

  /* 收藏 */
  async toggleFavorite(userId, tutorId) {
    const i = db.favorites.findIndex((f) => f.userId === userId && f.tutorId === tutorId);
    let faved; if (i >= 0) { db.favorites.splice(i, 1); faved = false; } else { db.favorites.push({ userId, tutorId, createdAt: Date.now() }); faved = true; }
    save(); return faved;
  },
  async favoriteIds(userId) { return db.favorites.filter((f) => f.userId === userId).map((f) => f.tutorId); },
  async listFavorites(userId) {
    const ids = db.favorites.filter((f) => f.userId === userId).map((f) => f.tutorId);
    return db.tutors.filter((t) => ids.includes(t.userId)).map((t) => ({ ...t, ...rating(t.userId), faved: true }));
  },

  /* 私信 */
  async createMessage(m) { const msg = { id: nextId(), read: false, createdAt: Date.now(), ...m }; db.messages.push(msg); save(); return msg; },
  async conversations(userId) {
    const mine = db.messages.filter((m) => m.fromId === userId || m.toId === userId);
    const map = new Map();
    for (const m of mine) {
      const other = m.fromId === userId ? m.toId : m.fromId;
      if (!map.has(other)) map.set(other, { lastAt: 0, last: "", unread: 0 });
      const c = map.get(other);
      if (m.createdAt >= c.lastAt) { c.lastAt = m.createdAt; c.last = m.text; }
      if (m.toId === userId && !m.read) c.unread++;
    }
    return [...map.entries()].map(([otherId, c]) => {
      const u = db.users.find((x) => x.id === otherId) || {};
      return { userId: otherId, name: u.name || "用户", role: u.role, last: c.last, lastAt: c.lastAt, unread: c.unread };
    }).sort((a, b) => b.lastAt - a.lastAt);
  },
  async thread(userId, other) {
    const msgs = db.messages.filter((m) => (m.fromId === userId && m.toId === other) || (m.fromId === other && m.toId === userId))
      .sort((a, b) => a.createdAt - b.createdAt);
    let changed = false;
    for (const m of msgs) if (m.toId === userId && !m.read) { m.read = true; changed = true; }
    if (changed) save();
    return msgs;
  },
  async unreadCount(userId) { return db.messages.filter((m) => m.toId === userId && !m.read).length; },
};
