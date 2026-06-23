/**
 * 数据层入口：有 DATABASE_URL 就用 Postgres（线上），否则用 JSON 文件（本地开发）。
 */
const store = process.env.DATABASE_URL ? require("./pg") : require("./json");
console.log(`📦 数据层：${store.kind}${store.kind === "json" ? "（本地文件，仅开发用）" : ""}`);
module.exports = store;
