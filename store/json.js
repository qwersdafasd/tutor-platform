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
  d.favorites ??= []; d.messages ??= []; d.orders ??= []; d.sessions ??= {};
  d.applications ??= []; d.teacherOrders ??= []; d.notifications ??= []; d.seq ??= 1;
  d.blocked ??= []; d.userPrefs ??= {};
  d.lessons ??= [];
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
// 由到期时间派生会员/置顶状态（boosted 供排序与“推广”标，vip 供 VIP 徽章）
const decorate = (t) => {
  const now = Date.now();
  return { ...t, vipExpire: t.vipExpire || 0, boostExpire: t.boostExpire || 0,
    vip: (t.vipExpire || 0) > now, boosted: (t.boostExpire || 0) > now };
};

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
      subjects: [], modes: [], region: "", hourlyRate: 0, bio: "", tags: [], verified: false,
      vipExpire: 0, boostExpire: 0, createdAt: Date.now() });
    save();
  },
  async getTutor(userId) { const t = db.tutors.find((t) => t.userId === userId); return t ? decorate(t) : null; },
  async updateTutor(userId, f) {
    const t = db.tutors.find((x) => x.userId === userId); if (!t) return null;
    Object.assign(t, {
      school: f.school ?? t.school, major: f.major ?? t.major, grade: f.grade ?? t.grade,
      subjects: Array.isArray(f.subjects) ? f.subjects : t.subjects,
      modes: Array.isArray(f.modes) ? f.modes : t.modes, region: f.region ?? t.region,
      hourlyRate: f.hourlyRate != null ? Number(f.hourlyRate) : t.hourlyRate,
      bio: f.bio ?? t.bio, tags: Array.isArray(f.tags) ? f.tags : t.tags, name: f.name ?? t.name,
    });
    save(); return decorate(t);
  },
  async verifyTutor(userId, info) {
    const t = db.tutors.find((x) => x.userId === userId); if (!t) return null;
    t.verified = true; t.verifyInfo = info; save(); return decorate(t);
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
    return list.map((t) => ({ ...decorate(t), ...rating(t.userId) }));
  },
  async allTutorsVisible() { return db.tutors.filter(isVisible).map((t) => ({ ...decorate(t), ...rating(t.userId) })); },

  /* 需求 */
  async createRequest(r) { const item = { id: nextId(), status: "open", createdAt: Date.now(), ...r }; db.requests.push(item); save(); return item; },
  async getRequest(id) { return db.requests.find((r) => r.id === id) || null; },
  async setRequestStatus(id, status) { const r = db.requests.find((x) => x.id === id); if (r) { r.status = status; save();} },
  async listRequests({ subject, region, mode, status } = {}) {
    let list = [...db.requests];
    if (subject) list = list.filter((r) => r.subject === subject);
    if (region) list = list.filter((r) => (r.region || "").includes(region));
    if (mode) list = list.filter((r) => r.mode === mode);
    if (status) list = list.filter((r) => r.status === status);
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

  /* 双向评价 - 家长评分 */
  async reviewParent(orderId, parentId, tutorId, rating, comment) {
    const rev = { id: nextId(), orderId, parentId, tutorId, rating, comment: comment || "", direction: "to_parent", createdAt: Date.now() };
    db.reviews.push(rev); save(); return rev;
  },
  async parentRatings(parentId) {
    const rs = db.reviews.filter((r) => r.parentId === parentId && r.direction === "to_parent");
    if (!rs.length) return { avg: 0, count: 0 };
    return { avg: Math.round((rs.reduce((s, r) => s + r.rating, 0) / rs.length) * 10) / 10, count: rs.length };
  },

  /* 通知中心 */
  async createNotification(n) {
    const notif = { id: nextId(), userId: n.userId, type: n.type, title: n.title, body: n.body || "", refId: n.refId || null, read: false, createdAt: Date.now() };
    db.notifications.push(notif); save(); return notif;
  },
  async listNotifications(userId) {
    return db.notifications.filter(n => n.userId === userId).sort((a,b) => b.createdAt - a.createdAt).slice(0, 50);
  },
  async markNotificationRead(id) {
    const n = db.notifications.find(x => x.id === id); if (n) { n.read = true; save(); }
  },
  async unreadNotificationCount(userId) {
    return db.notifications.filter(n => n.userId === userId && !n.read).length;
  },
  async markAllNotificationsRead(userId) {
    db.notifications.filter(n => n.userId === userId).forEach(n => n.read = true); save();
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
    return db.tutors.filter((t) => ids.includes(t.userId)).map((t) => ({ ...decorate(t), ...rating(t.userId), faved: true }));
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
      if (m.createdAt >= c.lastAt) { c.lastAt = m.createdAt; c.last = m.kind === "image" ? "[图片]" : m.kind === "file" ? `[文件] ${m.fileName || ""}`.trim() : (m.text || ""); }
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
  async contactedUserIds(userId) {
    const ids = new Set();
    db.messages.filter((m) => m.fromId === userId).forEach((m) => ids.add(m.toId));
    db.messages.filter((m) => m.toId === userId).forEach((m) => ids.add(m.fromId));
    return [...ids];
  },

  /* 接单申请 */
  async createApplication(a) {
    const app = { id: nextId(), requestId: a.requestId, tutorId: a.tutorId, message: a.message || "", status: "pending", createdAt: Date.now() };
    db.applications.push(app); save(); return app;
  },
  async getApplication(id) { return db.applications.find((a) => a.id === id) || null; },
  async listApplications(requestId) {
    return db.applications.filter((a) => a.requestId === requestId).sort((a, b) => b.createdAt - a.createdAt).map((a) => {
      const u = db.users.find((x) => x.id === a.tutorId) || {};
      const t = db.tutors.find((x) => x.userId === a.tutorId);
      return { ...a, tutorName: u.name || "老师", tutorSchool: t?.school || "", tutorVerified: !!t?.verified };
    });
  },
  async approveApplication(id) {
    const a = db.applications.find((x) => x.id === id); if (!a) return null;
    a.status = "approved"; save();
    const req = db.requests.find((r) => r.id === a.requestId);
    if (req) { req.status = "matched"; save(); }
    return a;
  },
  async rejectApplication(id) {
    const a = db.applications.find((x) => x.id === id); if (!a) return null;
    a.status = "rejected"; save(); return a;
  },

  /* 授课订单 */
  async createTeacherOrder(data) {
    const order = { id: nextId(), requestId: data.requestId, tutorId: data.tutorId, parentId: data.parentId,
      subject: data.subject, grade: data.grade, mode: data.mode, region: data.region,
      hourlyRate: data.hourlyRate, status: "teaching", createdAt: Date.now(), completedAt: 0 };
    db.teacherOrders.push(order); save(); return order;
  },
  async getTeacherOrder(id) {
    const o = db.teacherOrders.find((x) => x.id === id);
    if (!o) return null;
    const tutorName = userName(o.tutorId) || "老师";
    const parentName = userName(o.parentId) || "家长";
    return { ...o, tutorName, parentName };
  },
  async getTeacherOrderByRequest(requestId) {
    const o = db.teacherOrders.find((x) => x.requestId === requestId);
    if (!o) return null;
    const tutorName = userName(o.tutorId) || "老师";
    const parentName = userName(o.parentId) || "家长";
    return { ...o, tutorName, parentName };
  },
  async listTeacherOrders(userId) {
    let list = db.teacherOrders.filter((o) => o.tutorId === userId || o.parentId === userId);
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list.map((o) => {
      const isTutor = o.tutorId === userId;
      const peerId = isTutor ? o.parentId : o.tutorId;
      const peerName = userName(peerId) || (isTutor ? "家长" : "老师");
      return { ...o, peerName, peerRole: isTutor ? "parent" : "tutor" };
    });
  },
  async updateTeacherOrderStatus(id, status) {
    if (status !== "completed" && status !== "cancelled") return null;
    const o = db.teacherOrders.find((x) => x.id === id);
    if (!o) return null;
    o.status = status;
    if (status === "completed") o.completedAt = Date.now();
    save(); return o;
  },

  /* 订单 / 权益（会员 & 置顶） */
  async createOrder(o) {
    const order = { id: nextId(), userId: o.userId, type: o.type, plan: o.plan, amount: o.amount,
      days: o.days, outTradeNo: o.outTradeNo, status: "pending", createdAt: Date.now(), paidAt: 0 };
    db.orders.push(order); save(); return order;
  },
  async getOrder(id) { return db.orders.find((o) => o.id === id) || null; },
  async getOrderByOutTradeNo(no) { return db.orders.find((o) => o.outTradeNo === no) || null; },
  // 标记已支付；幂等：若已是 paid 返回 already=true，调用方据此避免重复发放权益
  async markOrderPaid(id) {
    const o = db.orders.find((x) => x.id === id); if (!o) return null;
    if (o.status === "paid") return { order: o, already: true };
    o.status = "paid"; o.paidAt = Date.now(); save(); return { order: o, already: false };
  },
  // 发放/续期权益：从 max(现在, 当前到期) 起叠加 days 天
  async grantEntitlement(userId, type, days) {
    const t = db.tutors.find((x) => x.userId === userId); if (!t) return null;
    const field = type === "vip" ? "vipExpire" : "boostExpire";
    const base = Math.max(Date.now(), t[field] || 0);
    t[field] = base + days * 86400000; save(); return decorate(t);
  },
  async listOrders(userId) { return db.orders.filter((o) => o.userId === userId).sort((a, b) => b.createdAt - a.createdAt); },

  /* ============== 管理员 ============== */
  async listAllUsers() {
    return [...db.users].sort((a, b) => b.createdAt - a.createdAt)
      .map((u) => ({ id: u.id, name: u.name, phone: u.phone, role: u.role, banned: !!u.banned, createdAt: u.createdAt }));
  },
  async setUserRole(id, role) { const u = db.users.find((x) => x.id === id); if (u) { u.role = role; save(); } },
  async resetPassword(id, pwd) { const u = db.users.find((x) => x.id === id); if (u) { u.pwd = pwd; save(); } },
  async setUserBanned(id, banned) { const u = db.users.find((x) => x.id === id); if (u) { u.banned = !!banned; save(); } },
  async deleteUser(id) {
    db.reviews = db.reviews.filter((r) => r.parentId !== id && r.tutorId !== id);
    db.requests = db.requests.filter((r) => r.parentId !== id);
    db.applications = db.applications.filter((a) => a.tutorId !== id && a.requestId !== id);
    db.messages = db.messages.filter((m) => m.fromId !== id && m.toId !== id);
    db.favorites = db.favorites.filter((f) => f.userId !== id && f.tutorId !== id);
    db.orders = db.orders.filter((o) => o.userId !== id);
    db.tutors = db.tutors.filter((t) => t.userId !== id);
    db.users = db.users.filter((u) => u.id !== id);
    for (const tok of Object.keys(db.sessions)) if (db.sessions[tok] === id) delete db.sessions[tok];
    save();
  },
  async deleteReview(id) { db.reviews = db.reviews.filter((r) => r.id !== id); save(); },
  async deleteRequest(id) {
    db.applications = db.applications.filter((a) => a.requestId !== id);
    db.requests = db.requests.filter((r) => r.id !== id); save();
  },
  async deleteTutorProfile(userId) {
    db.favorites = db.favorites.filter((f) => f.tutorId !== userId);
    db.reviews = db.reviews.filter((r) => r.tutorId !== userId);
    db.tutors = db.tutors.filter((t) => t.userId !== userId);
    save();
  },
  async adminAllReviews() {
    return [...db.reviews].sort((a, b) => b.createdAt - a.createdAt).map((r) => ({
      ...r, tutorName: userName(r.tutorId) || "—", parentName: userName(r.parentId) || "匿名",
    }));
  },
  /* 屏蔽用户 */
  async blockUser(userId, blockedId) {
    if (+userId === +blockedId) return false;
    const i = db.blocked.findIndex(b => b.userId === userId && b.blockedId === blockedId);
    if (i >= 0) return false;
    db.blocked.push({ userId, blockedId, createdAt: Date.now() });
    save(); return true;
  },
  async unblockUser(userId, blockedId) {
    db.blocked = db.blocked.filter(b => !(b.userId === userId && b.blockedId === blockedId));
    save();
  },
  async blockedIds(userId) { return db.blocked.filter(b => b.userId === userId).map(b => b.blockedId); },
  async isBlocked(userId, targetId) {
    return db.blocked.some(b => b.userId === userId && b.blockedId === targetId);
  },

  /* 通知偏好 */
  async setUserPrefs(userId, prefs) {
    db.userPrefs[userId] = { ...(db.userPrefs[userId] || {}), ...prefs };
    save(); return db.userPrefs[userId];
  },
  async getUserPrefs(userId) { return db.userPrefs[userId] || { quietStart: "", quietEnd: "", onlyVerified: false }; },

  /* 课时 */
  async createLesson(data) {
    const lesson = {
      id: nextId(), orderId: data.orderId, title: data.title || "",
      startTime: data.startTime, endTime: data.endTime, status: "scheduled",
      notes: data.notes || "", createdAt: Date.now(),
    };
    db.lessons.push(lesson); save(); return lesson;
  },
  async listLessons(orderId) {
    return db.lessons.filter((l) => l.orderId === orderId).sort((a, b) => a.startTime - b.startTime);
  },
  async getLesson(id) {
    return db.lessons.find((l) => l.id === id) || null;
  },
  async updateLesson(id, data) {
    const l = db.lessons.find((x) => x.id === id);
    if (!l) return null;
    if (data.title !== undefined) l.title = data.title;
    if (data.startTime !== undefined) l.startTime = data.startTime;
    if (data.endTime !== undefined) l.endTime = data.endTime;
    if (data.notes !== undefined) l.notes = data.notes;
    save(); return l;
  },
  async updateLessonStatus(id, status) {
    if (status !== "completed" && status !== "cancelled") return null;
    const l = db.lessons.find((x) => x.id === id);
    if (!l) return null;
    l.status = status;
    save(); return l;
  },
  async deleteLesson(id) {
    db.lessons = db.lessons.filter((l) => l.id !== id);
    save();
  },

  async adminStats() {
    return { users: db.users.length, tutors: db.tutors.length, requests: db.requests.length, reviews: db.reviews.length };
  },
};
