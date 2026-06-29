/**
 * 家教帮 · 大学生家教接单平台
 * Node.js + Express。数据层可切换：本地 JSON / 线上 Supabase Postgres（见 store/）。
 */
require("dotenv").config();
const express = require("express");
const http = require("http");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const { Server: SocketIOServer } = require("socket.io");
const store = require("./store");
const pay = require("./pay");

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e6,
});
const PORT = process.env.PORT || 5200;

// 上传目录（聊天图片/文件存这里，由 express.static 直接托管为 /uploads/xxx）
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ============== 变现套餐（单一真源；price 单位：分） ============== */
const PLANS = {
  vip: [
    { key: "vip_month", label: "会员·月卡", days: 30, price: 1900 },
    { key: "vip_quarter", label: "会员·季卡", days: 90, price: 4900 },
    { key: "vip_year", label: "会员·年卡", days: 365, price: 15900 },
  ],
  boost: [
    { key: "boost_7", label: "置顶·7天", days: 7, price: 990 },
    { key: "boost_30", label: "置顶·30天", days: 30, price: 2900 },
  ],
};
const findPlan = (type, key) => (PLANS[type] || []).find((p) => p.key === key) || null;

app.use(express.json({ limit: "20mb" })); // 放宽以容纳聊天图片/文件的 base64 上传
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
const tokenOfWS = (auth) => (auth?.token || "").replace("Bearer ", "");

// 登录态内存缓存：token -> {user, exp}。命中则免去每请求 2 次数据库查询（性能关键）。
// TTL 30 秒；退出登录 / 封禁 / 改角色 / 删用户时主动清缓存，保证及时生效。
const SESSION_TTL = 30000;
const sessionCache = new Map();
const wsUserMap = new Map(); // socketId -> userId
function cacheClear(token) { if (token) sessionCache.delete(token); else sessionCache.clear(); }
function wsUserLeave(userId) {
  for (const [sid, uid] of wsUserMap) {
    if (uid === userId) { wsUserMap.delete(sid); break; }
  }
}
// 按 token 解析出用户（先查缓存，未命中再查库并回填）。找不到返回 null。
async function resolveUser(token) {
  if (!token) return null;
  const hit = sessionCache.get(token);
  if (hit && hit.exp > Date.now()) return hit.user;
  if (hit) sessionCache.delete(token);
  const userId = await store.getSessionUserId(token);
  if (!userId) return null;
  const user = await store.findUserById(userId);
  if (!user) return null;
  sessionCache.set(token, { user, exp: Date.now() + SESSION_TTL });
  return user;
}
async function auth(req, res, next) {
  try {
    const user = await resolveUser(tokenOf(req));
    if (!user) return res.status(401).json({ error: "未登录" });
    if (user.banned) return res.status(403).json({ error: "账号已被封禁，如有疑问请联系管理员" });
    req.user = user; next();
  } catch (e) { res.status(500).json({ error: e.message }); }
}
// 仅管理员可访问（须接在 auth 之后）
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "需要管理员权限" });
  next();
}
async function optionalAuth(req, _res, next) {
  try {
    const user = await resolveUser(tokenOf(req));
    if (user && !user.banned) req.user = user;
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

app.post("/api/logout", auth, wrap(async (req, res) => { const t = tokenOf(req); await store.deleteSession(t); cacheClear(t); wsUserLeave(req.user.id); res.json({ ok: true }); }));
app.get("/api/me", auth, (req, res) => res.json({ user: publicUser(req.user) }));

/* ============== 老师 ============== */
app.get("/api/tutors", optionalAuth, wrap(async (req, res) => {
  const tutors = await store.listTutors(req.query);
  const favIds = new Set(req.user ? await store.favoriteIds(req.user.id) : []);
  const contactedIds = new Set(req.user ? await store.contactedUserIds(req.user.id) : []);
  const out = tutors.map((t) => ({ ...t, faved: favIds.has(t.userId), contacted: contactedIds.has(t.userId) }));
  const w = (t) => (t.boosted ? 2 : 0) + (t.vip ? 1 : 0); // 置顶优先、其次会员
  out.sort((a, b) => (w(b) - w(a)) || (b.avg - a.avg) || (b.count - a.count));
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

/* ============== 变现：会员 & 置顶 ============== */
const originOf = (req) => `${req.headers["x-forwarded-proto"] || req.protocol}://${req.headers.host}`;

// 套餐列表（前端展示用）
app.get("/api/billing/plans", (req, res) => res.json({ plans: PLANS, provider: pay.PROVIDER }));

// 我的会员/置顶状态 + 订单
app.get("/api/billing/me", auth, wrap(async (req, res) => {
  if (req.user.role !== "tutor") return res.status(403).json({ error: "仅老师有会员/推广" });
  const t = await store.getTutor(req.user.id);
  if (!t) return res.status(404).json({ error: "档案不存在" });
  const orders = await store.listOrders(req.user.id);
  res.json({ vipExpire: t.vipExpire, boostExpire: t.boostExpire, vip: t.vip, boosted: t.boosted, provider: pay.PROVIDER, orders });
}));

// 下单：建订单(pending) + 调支付适配器返回支付信息
app.post("/api/billing/order", auth, wrap(async (req, res) => {
  if (req.user.role !== "tutor") return res.status(403).json({ error: "仅老师可购买会员/推广" });
  const { type, plan: planKey } = req.body || {};
  const plan = findPlan(type, planKey);
  if (!plan) return res.status(400).json({ error: "套餐不存在" });
  const outTradeNo = `TP${Date.now()}${Math.floor(Math.random() * 1e4)}`;
  const order = await store.createOrder({ userId: req.user.id, type, plan: plan.key, amount: plan.price, days: plan.days, outTradeNo });
  let payInfo;
  try { payInfo = await pay.createPayment(order, { origin: originOf(req) }); }
  catch (e) { return res.status(502).json({ error: e.message }); }
  res.json({ order, plan, pay: payInfo });
}));

// 查询订单状态（前端轮询用）
app.get("/api/billing/order/:id", auth, wrap(async (req, res) => {
  const o = await store.getOrder(+req.params.id);
  if (!o || o.userId !== req.user.id) return res.status(404).json({ error: "订单不存在" });
  res.json({ order: o });
}));

// 沙箱支付确认（仅 mock 模式可用）——把支付平台回调“模拟”成一次点击
app.post("/api/billing/mock-pay", auth, wrap(async (req, res) => {
  if (pay.PROVIDER !== "mock") return res.status(403).json({ error: "非沙箱模式，请走真实支付" });
  const o = await store.getOrder(+(req.body || {}).orderId);
  if (!o || o.userId !== req.user.id) return res.status(404).json({ error: "订单不存在" });
  const r = await store.markOrderPaid(o.id);
  if (r && !r.already) await store.grantEntitlement(o.userId, o.type, o.days);
  const t = await store.getTutor(req.user.id);
  res.json({ ok: true, order: r.order, vipExpire: t.vipExpire, boostExpire: t.boostExpire });
}));

// 真实支付平台异步回调（mock 模式不使用；接入真实通道后由 pay.verifyNotify 验签）
app.post("/api/billing/notify", wrap(async (req, res) => {
  const v = await pay.verifyNotify(req);
  if (!v) return res.json({ ok: true }); // mock：忽略
  const o = await store.getOrderByOutTradeNo(v.outTradeNo);
  if (o) {
    const r = await store.markOrderPaid(o.id);
    if (r && !r.already) await store.grantEntitlement(o.userId, o.type, o.days);
  }
  res.json({ ok: true });
}));

/* ============== 家长需求 ============== */
app.get("/api/requests", optionalAuth, wrap(async (req, res) => {
  const requests = await store.listRequests(req.query);
  // 如果已登录，补充当前用户是否联系过发布者
  if (req.user) {
    const contacted = await store.contactedUserIds(req.user.id);
    const set = new Set(contacted);
    requests.forEach((r) => r.contacted = set.has(r.parentId));
  }
  res.json({ requests });
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

// 修改需求状态（家长：完成/关闭；管理员：任意）
app.patch("/api/requests/:id/status", auth, wrap(async (req, res) => {
  const id = +req.params.id, { status } = req.body || {};
  const valid = ["completed", "closed"];
  if (req.user.role === "admin") valid.push("open", "matched");
  if (!valid.includes(status)) return res.status(400).json({ error: "状态无效" });
  const request = await store.getRequest(id);
  if (!request) return res.status(404).json({ error: "需求不存在" });
  if (req.user.role !== "admin" && request.parentId !== req.user.id)
    return res.status(403).json({ error: "无权修改此需求" });
  await store.setRequestStatus(id, status);
  res.json({ ok: true, status });
}));

// 老师申请接单
app.post("/api/requests/:id/apply", auth, wrap(async (req, res) => {
  if (req.user.role !== "tutor") return res.status(403).json({ error: "仅老师可申请接单" });
  const requestId = +req.params.id;
  const { message } = req.body || {};
  // 检查需求存在且状态为 open
  const req2 = await store.getRequest(requestId);
  if (!req2) return res.status(404).json({ error: "需求不存在" });
  if (req2.status !== "open") return res.status(400).json({ error: "该需求已停止接受申请" });
  // 检查是否已申请过
  const apps = await store.listApplications(requestId);
  if (apps.some((a) => a.tutorId === req.user.id && a.status === "pending"))
    return res.status(400).json({ error: "你已经申请过了，等待家长确认" });
  const app = await store.createApplication({ requestId, tutorId: req.user.id, message: message || "" });
  notify(req2.parentId, "new_application", `${req.user.name} 申请接单`, `科目：${req2.subject}·${req2.grade}`, requestId);
  res.json({ application: app });
}));

// 查看需求的申请列表（仅家长/管理员）
app.get("/api/requests/:id/applications", auth, wrap(async (req, res) => {
  const requestId = +req.params.id;
  const req2 = await store.getRequest(requestId);
  if (!req2) return res.status(404).json({ error: "需求不存在" });
  if (req.user.role !== "admin" && req2.parentId !== req.user.id)
    return res.status(403).json({ error: "无权查看" });
  const applications = await store.listApplications(requestId);
  res.json({ applications });
}));

// 家长通过申请
app.post("/api/applications/:id/approve", auth, wrap(async (req, res) => {
  const app = await store.getApplication(+req.params.id);
  if (!app) return res.status(404).json({ error: "申请不存在" });
  const req2 = await store.getRequest(app.requestId);
  if (!req2) return res.status(404).json({ error: "需求不存在" });
  if (req.user.role !== "admin" && req2.parentId !== req.user.id)
    return res.status(403).json({ error: "无权操作" });
  if (app.status !== "pending") return res.status(400).json({ error: "该申请已处理" });
  const result = await store.approveApplication(app.id);
  // 通过时自动创建订单
  if (result && result.status === "approved") {
    try {
      const order = await store.createTeacherOrder({
        requestId: app.requestId, tutorId: app.tutorId, parentId: req2.parentId,
        subject: req2.subject, grade: req2.grade, mode: req2.mode || "", region: req2.region || "", hourlyRate: 0,
      });
      notify(app.tutorId, "application_approved", "申请已通过", `家长已通过你的申请：「${req2.subject}·${req2.grade}」`, order?.id);
    } catch (e) { console.error("创建订单失败:", e); }
  }
  res.json({ application: result });
}));

// 家长拒绝申请
app.post("/api/applications/:id/reject", auth, wrap(async (req, res) => {
  const app = await store.getApplication(+req.params.id);
  if (!app) return res.status(404).json({ error: "申请不存在" });
  const req2 = await store.getRequest(app.requestId);
  if (!req2) return res.status(404).json({ error: "需求不存在" });
  if (req.user.role !== "admin" && req2.parentId !== req.user.id)
    return res.status(403).json({ error: "无权操作" });
  const result = await store.rejectApplication(app.id);
  res.json({ application: result });
}));

// 已联系过的用户 ID 列表
app.get("/api/contacted/ids", auth, wrap(async (req, res) => {
  res.json({ ids: await store.contactedUserIds(req.user.id) });
}));

/* ============== 订单记录 ============== */
app.get("/api/orders", auth, wrap(async (req, res) => {
  const orders = await store.listTeacherOrders(req.user.id);
  res.json({ orders });
}));

app.get("/api/orders/:id", auth, wrap(async (req, res) => {
  const order = await store.getTeacherOrder(+req.params.id);
  if (!order) return res.status(404).json({ error: "订单不存在" });
  if (order.tutorId !== req.user.id && order.parentId !== req.user.id && req.user.role !== "admin")
    return res.status(403).json({ error: "无权查看" });
  res.json({ order });
}));

app.patch("/api/orders/:id/status", auth, wrap(async (req, res) => {
  const order = await store.getTeacherOrder(+req.params.id);
  if (!order) return res.status(404).json({ error: "订单不存在" });
  if (order.parentId !== req.user.id && order.tutorId !== req.user.id && req.user.role !== "admin")
    return res.status(403).json({ error: "无权操作" });
  const { status } = req.body || {};
  if (!["completed", "cancelled"].includes(status)) return res.status(400).json({ error: "状态无效" });
  // 把对应需求也同步为完成/关闭
  await store.updateTeacherOrderStatus(order.id, status);
  try { await store.setRequestStatus(order.requestId, status === "completed" ? "completed" : "closed"); } catch {}
  const updated = await store.getTeacherOrder(order.id);
  res.json({ order: updated });
}));

// 获取需求关联的订单
app.get("/api/requests/:id/order", auth, wrap(async (req, res) => {
  const requestId = +req.params.id;
  const order = await store.getTeacherOrderByRequest(requestId);
  if (!order) return res.json({ order: null });
  if (order.tutorId !== req.user.id && order.parentId !== req.user.id && req.user.role !== "admin")
    return res.json({ order: null });
  res.json({ order });
}));

/* ============== 课时/排课 ============== */
// 获取订单的课时列表
app.get("/api/orders/:id/lessons", auth, wrap(async (req, res) => {
  const order = await store.getTeacherOrder(+req.params.id);
  if (!order) return res.status(404).json({ error: "订单不存在" });
  if (order.tutorId !== req.user.id && order.parentId !== req.user.id && req.user.role !== "admin")
    return res.status(403).json({ error: "无权查看" });
  const lessons = await store.listLessons(order.id);
  res.json({ lessons });
}));

// 添加课时
app.post("/api/orders/:id/lessons", auth, wrap(async (req, res) => {
  const order = await store.getTeacherOrder(+req.params.id);
  if (!order) return res.status(404).json({ error: "订单不存在" });
  if (order.status !== "teaching") return res.status(400).json({ error: "仅授课中的订单可添加课时" });
  if (order.tutorId !== req.user.id && order.parentId !== req.user.id && req.user.role !== "admin")
    return res.status(403).json({ error: "无权操作" });
  const { title, startTime, endTime, notes } = req.body || {};
  if (!startTime) return res.status(400).json({ error: "请填写上课时间" });
  const lesson = await store.createLesson({
    orderId: order.id, title: title || "", startTime: +startTime, 
    endTime: endTime ? +endTime : 0, notes: notes || "",
  });
  res.json({ lesson });
}));

// 修改课时状态
app.patch("/api/lessons/:id/status", auth, wrap(async (req, res) => {
  const lesson = await store.getLesson(+req.params.id);
  if (!lesson) return res.status(404).json({ error: "课时不存在" });
  const order = await store.getTeacherOrder(lesson.orderId);
  if (!order) return res.status(404).json({ error: "订单不存在" });
  if (order.tutorId !== req.user.id && order.parentId !== req.user.id && req.user.role !== "admin")
    return res.status(403).json({ error: "无权操作" });
  const { status } = req.body || {};
  if (!["completed", "cancelled"].includes(status)) return res.status(400).json({ error: "状态无效" });
  const updated = await store.updateLessonStatus(lesson.id, status);
  res.json({ lesson: updated });
}));

// 编辑课时
app.put("/api/lessons/:id", auth, wrap(async (req, res) => {
  const lesson = await store.getLesson(+req.params.id);
  if (!lesson) return res.status(404).json({ error: "课时不存在" });
  const order = await store.getTeacherOrder(lesson.orderId);
  if (!order) return res.status(404).json({ error: "订单不存在" });
  if (order.tutorId !== req.user.id && order.parentId !== req.user.id && req.user.role !== "admin")
    return res.status(403).json({ error: "无权操作" });
  const { title, startTime, endTime, notes } = req.body || {};
  const updated = await store.updateLesson(lesson.id, { title, startTime, endTime, notes });
  res.json({ lesson: updated });
}));

// 删除课时
app.delete("/api/lessons/:id", auth, wrap(async (req, res) => {
  const lesson = await store.getLesson(+req.params.id);
  if (!lesson) return res.status(404).json({ error: "课时不存在" });
  const order = await store.getTeacherOrder(lesson.orderId);
  if (!order) return res.status(404).json({ error: "订单不存在" });
  if (order.tutorId !== req.user.id && order.parentId !== req.user.id && req.user.role !== "admin")
    return res.status(403).json({ error: "无权操作" });
  await store.deleteLesson(lesson.id);
  res.json({ ok: true });
}));

/* ============== 双向评价 ============== */
// 家长评价老师
app.post("/api/tutors/:id/reviews", auth, wrap(async (req, res) => {
  if (req.user.role !== "parent") return res.status(403).json({ error: "仅家长可评价" });
  const tutorId = +req.params.id;
  if (!(await store.getTutor(tutorId))) return res.status(404).json({ error: "老师不存在" });
  const rating = Number((req.body || {}).rating);
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: "评分需为 1-5 星" });
  const review = await store.createReview({ tutorId, parentId: req.user.id, rating, comment: (req.body || {}).comment || "", direction: "to_tutor" });
  res.json({ review });
}));

// 老师评价家长（基于已完成订单）
app.post("/api/parents/:id/reviews", auth, wrap(async (req, res) => {
  if (req.user.role !== "tutor") return res.status(403).json({ error: "仅老师可评价家长" });
  const parentId = +req.params.id;
  const { rating, comment, orderId } = req.body || {};
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: "评分需为 1-5 星" });
  // 验证该老师有与这个家长的已完成的订单
  if (orderId) {
    const order = await store.getTeacherOrder(+orderId);
    if (!order || order.tutorId !== req.user.id || order.parentId !== parentId)
      return res.status(403).json({ error: "无权评价此家长" });
  }
  const review = await store.reviewParent ? await store.reviewParent(+orderId, parentId, req.user.id, rating, comment || "") :
    await store.createReview({ tutorId: req.user.id, parentId, rating, comment: comment || "", direction: "to_parent" });
  res.json({ review });
}));

// 查看家长收到的评价
app.get("/api/parents/:id/ratings", optionalAuth, wrap(async (req, res) => {
  const r = await store.parentRatings ? await store.parentRatings(+req.params.id) : { avg: 0, count: 0 };
  res.json(r);
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
// 上传聊天附件（图片/文件）：前端把文件读成 dataURL 发来，这里解码落盘，返回可访问链接
const MAX_UPLOAD = 10 * 1024 * 1024; // 单文件 10MB
const EXT_BY_MIME = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };
const safeExt = (name) => {
  const m = /\.([a-z0-9]{1,8})$/i.exec(String(name || ""));
  return m ? m[1].toLowerCase() : "";
};
app.post("/api/upload", auth, wrap(async (req, res) => {
  const { dataUrl, name } = req.body || {};
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl || "");
  if (!m || !m[2]) return res.status(400).json({ error: "文件格式不正确" });
  const mime = (m[1] || "application/octet-stream").toLowerCase();
  const buf = Buffer.from(m[3], "base64");
  if (!buf.length) return res.status(400).json({ error: "文件为空" });
  if (buf.length > MAX_UPLOAD) return res.status(413).json({ error: "文件不能超过 10MB" });
  const kind = mime.startsWith("image/") ? "image" : "file";
  const ext = EXT_BY_MIME[mime] || safeExt(name) || "bin";
  const fileName = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}.${ext}`;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, fileName), buf);
  res.json({ url: `/uploads/${fileName}`, name: name || fileName, kind });
}));

app.post("/api/messages", auth, wrap(async (req, res) => {
  const { toId, text, kind = "text", fileUrl, fileName } = req.body || {};
  if (+toId === req.user.id) return res.status(400).json({ error: "不能给自己发消息" });
  if (!(await store.findUserById(+toId))) return res.status(404).json({ error: "对方不存在" });
  if (await store.isBlocked && await store.isBlocked(+toId, req.user.id))
    return res.status(403).json({ error: "对方已将你屏蔽，无法发送消息" });
  if (kind === "text") {
    if (!text || !text.trim()) return res.status(400).json({ error: "消息不能为空" });
  } else {
    // 图片/文件消息：必须带本站上传链接，防止注入外链
    if (!/^\/uploads\/[\w.-]+$/.test(String(fileUrl || ""))) return res.status(400).json({ error: "附件无效" });
  }
  const msg = kind === "text"
    ? { fromId: req.user.id, toId: +toId, text: text.trim(), kind: "text" }
    : { fromId: req.user.id, toId: +toId, text: "", kind, fileUrl, fileName: (fileName || "").slice(0, 120) };
  res.json({ message: await store.createMessage(msg) });
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

/* ============== 通知中心 ============== */
// 创建通知助手
async function notify(userId, type, title, body, refId) {
  try { await store.createNotification({ userId, type, title, body, refId }); } catch {}
}

app.get("/api/notifications", auth, wrap(async (req, res) => {
  res.json({ notifications: await store.listNotifications(req.user.id) });
}));

app.post("/api/notifications/:id/read", auth, wrap(async (req, res) => {
  await store.markNotificationRead(+req.params.id);
  res.json({ ok: true });
}));

app.post("/api/notifications/read-all", auth, wrap(async (req, res) => {
  await store.markAllNotificationsRead(req.user.id);
  res.json({ ok: true });
}));

app.get("/api/notifications/unread", auth, wrap(async (req, res) => {
  res.json({ count: await store.unreadNotificationCount(req.user.id) });
}));

/* ============== 修改密码 ============== */
app.post("/api/change-password", auth, wrap(async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) return res.status(400).json({ error: "请填写旧密码和新密码" });
  if (newPassword.length < 4) return res.status(400).json({ error: "新密码至少 4 位" });
  if (!verifyPwd(oldPassword, req.user.pwd)) return res.status(400).json({ error: "旧密码错误" });
  await store.resetPassword(req.user.id, hashPwd(newPassword));
  res.json({ ok: true });
}));

/* ============== 沟通偏好 ============== */
// 屏蔽用户
app.post("/api/block/:userId", auth, wrap(async (req, res) => {
  const blockedId = +req.params.userId;
  if (blockedId === req.user.id) return res.status(400).json({ error: "不能屏蔽自己" });
  const ok2 = await store.blockUser(req.user.id, blockedId);
  res.json({ ok: ok2 });
}));

app.post("/api/unblock/:userId", auth, wrap(async (req, res) => {
  await store.unblockUser(req.user.id, +req.params.userId);
  res.json({ ok: true });
}));

app.get("/api/blocked", auth, wrap(async (req, res) => {
  res.json({ ids: await store.blockedIds(req.user.id) });
}));

app.get("/api/blocked/:userId", auth, wrap(async (req, res) => {
  res.json({ blocked: await store.isBlocked(req.user.id, +req.params.userId) });
}));

// 通知偏好
app.get("/api/prefs", auth, wrap(async (req, res) => {
  res.json({ prefs: await store.getUserPrefs(req.user.id) });
}));

app.put("/api/prefs", auth, wrap(async (req, res) => {
  const { quietStart, quietEnd, onlyVerified } = req.body || {};
  const prefs = await store.setUserPrefs(req.user.id, { quietStart, quietEnd, onlyVerified });
  res.json({ prefs });
}));

/* ============== 管理员后台 ============== */
const ROLES = ["tutor", "parent", "admin"];
app.get("/api/admin/stats", auth, requireAdmin, wrap(async (req, res) => res.json(await store.adminStats())));

app.get("/api/admin/users", auth, requireAdmin, wrap(async (req, res) => res.json({ users: await store.listAllUsers() })));

app.post("/api/admin/users/:id/role", auth, requireAdmin, wrap(async (req, res) => {
  const id = +req.params.id, { role } = req.body || {};
  if (!ROLES.includes(role)) return res.status(400).json({ error: "角色无效" });
  if (id === req.user.id) return res.status(400).json({ error: "不能修改自己的角色" });
  const u = await store.findUserById(id);
  if (!u) return res.status(404).json({ error: "用户不存在" });
  await store.setUserRole(id, role);
  // 升级为老师且还没档案 → 自动建空档案
  if (role === "tutor" && !(await store.getTutor(id))) await store.createTutor({ userId: id, name: u.name, phone: u.phone });
  cacheClear();
  res.json({ ok: true });
}));

app.post("/api/admin/users/:id/ban", auth, requireAdmin, wrap(async (req, res) => {
  const id = +req.params.id, banned = !!(req.body || {}).banned;
  if (id === req.user.id) return res.status(400).json({ error: "不能封禁自己" });
  if (!(await store.findUserById(id))) return res.status(404).json({ error: "用户不存在" });
  await store.setUserBanned(id, banned);
  cacheClear();
  res.json({ ok: true, banned });
}));

app.delete("/api/admin/users/:id", auth, requireAdmin, wrap(async (req, res) => {
  const id = +req.params.id;
  if (id === req.user.id) return res.status(400).json({ error: "不能删除自己" });
  if (!(await store.findUserById(id))) return res.status(404).json({ error: "用户不存在" });
  await store.deleteUser(id);
  cacheClear();
  res.json({ ok: true });
}));

app.get("/api/admin/reviews", auth, requireAdmin, wrap(async (req, res) => res.json({ reviews: await store.adminAllReviews() })));
app.delete("/api/admin/reviews/:id", auth, requireAdmin, wrap(async (req, res) => { await store.deleteReview(+req.params.id); res.json({ ok: true }); }));

app.get("/api/admin/requests", auth, requireAdmin, wrap(async (req, res) => {
  const requests = (await store.allRequests()).sort((a, b) => b.createdAt - a.createdAt);
  res.json({ requests });
}));
app.delete("/api/admin/requests/:id", auth, requireAdmin, wrap(async (req, res) => { await store.deleteRequest(+req.params.id); res.json({ ok: true }); }));

app.get("/api/admin/tutors", auth, requireAdmin, wrap(async (req, res) => res.json({ tutors: await store.allTutorsVisible() })));
app.delete("/api/admin/tutors/:id", auth, requireAdmin, wrap(async (req, res) => { await store.deleteTutorProfile(+req.params.id); res.json({ ok: true }); }));

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

/* ============== WebSocket 实时消息 ============== */
io.use(async (socket, next) => {
  const user = await resolveUser(tokenOfWS(socket.handshake.auth));
  if (!user) return next(new Error("未登录或 token 无效"));
  if (user.banned) return next(new Error("账号已被封禁"));
  socket.data.user = user;
  wsUserMap.set(socket.id, user.id);
  next();
});

io.on("connection", (socket) => {
  const user = socket.data.user;
  const room = `user:${user.id}`;
  socket.join(room);
  console.log(`🔌 WS 连接: ${user.name}(${user.id})`);

  // 发送消息
  socket.on("message:send", async (data, ack) => {
    try {
      const { toId, text, kind, fileUrl, fileName } = data || {};
      if (+toId === user.id) return ack?.({ error: "不能给自己发消息" });
      if (!(await store.findUserById(+toId))) return ack?.({ error: "对方不存在" });
      // 检查对方是否屏蔽了我
      if (await store.isBlocked && await store.isBlocked(+toId, user.id))
        return ack?.({ error: "对方已将你屏蔽，无法发送消息" });
      if ((kind || "text") === "text") {
        if (!text || !text.trim()) return ack?.({ error: "消息不能为空" });
      } else {
        if (!/^\/uploads\/[\w.-]+$/.test(String(fileUrl || ""))) return ack?.({ error: "附件无效" });
      }
      const msg = await store.createMessage({
        fromId: user.id, toId: +toId,
        text: (text || "").trim(), kind: kind || "text", fileUrl, fileName,
      });
      // 推给双方
      [room, `user:${toId}`].forEach((r) => {
        io.to(r).emit("message:new", msg);
      });
      // 推未读数给接收方
      const count = await store.unreadCount(+toId);
      io.to(`user:${toId}`).emit("unread:update", count);
      ack?.({ ok: true, message: msg });
    } catch (e) {
      console.error("WS 消息发送失败:", e);
      ack?.({ error: e.message });
    }
  });

  // 标记已读
  socket.on("message:read", async (otherId) => {
    try {
      if (!otherId) return;
      await store.thread(user.id, +otherId); // thread 内含标记已读逻辑
      const count = await store.unreadCount(user.id);
      io.to(room).emit("unread:update", count);
    } catch { /* 静默 */ }
  });

  // 正在输入
  socket.on("typing", (toId) => {
    if (!toId) return;
    io.to(`user:${toId}`).emit("typing", { fromId: user.id, name: user.name });
  });

  socket.on("disconnect", () => {
    wsUserMap.delete(socket.id);
    console.log(`🔌 WS 断开: ${user.name}(${user.id})`);
  });
});

/* ============== 启动 ============== */
// 本地直接运行：初始化数据库并监听端口
if (require.main === module) {
  store.init().then(() => {
    server.listen(PORT, () => console.log(`✅ 家教帮已启动： http://localhost:${PORT}`));
  }).catch((e) => { console.error("数据库初始化失败：", e); process.exit(1); });
} else {
  // 被 import（如 Vercel serverless）：建表幂等，后台执行一次，不阻塞请求
  store.init().catch((e) => console.error("建表失败：", e));
}

module.exports = { app, server, io };
