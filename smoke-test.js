/* 全功能实测：对正在运行的 server 发真实 HTTP 请求，覆盖各角色全流程。
 * 用测试专用手机号(199*)，跑完自动清理，不污染正式数据。结果写 smoke-out.txt。 */
require("dotenv").config();
const http = require("http");
const fs = require("fs");
const crypto = require("crypto");
const store = require("./store");
const PORT = process.env.PORT || 5200;

let out = "", pass = 0, fail = 0;
const log = (s) => { out += s + "\n"; };
const ok = (name, cond, extra) => { if (cond) { pass++; log("PASS " + name); } else { fail++; log("FAIL " + name + (extra ? "  :: " + extra : "")); } };

function req(method, path, { token, body } = {}) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      host: "127.0.0.1", port: PORT, path: "/api" + path, method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}), ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) },
    }, (resp) => { let d = ""; resp.on("data", (c) => d += c); resp.on("end", () => { let j = {}; try { j = JSON.parse(d); } catch {} resolve({ status: resp.statusCode, body: j }); }); });
    r.on("error", (e) => resolve({ status: 0, body: { error: e.message } }));
    if (data) r.write(data); r.end();
  });
}

const PHONES = ["19900000001", "19900000002", "19900000003"];
async function cleanup() { for (const p of PHONES) { const u = await store.findUserByPhone(p); if (u) await store.deleteUser(u.id); } }

(async () => {
  await store.init();
  await cleanup();

  // ---- 注册 / 登录 ----
  let r = await req("POST", "/register", { body: { name: "测试家长", phone: PHONES[0], password: "pass123", role: "parent" } });
  ok("注册-家长", r.status === 200 && !!r.body.token, JSON.stringify(r.body));
  const parentTok = r.body.token, parentId = r.body.user && r.body.user.id;

  r = await req("POST", "/register", { body: { name: "测试老师", phone: PHONES[1], password: "pass123", role: "tutor" } });
  ok("注册-老师", r.status === 200 && !!r.body.token);
  const tutorTok = r.body.token, tutorId = r.body.user && r.body.user.id;

  r = await req("POST", "/login", { body: { phone: PHONES[0], password: "pass123" } });
  ok("登录-正确密码", r.status === 200 && !!r.body.token);
  r = await req("POST", "/login", { body: { phone: PHONES[0], password: "x" } });
  ok("登录-错误密码被拒", r.status === 400);
  r = await req("GET", "/me", { token: parentTok });
  ok("获取当前用户", r.status === 200 && r.body.user.role === "parent");

  // ---- 老师档案 ----
  r = await req("PUT", "/tutor/profile", { token: tutorTok, body: { school: "测试大学", major: "数学", subjects: ["数学"], modes: ["线上"], region: "北京", hourlyRate: 100, bio: "测试简介" } });
  ok("老师-编辑档案", r.status === 200 && r.body.tutor.school === "测试大学" && r.body.tutor.subjects.includes("数学"));
  r = await req("PUT", "/tutor/profile", { token: parentTok, body: { school: "x" } });
  ok("老师-家长越权被拒", r.status === 403);
  r = await req("POST", "/tutor/verify", { token: tutorTok, body: { realName: "张三", school: "测试大学" } });
  ok("老师-实名认证", r.status === 200 && r.body.tutor.verified === true);

  // ---- 老师列表/详情 ----
  r = await req("GET", "/tutors");
  ok("老师-列表含测试老师", r.status === 200 && Array.isArray(r.body.tutors) && r.body.tutors.some((t) => t.userId === tutorId));
  r = await req("GET", "/tutors/" + tutorId);
  ok("老师-详情", r.status === 200 && r.body.tutor.userId === tutorId);

  // ---- 需求 ----
  r = await req("POST", "/requests", { token: parentTok, body: { subject: "数学", grade: "高中", mode: "线上", region: "北京", desc: "测试需求" } });
  ok("需求-家长发布", r.status === 200 && !!r.body.request.id);
  const reqId = r.body.request.id;
  r = await req("POST", "/requests", { token: tutorTok, body: { subject: "数学", grade: "高中" } });
  ok("需求-老师越权被拒", r.status === 403);
  r = await req("GET", "/requests");
  ok("需求-列表", r.status === 200 && Array.isArray(r.body.requests));

  // ---- 评价 ----
  r = await req("POST", "/tutors/" + tutorId + "/reviews", { token: parentTok, body: { rating: 5, comment: "测试评价很好" } });
  ok("评价-家长评价老师", r.status === 200 && !!r.body.review.id);
  const reviewId = r.body.review.id;
  r = await req("GET", "/tutors/" + tutorId);
  ok("评价-详情含评分", r.status === 200 && r.body.tutor.count >= 1 && r.body.reviews.length >= 1);

  // ---- 收藏 ----
  r = await req("POST", "/tutors/" + tutorId + "/favorite", { token: parentTok });
  ok("收藏-加收藏", r.status === 200 && r.body.faved === true);
  r = await req("POST", "/tutors/" + tutorId + "/favorite", { token: parentTok });
  ok("收藏-取消收藏", r.status === 200 && r.body.faved === false);

  // ---- 私信 + 文件上传 ----
  r = await req("POST", "/messages", { token: parentTok, body: { toId: tutorId, text: "你好老师" } });
  ok("私信-发文字", r.status === 200 && !!r.body.message.id);
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
  r = await req("POST", "/upload", { token: parentTok, body: { dataUrl: png, name: "test.png" } });
  ok("私信-上传图片", r.status === 200 && /^\/uploads\//.test(r.body.url || "") && r.body.kind === "image", JSON.stringify(r.body));
  const fileUrl = r.body.url;
  r = await req("POST", "/messages", { token: parentTok, body: { toId: tutorId, kind: "image", fileUrl, fileName: "test.png" } });
  ok("私信-发图片消息", r.status === 200 && r.body.message.kind === "image");
  r = await req("POST", "/messages", { token: parentTok, body: { toId: tutorId, kind: "image", fileUrl: "http://evil.com/x.png" } });
  ok("私信-拒绝外链附件", r.status === 400);
  r = await req("GET", "/conversations", { token: tutorTok });
  ok("私信-会话列表", r.status === 200 && r.body.conversations.some((c) => c.userId === parentId));
  r = await req("GET", "/messages/" + parentId, { token: tutorTok });
  ok("私信-聊天记录", r.status === 200 && r.body.messages.length >= 2);
  r = await req("GET", "/unread", { token: parentTok });
  ok("私信-未读数接口", r.status === 200 && typeof r.body.count === "number");

  // ---- 收费 ----
  r = await req("GET", "/billing/plans");
  ok("收费-套餐列表", r.status === 200 && r.body.plans.vip.length > 0 && r.body.provider === "mock");
  r = await req("POST", "/billing/order", { token: tutorTok, body: { type: "vip", plan: "vip_month" } });
  ok("收费-下单", r.status === 200 && !!r.body.order.id, JSON.stringify(r.body));
  const orderId = r.body.order.id;
  r = await req("POST", "/billing/mock-pay", { token: tutorTok, body: { orderId } });
  ok("收费-沙箱支付+发会员", r.status === 200 && r.body.vipExpire > Date.now());
  r = await req("GET", "/billing/me", { token: tutorTok });
  ok("收费-我的会员状态", r.status === 200 && r.body.vip === true && r.body.orders.length >= 1);

  // ---- 智能匹配 ----
  r = await req("GET", "/match", { token: parentTok });
  ok("智能匹配", r.status === 200 && !!r.body.type);

  // ---- 管理后台（临时建 admin + session）----
  const adminPwd = crypto.randomBytes(8).toString("hex");
  const admin = await store.createUser({ name: "测试管理员", phone: PHONES[2], role: "admin", pwd: "x:y" });
  const adminTok = crypto.randomBytes(16).toString("hex");
  await store.createSession(adminTok, admin.id);

  r = await req("GET", "/admin/stats", { token: adminTok });
  ok("管理-统计", r.status === 200 && typeof r.body.users === "number");
  r = await req("GET", "/admin/users", { token: adminTok });
  ok("管理-用户列表", r.status === 200 && Array.isArray(r.body.users));
  r = await req("GET", "/admin/users", { token: parentTok });
  ok("管理-非管理员被拒", r.status === 403);
  r = await req("POST", "/admin/users/" + parentId + "/role", { token: adminTok, body: { role: "tutor" } });
  ok("管理-改用户角色", r.status === 200);
  await req("POST", "/admin/users/" + parentId + "/role", { token: adminTok, body: { role: "parent" } });
  r = await req("POST", "/admin/users/" + admin.id + "/ban", { token: adminTok, body: { banned: true } });
  ok("管理-不能封禁自己", r.status === 400);
  r = await req("POST", "/admin/users/" + parentId + "/ban", { token: adminTok, body: { banned: true } });
  ok("管理-封禁用户", r.status === 200 && r.body.banned === true);
  r = await req("GET", "/me", { token: parentTok });
  ok("管理-被封用户禁止访问", r.status === 403);
  await req("POST", "/admin/users/" + parentId + "/ban", { token: adminTok, body: { banned: false } });
  r = await req("GET", "/admin/reviews", { token: adminTok });
  ok("管理-评论列表", r.status === 200 && Array.isArray(r.body.reviews));
  r = await req("DELETE", "/admin/reviews/" + reviewId, { token: adminTok });
  ok("管理-删评论", r.status === 200);
  r = await req("GET", "/admin/requests", { token: adminTok });
  ok("管理-需求列表", r.status === 200 && Array.isArray(r.body.requests));
  r = await req("DELETE", "/admin/requests/" + reqId, { token: adminTok });
  ok("管理-删需求", r.status === 200);
  r = await req("GET", "/admin/tutors", { token: adminTok });
  ok("管理-老师列表", r.status === 200 && Array.isArray(r.body.tutors));
  r = await req("DELETE", "/admin/tutors/" + tutorId, { token: adminTok });
  ok("管理-下架老师", r.status === 200);
  r = await req("GET", "/tutors/" + tutorId);
  ok("管理-下架后档案消失", r.status === 404);

  await cleanup();
  log(`\n==== 结果：通过 ${pass} / 失败 ${fail} ====`);
  fs.writeFileSync(require("path").join(__dirname, "smoke-out.txt"), out, "utf8");
  process.exit(0);
})().catch((e) => {
  log("致命错误: " + e.message + "\n" + (e.stack || ""));
  try { fs.writeFileSync(require("path").join(__dirname, "smoke-out.txt"), out, "utf8"); } catch {}
  process.exit(1);
});
