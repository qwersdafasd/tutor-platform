/* 自检脚本：核对三套 store 接口齐全 + server.js 路由能否无错加载。结果写入 verify-out.txt */
require("dotenv").config();
const fs = require("fs");
let out = "";
const log = (s) => { out += s + "\n"; };

const canonical = [
  "init", "createUser", "findUserByPhone", "findUserById", "createSession", "getSessionUserId", "deleteSession",
  "createTutor", "getTutor", "updateTutor", "verifyTutor", "tutorRating", "listTutors", "allTutorsVisible",
  "createRequest", "listRequests", "allRequests", "requestsByParent", "createReview", "listReviews",
  "toggleFavorite", "favoriteIds", "listFavorites", "createMessage", "conversations", "thread", "unreadCount",
  "createOrder", "getOrder", "getOrderByOutTradeNo", "markOrderPaid", "grantEntitlement", "listOrders",
  "listAllUsers", "setUserRole", "resetPassword", "setUserBanned", "deleteUser", "deleteReview",
  "deleteRequest", "deleteTutorProfile", "adminAllReviews", "adminStats",
];

log("=== store 接口齐全性 ===");
for (const name of ["json", "mysql", "pg"]) {
  try {
    const s = require("./store/" + name);
    const missing = canonical.filter((m) => typeof s[m] !== "function");
    log(`store/${name}: kind=${s.kind}  缺失方法=[${missing.join(", ") || "无"}]`);
  } catch (e) { log(`store/${name}: 加载失败 ${e.message}`); }
}

log("\n=== server.js 路由加载 ===");
try {
  require("./server.js"); // require.main !== module，不会真正 listen
  log("server.js: 全部路由定义加载成功，无 ReferenceError");
} catch (e) { log("server.js: 加载失败 " + e.message + "\n" + (e.stack || "")); }

log("\n=== pay 适配层 ===");
try { const pay = require("./pay"); log(`pay: provider=${pay.PROVIDER} createPayment=${typeof pay.createPayment} verifyNotify=${typeof pay.verifyNotify}`); }
catch (e) { log("pay: 加载失败 " + e.message); }

fs.writeFileSync(require("path").join(__dirname, "verify-out.txt"), out, "utf8");
process.exit(0);
