/**
 * 家教帮 · 大学生家教接单平台
 * Node.js + Express。数据层可切换：本地 JSON / 线上 Supabase Postgres（见 store/）。
 */
require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const path = require("path");
const store = require("./store");

const app = express();
const PORT = process.env.PORT || 5200;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* 统一包装 async 路由的错误处理 */
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e);
  res.status(500).json({ error: "服务器错误：" + e.message });
});

/* ============== 密码哈希 ============== */
function hashPwd(pwd) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pwd, salt, 32).toString("hex")}`;
}
function verifyPwd(pwd, stored) {
  const [salt, hash] = stored.split(":");
  const test = crypto.scryptSync(pwd, salt, 32).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(test, "hex"));
}

/* ============== 鉴权 ============== */
const tokenOf = (req) => (req.headers.authorization || "").replace("Bearer ", "");
async function auth(req, res, next) {
  try {
    const userId = await store.getSessionUserId(tokenOf(req));
    if (!userId) return res.status(401).json({ error: "未登录" });
    const user = await store.findUserById(userId);
    if (!user) return res.status(401).json({ error: "用户不存在" });
    req.user = user; next();
  } catch (e) { res.status(500).json({ error: e.message }); }
}
async function optionalAuth(req, _res, next) {
  try {
    const userId = await store.getSessionUserId(tokenOf(req));
    if (userId) req.user = await store.findUserById(userId);
  } catch {}
  next();
}
const publicUser = (u) => ({ id: u.id, name: u.name, role: u.role, phone: u.phone });

/* ============== 注册 / 登录 ============== */
app.post("/api/register", wrap(async (req, res) => {
  const { name, phone, password, role } = req.body || {};
  if (!name || !phone || !password || !["tutor", "parent"].includes(role))
    return res.status(400).json({ error: "请填写完整信息（姓名/手机号/密码/身份）" });
  if (await store.findUserByPhone(phone)) return res.status(400).json({ error: "该手机号已注册" });
  const user = await store.createUser({ name, phone, role, pwd: hashPwd(password) });
  if (role === "tutor") await store.createTutor({ userId: user.id, name, phone });
  const token = crypto.randomBytes(24).toString("hex");
  await store.createSession(token, user.id);
  res.json({ token, user: publicUser(user) });
}));

app.post("/api/login", wrap(async (req, res) => {
  const { phone, password } = req.body || {};
  const user = await store.findUserByPhone(phone);
  if (!user || !verifyPwd(password, user.pwd)) return res.status(400).json({ error: "手机号或密码错误" });
  const token = crypto.randomBytes(24).toString("hex");
  await store.createSession(token, user.id);
  res.json({ token, user: publicUser(user) });
}));

app.post("/api/logout", auth, wrap(async (req, res) => { await store.deleteSession(tokenOf(req)); res.json({ ok: true }); }));
app.get("/api/me", auth, (req, res) => res.json({ user: publicUser(req.user) }));

/* ============== 老师 ============== */
app.get("/api/tutors", optionalAuth, wrap(async (req, res) => {
  const tutors = await store.listTutors(req.query);
  const favIds = new Set(req.user ? await store.favoriteIds(req.user.id) : []);
  const out = tutors.map((t) => ({ ...t, faved: favIds.has(t.userId) }));
  out.sort((a, b) => (b.boosted - a.boosted) || (b.avg - a.avg) || (b.count - a.count));
  res.json({ tutors: out });
}));

app.get("/api/tutors/:id", optionalAuth, wrap(async (req, res) => {
  const id = +req.params.id;
  const t = await store.getTutor(id);
  if (!t) return res.status(404).json({ error: "老师不存在" });
  const rating = await store.tutorRating(id);
  const reviews = await store.listReviews(id);
  const faved = req.user ? (await store.favoriteIds(req.user.id)).includes(id) : false;
  res.json({ tutor: { ...t, ...rating, faved }, reviews });
}));

app.put("/api/tutor/profile", auth, wrap(async (req, res) => {
  if (req.user.role !== "tutor") return res.status(403).json({ error: "仅老师可编辑档案" });
  const t = await store.updateTutor(req.user.id, req.body || {});
  if (!t) return res.status(404).json({ error: "档案不存在" });
  res.json({ tutor: t });
}));

app.get("/api/tutor/profile", auth, wrap(async (req, res) => {
  const t = await store.getTutor(req.user.id);
  if (!t) return res.status(404).json({ error: "档案不存在（你不是老师身份）" });
  res.json({ tutor: t });
}));

app.post("/api/tutor/verify", auth, wrap(async (req, res) => {
  if (req.user.role !== "tutor") return res.status(403).json({ error: "仅老师可认证" });
  const { realName, school } = req.body || {};
  if (!realName || !school) return res.status(400).json({ error: "请填写真实姓名和学校" });
  const t = await store.verifyTutor(req.user.id, { realName, school, at: Date.now() });
  if (!t) return res.status(404).json({ error: "档案不存在" });
  res.json({ tutor: t });
}));

/* ============== 家长需求 ============== */
app.get("/api/requests", optionalAuth, wrap(async (req, res) => {
  res.json({ requests: await store.listRequests(req.query) });
}));

app.post("/api/requests", auth, wrap(async (req, res) => {
  if (req.user.role !== "parent") return res.status(403).json({ error: "仅家长可发布需求" });
  const f = req.body || {};
  if (!f.subject || !f.grade) return res.status(400).json({ error: "请至少填写科目和年级" });
  const request = await store.createRequest({
    parentId: req.user.id, subject: f.subject, grade: f.grade, mode: f.mode || "不限",
    region: f.region || "", budget: f.budget || "", desc: f.desc || "", phone: req.user.phone,
  });
  res.json({ request });
}));

/* ============== 评价 ============== */
app.post("/api/tutors/:id/reviews", auth, wrap(async (req, res) => {
  if (req.user.role !== "parent") return res.status(403).json({ error: "仅家长可评价" });
  const tutorId = +req.params.id;
  if (!(await store.getTutor(tutorId))) return res.status(404).json({ error: "老师不存在" });
  const rating = Number((req.body || {}).rating);
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: "评分需为 1-5 星" });
  const review = await store.createReview({ tutorId, parentId: req.user.id, rating, comment: (req.body || {}).comment || "" });
  res.json({ review });
}));

/* ============== 收藏 ============== */
app.post("/api/tutors/:id/favorite", auth, wrap(async (req, res) => {
  const tutorId = +req.params.id;
  if (!(await store.getTutor(tutorId))) return res.status(404).json({ error: "老师不存在" });
  res.json({ faved: await store.toggleFavorite(req.user.id, tutorId) });
}));

app.get("/api/favorites", auth, wrap(async (req, res) => {
  res.json({ tutors: await store.listFavorites(req.user.id) });
}));

/* ============== 私信 ============== */
app.post("/api/messages", auth, wrap(async (req, res) => {
  const { toId, text } = req.body || {};
  if (+toId === req.user.id) return res.status(400).json({ error: "不能给自己发消息" });
  if (!(await store.findUserById(+toId))) return res.status(404).json({ error: "对方不存在" });
  if (!text || !text.trim()) return res.status(400).json({ error: "消息不能为空" });
  res.json({ message: await store.createMessage({ fromId: req.user.id, toId: +toId, text: text.trim() }) });
}));

app.get("/api/conversations", auth, wrap(async (req, res) => {
  const conversations = await store.conversations(req.user.id);
  res.json({ conversations, totalUnread: conversations.reduce((s, c) => s + c.unread, 0) });
}));

app.get("/api/messages/:userId", auth, wrap(async (req, res) => {
  const other = +req.params.userId;
  const messages = await store.thread(req.user.id, other);
  const u = await store.findUserById(other);
  res.json({ messages, peer: { id: other, name: u ? u.name : "用户", role: u ? u.role : "" } });
}));

app.get("/api/unread", auth, wrap(async (req, res) => res.json({ count: await store.unreadCount(req.user.id) })));

/* ============== 智能匹配推荐 ============== */
app.get("/api/match", auth, wrap(async (req, res) => {
  if (req.user.role === "tutor") {
    const t = await store.getTutor(req.user.id);
    if (!t) return res.json({ type: "requests", items: [] });
    const reqs = await store.allRequests();
    const scored = reqs.map((r) => {
      let s = 0;
      if (t.subjects.includes(r.subject)) s += 3;
      if (t.region && r.region && t.region === r.region) s += 2;
      if (r.mode === "线上" || t.modes.includes(r.mode)) s += 1;
      return { r, s };
    }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 10);
    return res.json({ type: "requests", items: scored.map((x) => x.r) });
  }
  const last = (await store.requestsByParent(req.user.id))[0];
  let tutors = await store.allTutorsVisible();
  let basedOn = null;
  if (last) {
    basedOn = `${last.subject}·${last.grade}`;
    const scored = tutors.map((t) => {
      let s = 0;
      if (t.subjects.includes(last.subject)) s += 3;
      if (t.region && last.region && t.region === last.region) s += 2;
      if (last.mode === "不限" || t.modes.includes(last.mode)) s += 1;
      return { t, s };
    }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 10);
    tutors = scored.map((x) => x.t);
  } else {
    tutors = tutors.slice(0, 10);
  }
  res.json({ type: "tutors", items: tutors, basedOn });
}));

/* ============== 启动 ============== */
store.init().then(() => {
  app.listen(PORT, () => console.log(`✅ 家教帮已启动： http://localhost:${PORT}`));
}).catch((e) => { console.error("数据库初始化失败：", e); process.exit(1); });
