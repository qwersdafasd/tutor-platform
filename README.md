# 家教帮 · 大学生家教接单平台

手机优先（H5）的大学生家教撮合平台。老师填档案、家长发需求，支持搜索筛选、收藏、私信、评价打分、实名认证、智能匹配推荐。

## 技术栈
- 后端：Node.js + Express
- 数据层**可切换**（按环境变量自动选择，见 `store/index.js`）：
  - 本地开发：`data/db.json` 文件（无需任何配置）
  - 线上部署：**MySQL**（设置 `MYSQL_URL` 或 `DB_DRIVER=mysql`，当前线上方案，对应阿里云 RDS MySQL）
  - 兼容保留：Postgres（设置 `DATABASE_URL`，旧的 Supabase 方案）
- 前端：原生 JS 单页应用（PWA，可添加到手机主屏）

## 本地运行
```bash
npm install
npm start
# 打开 http://localhost:5200
```
不设置 `DATABASE_URL` 时，数据存在 `data/db.json`。

---

## 部署上线（阿里云 ECS/轻量 + RDS MySQL）

> 方案：应用跑在阿里云 **ECS 或轻量应用服务器**（起步约 2核4G），数据库用 **RDS MySQL 基础版（单节点，有自动备份）**。
> ECS 与 RDS **同地域、同 VPC**，数据库走**内网连接 + IP 白名单**，RDS 不开公网；只有应用走 80/443 对外。

### 第 1 步：建 RDS MySQL（拿到 MYSQL_URL）
1. 阿里云控制台 → RDS → 创建实例 → 引擎 **MySQL**、**基础版**，地域/可用区与将来的 ECS 保持一致
2. 创建数据库（如 `tutor`）和账号，记下密码；开启自动备份（保留 ≥7 天）
3. 在 **数据库连接** 里拿到**内网地址**（形如 `rm-xxx.mysql.rds.aliyuncs.com:3306`）
4. 拼出连接串 `MYSQL_URL`：
   `mysql://用户名:密码@rm-xxx.mysql.rds.aliyuncs.com:3306/tutor`

> 建表会在服务首次启动时自动完成，不用手动建表。

### 第 2 步：开 ECS / 轻量服务器
1. 同地域同 VPC 开一台 ECS 或轻量应用服务器（约 2核4G），装好 Node.js（建议 LTS）
2. 安全组：对公网只放 **80/443**（和 SSH 的 22）
3. RDS 白名单：只加这台 ECS 的**内网 IP**，不放公网

### 第 3 步：拉代码 + 配环境变量 + 启动
```bash
git clone https://github.com/qwersdafasd/tutor-platform.git
cd tutor-platform
npm install
# 写 .env（不要提交进仓库）
#   MYSQL_URL=mysql://用户名:密码@rm-xxx....rds.aliyuncs.com:3306/tutor
#   ADMIN_PHONE=...  ADMIN_PASSWORD=...
npm start   # 生产建议用 pm2 守护：pm2 start server.js --name tutor
```
首次启动会自动建表。再用 `node scripts/create-admin.js` 建管理员。

### 第 4 步：迁移老数据
当前线上数据在 **Supabase Postgres（海外）**，上线时把老数据迁到阿里云 RDS MySQL。

### 以后更新项目
本地改完推到 GitHub，服务器上拉取并重启：
```bash
# 本地
git add . && git commit -m "更新了xxx" && git push
# 服务器
git pull && npm install && pm2 restart tutor
```
**数据库里的数据不受影响、不会丢。**

> 备注：国内域名正式对外需 **ICP 备案**；想先免备案跑通，可暂用 IP 直连访问。
