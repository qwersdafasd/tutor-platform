/**
 * 数据层入口，按环境变量选择实现：
 *   1) MYSQL_URL 或 DB_DRIVER=mysql  → MySQL（本地/自建库，当前线上方案）
 *   2) DATABASE_URL                  → Postgres（Supabase，旧方案，保留兼容）
 *   3) 都没有                         → JSON 文件（纯本地开发）
 */
let store;
if (process.env.MYSQL_URL || (process.env.DB_DRIVER || "").toLowerCase() === "mysql") {
  store = require("./mysql");
} else if (process.env.DATABASE_URL) {
  store = require("./pg");
} else {
  store = require("./json");
}
console.log(`📦 数据层：${store.kind}${store.kind === "json" ? "（本地文件，仅开发用）" : ""}`);
module.exports = store;
