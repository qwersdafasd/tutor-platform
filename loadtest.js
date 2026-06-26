/* 简易压测：对正在运行的 server 并发打 GET /api/tutors（代表性读接口），
 * 测出真实 QPS 和延迟。只读不写，不污染数据。结果写 loadtest-out.txt。 */
const http = require("http");
const fs = require("fs");
const PORT = process.env.PORT || 5200;
const PATH = "/api/tutors";

function once() {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const r = http.request({ host: "127.0.0.1", port: PORT, path: PATH, method: "GET" }, (resp) => {
      resp.on("data", () => {});
      resp.on("end", () => resolve({ ok: resp.statusCode === 200, ms: Number(process.hrtime.bigint() - t0) / 1e6 }));
    });
    r.on("error", () => resolve({ ok: false, ms: Number(process.hrtime.bigint() - t0) / 1e6 }));
    r.end();
  });
}

async function run(concurrency, total) {
  const lat = []; let okN = 0, errN = 0, sent = 0;
  const start = Date.now();
  async function worker() { while (sent < total) { sent++; const r = await once(); (r.ok ? okN++ : errN++); lat.push(r.ms); } }
  await Promise.all(Array.from({ length: concurrency }, worker));
  const sec = (Date.now() - start) / 1000;
  lat.sort((a, b) => a - b);
  const pct = (p) => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))].toFixed(1);
  return { concurrency, total, sec: sec.toFixed(2), qps: Math.round(total / sec), ok: okN, err: errN, p50: pct(0.5), p95: pct(0.95), p99: pct(0.99) };
}

(async () => {
  let out = "压测目标 GET " + PATH + "（代表性只读接口）\n\n";
  await run(10, 200); // 预热
  for (const c of [10, 50, 100, 200]) {
    const r = await run(c, 2000);
    out += `并发 ${String(r.concurrency).padStart(3)}: QPS=${String(r.qps).padStart(5)}  成功=${r.ok} 失败=${r.err}  延迟 p50=${r.p50}ms p95=${r.p95}ms p99=${r.p99}ms  (耗时${r.sec}s)\n`;
  }
  fs.writeFileSync(require("path").join(__dirname, "loadtest-out.txt"), out, "utf8");
  process.exit(0);
})();
