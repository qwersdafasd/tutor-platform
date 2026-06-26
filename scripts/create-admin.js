/**
 * 创建（或把已有账号升级为）管理员。
 *
 * 用法（在 tutor-platform 目录下）：
 *   1) 在 .env 里设置 ADMIN_PHONE / ADMIN_PASSWORD（可选 ADMIN_NAME），然后：
 *        node scripts/create-admin.js
 *   2) 或直接命令行传参：
 *        node scripts/create-admin.js 13800000000 你的密码 管理员
 *
 * 行为：手机号已存在 → 升级为 admin 并重置密码；不存在 → 新建 admin 账号。
 * 数据层按 .env 自动选择（配了 MYSQL_URL/DB_DRIVER=mysql 则写入 MySQL）。
 */
require("dotenv").config();
const crypto = require("crypto");
const store = require("../store");

function hashPwd(pwd) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pwd, salt, 32).toString("hex")}`;
}

(async () => {
  const phone = process.argv[2] || process.env.ADMIN_PHONE;
  const password = process.argv[3] || process.env.ADMIN_PASSWORD;
  const name = process.argv[4] || process.env.ADMIN_NAME || "管理员";

  if (!phone || !password) {
    console.error("❌ 缺少手机号或密码。请在 .env 设置 ADMIN_PHONE / ADMIN_PASSWORD，或命令行传参。");
    process.exit(1);
  }

  await store.init();
  const existing = await store.findUserByPhone(phone);
  if (existing) {
    await store.setUserRole(existing.id, "admin");
    if (store.resetPassword) await store.resetPassword(existing.id, hashPwd(password));
    console.log(`✅ 已把账号「${existing.name}」(${phone}) 升级为管理员${store.resetPassword ? "并重置密码" : ""}。`);
  } else {
    const user = await store.createUser({ name, phone, role: "admin", pwd: hashPwd(password) });
    console.log(`✅ 已创建管理员账号：${name}（手机号 ${phone}，id=${user.id}）。`);
  }
  console.log("👉 现在用这个手机号+密码登录，即可看到「管理后台」。");
  process.exit(0);
})().catch((e) => { console.error("❌ 出错：", e.message); process.exit(1); });
