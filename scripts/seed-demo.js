require("dotenv").config();
const crypto = require("crypto");
const fs = require("fs");
const store = require("../store");
const hashPwd = (pwd) => { const s = crypto.randomBytes(16).toString("hex"); return `${s}:${crypto.scryptSync(pwd, s, 32).toString("hex")}`; };
const PWD = hashPwd("123456");
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const rndInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const sample = (a, n) => { const c = [...a]; const r = []; while (n-- > 0 && c.length) r.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]); return r; };
const XING = ["李","王","张","刘","陈","杨","赵","黄","周","吴","徐","孙","马","朱","胡","林","郭","何","高","罗"];
const MING = ["明轩","思雨","子涵","浩然","欣怡","宇航","佳怡","梓萱","俊杰","雨欣","文博","一诺","晓东","梦琪","志强","婷婷","雪莲","浩宇","静怡","嘉豪"];
const SCHOOLS = ["北京大学","清华大学","复旦大学","上海交通大学","浙江大学","南京大学","武汉大学","中山大学","四川大学","西安交通大学","华中科技大学","同济大学"];
const MAJORS = ["数学系","物理学院","计算机学院","英语系","中文系","化学系","生物科学","经济学院","外国语学院","教育学院"];
const SUBJECTS = ["语文","数学","英语","物理","化学","生物","政治","历史","地理","编程","钢琴","美术"];
const REGIONS = ["北京","上海","广州","深圳","杭州","成都","武汉","西安","南京"];
const GRADES_T = ["大二","大三","大四","研一","研二"];
const GRADES_S = ["小学","初中","高中"];
const TAGS = ["提分快","重点大学","耐心细致","竞赛","留学背景","艺术","基础提升","应试经验丰富"];
const BIOS = ["带过多名学生，提分效果显著。","讲解清晰，注重方法和思路。","耐心负责，因材施教。","有丰富的一对一辅导经验。","擅长帮基础薄弱的学生建立信心。"];
const REVIEWS = ["很负责，孩子进步明显。","讲得清楚，强烈推荐。","耐心细致，效果好。","性价比高，会继续报。","准备充分，方法得当。"];
const REQ_DESC = ["想找有经验的老师系统辅导。","孩子基础一般，希望稳步提分。","周末上课，长期稳定。","冲刺阶段，急需提高。"];
const N_TUTORS = 40, N_PARENTS = 20, N_REQUESTS = 30, N_CHATS = 10;
(async () => {
  await store.init();
  const tPhones = Array.from({ length: N_TUTORS }, (_, i) => "139000" + (10001 + i));
  const pPhones = Array.from({ length: N_PARENTS }, (_, i) => "137000" + (10001 + i));
  for (const p of [...tPhones, ...pPhones]) { const u = await store.findUserByPhone(p); if (u) await store.deleteUser(u.id); }
  const parents = [];
  for (let i = 0; i < N_PARENTS; i++) { const name = rnd(["赵","钱","孙","李","周","吴","郑","王"]) + rnd(["妈妈","爸爸","女士","先生"]); parents.push(await store.createUser({ name, phone: pPhones[i], role: "parent", pwd: PWD })); }
  const tutors = [];
  for (let i = 0; i < N_TUTORS; i++) {
    const name = rnd(XING) + rnd(MING);
    const u = await store.createUser({ name, phone: tPhones[i], role: "tutor", pwd: PWD });
    await store.createTutor({ userId: u.id, name, phone: tPhones[i] });
    await store.updateTutor(u.id, { name, school: rnd(SCHOOLS), major: rnd(MAJORS), grade: rnd(GRADES_T), subjects: sample(SUBJECTS, rndInt(1, 3)), modes: sample(["线上","线下"], rndInt(1, 2)), region: rnd(REGIONS), hourlyRate: rndInt(80, 300), bio: rnd(BIOS), tags: sample(TAGS, rndInt(1, 3)) });
    if (Math.random() < 0.55) await store.verifyTutor(u.id, { realName: name, school: "演示", at: Date.now() });
    if (Math.random() < 0.30) await store.grantEntitlement(u.id, "vip", rndInt(30, 365));
    if (Math.random() < 0.20) await store.grantEntitlement(u.id, "boost", rndInt(7, 30));
    tutors.push(u);
  }
  for (let i = 0; i < N_REQUESTS; i++) { const p = rnd(parents); await store.createRequest({ parentId: p.id, phone: p.phone, subject: rnd(SUBJECTS), grade: rnd(GRADES_S), mode: rnd(["线上","线下","不限"]), region: rnd(REGIONS), budget: rndInt(80, 180) + "-" + rndInt(200, 400) + "/时", desc: rnd(REQ_DESC) }); }
  let revN = 0;
  for (const t of tutors) { const n = rndInt(0, 8); for (let k = 0; k < n; k++) { await store.createReview({ tutorId: t.id, parentId: rnd(parents).id, rating: rndInt(3, 5), comment: rnd(REVIEWS) }); revN++; } }
  let msgN = 0;
  for (let i = 0; i < N_CHATS; i++) { const p = rnd(parents), t = rnd(tutors); await store.createMessage({ fromId: p.id, toId: t.id, text: "老师您好，请问还接学生吗？", kind: "text" }); await store.createMessage({ fromId: t.id, toId: p.id, text: "您好，可以的，方便说下孩子情况吗？", kind: "text" }); msgN += 2; }
  const s = await store.adminStats();
  fs.writeFileSync(require("path").join(__dirname, "..", "seed-result.txt"), `SEED 完成\n本次生成：老师 ${tutors.length}、家长 ${parents.length}、需求 ${N_REQUESTS}、评价 ${revN}、私信 ${msgN}\n全库统计：用户 ${s.users}、老师 ${s.tutors}、需求 ${s.requests}、评价 ${s.reviews}\n演示账号密码统一：123456\n`, "utf8");
  process.exit(0);
})().catch((e) => { try { fs.writeFileSync(require("path").join(__dirname, "..", "seed-result.txt"), "ERROR " + e.message, "utf8"); } catch {} process.exit(1); });
