# 家教帮 · 大学生家教接单平台

手机优先（H5）的大学生家教撮合平台。老师填档案、家长发需求，支持搜索筛选、收藏、私信、评价打分、实名认证、智能匹配推荐。

## 技术栈
- 后端：Node.js + Express
- 数据层**可切换**：
  - 本地开发：`data/db.json` 文件（无需任何配置）
  - 线上部署：Supabase Postgres（设置环境变量 `DATABASE_URL` 即自动启用）
- 前端：原生 JS 单页应用（PWA，可添加到手机主屏）

## 本地运行
```bash
npm install
npm start
# 打开 http://localhost:5200
```
不设置 `DATABASE_URL` 时，数据存在 `data/db.json`。

---

## 部署上线（Supabase + Render，全免费）

### 第 1 步：建 Supabase 数据库（拿到 DATABASE_URL）
1. 打开 https://supabase.com → 用 GitHub 登录 → New project
2. 设个数据库密码（记下来）、选区域（建议 Singapore/离你近的）
3. 项目建好后：左下 **Project Settings → Database → Connection string → 选 "URI"**
4. 复制那串 `postgresql://postgres:[YOUR-PASSWORD]@...`，把 `[YOUR-PASSWORD]` 换成你刚设的密码
5. 这就是 `DATABASE_URL`，先存着

> 建表会在服务首次启动时自动完成，你不用手动建表。

### 第 2 步：代码推到 GitHub
```bash
git init
git add .
git commit -m "家教帮 初版"
# 在 github.com 新建一个空仓库（不要勾 README），然后：
git remote add origin https://github.com/你的用户名/tutor-platform.git
git branch -M main
git push -u origin main
```

### 第 3 步：Render 部署
1. 打开 https://render.com → 用 GitHub 登录
2. New + → **Web Service** → 连接你刚推的仓库
3. 配置：
   - Build Command：`npm install`
   - Start Command：`npm start`
   - Instance Type：Free
4. **Environment（环境变量）** 里加一条：
   - Key：`DATABASE_URL`　Value：第 1 步那串连接串
5. Create Web Service，等几分钟，得到一个 `https://xxx.onrender.com` 网址
6. 手机浏览器打开这个网址即可使用，还能"添加到主屏幕"

### 以后更新项目
改完代码后：
```bash
git add .
git commit -m "更新了xxx"
git push
```
Render 会自动重新部署，**数据库里的数据不受影响、不会丢**。

> 注：Render 免费版闲置一会儿会休眠，第一次访问需等 ~30 秒唤醒。这是免费版正常现象，付费可去掉。
