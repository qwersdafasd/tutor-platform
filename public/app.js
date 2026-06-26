/* ============== 家教帮 · 手机端 SPA ============== */
const SUBJECTS = ["语文","数学","英语","物理","化学","生物","政治","历史","地理","编程","钢琴","美术","其他"];
const GRADES = ["学前","小学","初中","高中","大学/考研","成人"];
const MODES = ["线上","线下"];
const REGIONS = ["北京","上海","广州","深圳","杭州","成都","武汉","西安","南京","其他"];

const appbar = document.getElementById("appbar");
const view = document.getElementById("view");
const tabbar = document.getElementById("tabbar");
const toastEl = document.getElementById("toast");

/* ---------- 工具 ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
function toast(m){toastEl.textContent=m;toastEl.classList.add("show");setTimeout(()=>toastEl.classList.remove("show"),2000);}
function stars(n){const f=Math.round(n);return "★★★★★".slice(0,f)+"☆☆☆☆☆".slice(0,5-f);}
const token=()=>localStorage.getItem("token")||"";
const me=()=>{try{return JSON.parse(localStorage.getItem("me")||"null");}catch{return null;}};
function setAuth(t,u){localStorage.setItem("token",t);localStorage.setItem("me",JSON.stringify(u));}
function clearAuth(){localStorage.removeItem("token");localStorage.removeItem("me");}
const go=(h)=>location.hash=h;
const timeAgo=(t)=>{const d=(Date.now()-t)/1000;if(d<60)return"刚刚";if(d<3600)return Math.floor(d/60)+"分钟前";if(d<86400)return Math.floor(d/3600)+"小时前";return Math.floor(d/86400)+"天前";};
const fmtDate=(t)=>t?new Date(t).toLocaleDateString("zh-CN",{year:"numeric",month:"2-digit",day:"2-digit"}):"—";
const yuan=(fen)=>(fen/100).toFixed(fen%100?2:0);

async function api(path, opts={}){
  const res=await fetch("/api"+path,{
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+token()},
    ...opts, body:opts.body?JSON.stringify(opts.body):undefined,
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data.error||"请求失败");
  return data;
}
function needLogin(){toast("请先登录");go("#/login");}

/* ---------- 顶栏 ---------- */
function setBar(title,{back=false,actions=""}={}){
  appbar.innerHTML=`${back?'<span class="back" onclick="history.back()">‹</span>':'<span class="title">家教<span class="logo-dot">帮</span></span>'}
    ${back?`<span class="title" style="font-size:16px">${esc(title)}</span>`:""}
    <span class="right">${actions}</span>`;
}

/* ---------- 底部 Tab ---------- */
let unreadCount=0;
const TABS=[
  {key:"",ico:"🏠",label:"首页"},
  {key:"tutors",ico:"🔍",label:"找老师"},
  {key:"requests",ico:"📋",label:"需求"},
  {key:"messages",ico:"💬",label:"消息"},
  {key:"me",ico:"👤",label:"我的"},
];
function renderTabs(){
  const cur=(location.hash.replace(/^#\//,"").split("/")[0])||"";
  tabbar.innerHTML=TABS.map(t=>`
    <div class="tab ${cur===t.key?"on":""}" onclick="location.hash='#/${t.key}'">
      <span class="ico">${t.ico}</span><span>${t.label}</span>
      ${t.key==="messages"&&unreadCount>0?`<span class="badge-dot">${unreadCount>99?"99+":unreadCount}</span>`:""}
    </div>`).join("");
}
async function refreshUnread(){
  if(!token()){unreadCount=0;renderTabs();return;}
  try{const {count}=await api("/unread");unreadCount=count;}catch{unreadCount=0;}
  renderTabs();
}

/* ---------- 老师卡片 ---------- */
function tutorCard(t){
  return `<div class="card tutor-card" onclick="go('#/tutor/${t.userId}')">
    <div class="tutor-head">
      <div class="avatar">${esc((t.name||"师")[0])}</div>
      <div style="flex:1;min-width:0">
        <div class="tutor-name">${esc(t.name||"匿名老师")}
          ${t.vip?'<span class="vip">VIP</span>':""}${t.verified?'<span class="verified">✓认证</span>':""}${t.boosted?'<span class="boost">推广</span>':""}</div>
        <div class="muted">${esc(t.school||"未填学校")}${t.major?" · "+esc(t.major):""}</div>
        <div class="stars">${stars(t.avg)} <span class="muted">${t.avg||"暂无"}（${t.count}）</span></div>
      </div>
      <span class="fav ${t.faved?"on":""}" data-id="${t.userId}" onclick="event.stopPropagation();toggleFav(${t.userId},this)">${t.faved?"♥":"♡"}</span>
    </div>
    <div class="tags">
      ${(t.subjects||[]).slice(0,4).map(s=>`<span class="tag">${esc(s)}</span>`).join("")}
      ${(t.modes||[]).map(m=>`<span class="tag mode">${esc(m)}</span>`).join("")}
    </div>
    <div class="tutor-foot">
      <span class="muted">📍 ${esc(t.region||"不限")}</span>
      <span class="price">${t.hourlyRate?"¥"+t.hourlyRate+"/时":"面议"}</span>
    </div>
  </div>`;
}
async function toggleFav(id,el){
  if(!token())return needLogin();
  try{const {faved}=await api(`/tutors/${id}/favorite`,{method:"POST"});
    el.classList.toggle("on",faved);el.textContent=faved?"♥":"♡";toast(faved?"已收藏":"已取消收藏");
  }catch(e){toast(e.message);}
}
window.toggleFav=toggleFav;window.go=go;

function reqCard(r){
  const u=me();
  return `<div class="card req-card">
    <div class="req-top"><div class="req-subject">${esc(r.subject)} · ${esc(r.grade)}</div><span class="badge">${esc(r.mode)}</span></div>
    <div class="muted" style="margin:6px 0">📍 ${esc(r.region||"不限")}　💰 ${esc(r.budget||"面议")}</div>
    <div>${esc(r.desc||"（无补充说明）")}</div>
    <div class="tutor-foot">
      <span class="muted">${esc(r.parentName)} · ${timeAgo(r.createdAt)}</span>
      ${u?`<button class="btn sm ghost" onclick="go('#/chat/${r.parentId}')">私信</button>`:`<a class="muted" style="color:var(--primary)" onclick="go('#/login')">登录联系</a>`}
    </div>
  </div>`;
}

/* ============== 视图 ============== */
const views={};

/* 首页 */
views[""]=async(_arg,gen)=>{
  setBar("");
  const u=me();
  view.innerHTML=`
    <div class="hero">
      <h1>找靠谱大学生家教<br>就上家教帮</h1>
      <p>名校学子一对一 · 线上线下 · 真实评价</p>
      <div class="actions">
        <a class="btn" onclick="go('#/tutors')">🔍 找老师</a>
        <a class="btn ghost" onclick="go('${u?(u.role==='tutor'?'#/profile':'#/post'):'#/login'}')">${u?(u.role==='tutor'?'🎓 完善档案':'📋 发需求'):'🎓 我要接单'}</a>
      </div>
    </div>
    <div class="quick">
      <div class="q" onclick="go('#/tutors')"><span class="qi">🔍</span><span>找老师</span></div>
      <div class="q" onclick="go('#/requests')"><span class="qi">📋</span><span>需求墙</span></div>
      <div class="q" onclick="go('#/favorites')"><span class="qi">♥</span><span>我的收藏</span></div>
      <div class="q" onclick="go('#/messages')"><span class="qi">💬</span><span>消息</span></div>
    </div>
    <div id="matchBox"></div>
    <div class="section-title">🔥 优秀老师 <span class="more" onclick="go('#/tutors')">查看全部 ›</span></div>
    <div id="hot"><div class="muted">加载中…</div></div>
  `;
  // 智能匹配推荐（登录后）
  if(u){
    try{
      const m=await api("/match");
      const box=$("#matchBox");
      if(isStale(gen)||!box)return;          // 已切走，别再写旧页面
      if(m.type==="requests"&&m.items.length){
        box.innerHTML=`<div class="section-title">🎯 适合你的需求 <span class="muted" style="font-weight:400">按你的科目地区匹配</span></div>`+m.items.slice(0,3).map(reqCard).join("");
      }else if(m.type==="tutors"&&m.items.length){
        box.innerHTML=`<div class="section-title">🎯 为你推荐${m.basedOn?`（基于"${esc(m.basedOn)}"）`:""}</div>`+m.items.slice(0,3).map(tutorCard).join("");
      }
    }catch{}
  }
  try{
    const {tutors}=await api("/tutors");
    const hot=$("#hot"); if(isStale(gen)||!hot)return;   // 已切走，别再写旧页面
    hot.innerHTML=tutors.length?tutors.slice(0,6).map(tutorCard).join(""):`<div class="empty">还没有老师入驻，<a style="color:var(--primary)" onclick="go('#/login')">来当第一个</a></div>`;
  }catch(e){const hot=$("#hot"); if(!isStale(gen)&&hot)hot.innerHTML=`<div class="empty">${esc(e.message)}</div>`;}
};

/* 找老师 */
views["tutors"]=async()=>{
  setBar("");
  view.innerHTML=`
    <div class="filters">
      <input id="fq" placeholder="🔍 姓名/学校/标签">
      <select id="fsubject"><option value="">科目</option>${SUBJECTS.map(s=>`<option>${s}</option>`).join("")}</select>
      <select id="fregion"><option value="">地区</option>${REGIONS.map(s=>`<option>${s}</option>`).join("")}</select>
      <select id="fmode"><option value="">方式</option>${MODES.map(s=>`<option>${s}</option>`).join("")}</select>
    </div>
    <div id="list"><div class="muted">加载中…</div></div>`;
  async function load(){
    const qs=new URLSearchParams();
    if($("#fq").value)qs.set("q",$("#fq").value);
    if($("#fsubject").value)qs.set("subject",$("#fsubject").value);
    if($("#fregion").value)qs.set("region",$("#fregion").value);
    if($("#fmode").value)qs.set("mode",$("#fmode").value);
    try{const {tutors}=await api("/tutors?"+qs);
      $("#list").innerHTML=tutors.length?tutors.map(tutorCard).join(""):`<div class="empty">没有符合条件的老师</div>`;
    }catch(e){$("#list").innerHTML=`<div class="empty">${esc(e.message)}</div>`;}
  }
  ["fsubject","fregion","fmode"].forEach(id=>$("#"+id).onchange=load);
  $("#fq").addEventListener("input",()=>{clearTimeout(window._t);window._t=setTimeout(load,300);});
  load();
};

/* 老师详情 */
views["tutor"]=async(id)=>{
  setBar("老师主页",{back:true});
  view.innerHTML=`<div class="muted">加载中…</div>`;
  let data;try{data=await api("/tutors/"+id);}catch(e){view.innerHTML=`<div class="empty">${esc(e.message)}</div>`;return;}
  const t=data.tutor,u=me();
  const canReview=u&&u.role==="parent";
  view.innerHTML=`
    <div class="card">
      <div class="detail-head">
        <div class="avatar">${esc((t.name||"师")[0])}</div>
        <div style="flex:1">
          <div class="tutor-name" style="font-size:19px">${esc(t.name||"匿名老师")}
            ${t.vip?'<span class="vip">VIP</span>':""}${t.verified?'<span class="verified">✓认证</span>':""}</div>
          <div class="stars">${stars(t.avg)} <span class="muted">${t.avg||"暂无评分"}（${t.count}评）</span></div>
        </div>
        <span class="fav ${t.faved?"on":""}" onclick="toggleFav(${t.userId},this)">${t.faved?"♥":"♡"}</span>
      </div>
      <div class="kv"><b>学校</b>${esc(t.school||"—")}</div>
      <div class="kv"><b>专业</b>${esc(t.major||"—")}　${esc(t.grade||"")}</div>
      <div class="kv"><b>科目</b><div class="tags">${(t.subjects||[]).map(s=>`<span class="tag">${esc(s)}</span>`).join("")||"—"}</div></div>
      <div class="kv"><b>方式</b><div class="tags">${(t.modes||[]).map(m=>`<span class="tag mode">${esc(m)}</span>`).join("")||"—"}</div></div>
      <div class="kv"><b>地区</b>${esc(t.region||"不限")}</div>
      <div class="kv"><b>时薪</b><span class="price">${t.hourlyRate?"¥"+t.hourlyRate+"/时":"面议"}</span></div>
      ${(t.tags||[]).length?`<div class="kv"><b>标签</b><div class="tags">${t.tags.map(s=>`<span class="tag">${esc(s)}</span>`).join("")}</div></div>`:""}
      <div class="kv"><b>简介</b><span>${esc(t.bio||"这位老师很神秘，还没写介绍~")}</span></div>
    </div>
    ${u&&u.id!==t.userId?`<button class="btn block" onclick="go('#/chat/${t.userId}')">💬 私信咨询</button>`:(!u?`<button class="btn block" onclick="go('#/login')">登录后咨询/查看联系方式</button>`:"")}
    <div class="card" style="margin-top:12px">
      <div class="section-title" style="margin-top:0">⭐ 学员评价（${t.count}）</div>
      <div id="reviews">${data.reviews.length?data.reviews.map(r=>`
        <div class="review"><div class="top"><b>${esc(r.parentName)}</b><span class="stars">${stars(r.rating)}</span></div>
        <div>${esc(r.comment||"（未填写内容）")}</div></div>`).join(""):`<div class="empty">还没有评价</div>`}</div>
      ${canReview?`<div style="border-top:1px solid var(--line);margin-top:12px;padding-top:12px">
        <label>给老师打分</label><div id="starPick">${[1,2,3,4,5].map(i=>`<span class="star-pick" data-v="${i}">★</span>`).join("")}</div>
        <label>评价内容</label><textarea id="rcomment" placeholder="说说辅导效果、态度，帮助其他家长~"></textarea>
        <div class="err" id="rerr"></div><button class="btn block" id="rbtn">提交评价</button></div>`:""}
    </div>`;
  if(canReview){
    let rating=0;const picks=$$(".star-pick");
    picks.forEach(p=>p.onclick=()=>{rating=+p.dataset.v;picks.forEach(x=>x.classList.toggle("on",+x.dataset.v<=rating));});
    $("#rbtn").onclick=async()=>{
      $("#rerr").textContent="";if(!rating){$("#rerr").textContent="请先点星打分";return;}
      try{await api(`/tutors/${id}/reviews`,{method:"POST",body:{rating,comment:$("#rcomment").value}});toast("评价成功");render();}
      catch(e){$("#rerr").textContent=e.message;}
    };
  }
};

/* 需求墙 */
views["requests"]=async()=>{
  setBar("");
  const u=me();
  view.innerHTML=`
    ${u&&u.role==="parent"?`<button class="btn block" style="margin-bottom:12px" onclick="go('#/post')">+ 发布家教需求</button>`:""}
    <div class="filters">
      <select id="fsubject"><option value="">科目</option>${SUBJECTS.map(s=>`<option>${s}</option>`).join("")}</select>
      <select id="fregion"><option value="">地区</option>${REGIONS.map(s=>`<option>${s}</option>`).join("")}</select>
      <select id="fmode"><option value="">方式</option>${MODES.map(s=>`<option>${s}</option>`).join("")}</select>
    </div>
    <div id="list"><div class="muted">加载中…</div></div>`;
  async function load(){
    const qs=new URLSearchParams();
    if($("#fsubject").value)qs.set("subject",$("#fsubject").value);
    if($("#fregion").value)qs.set("region",$("#fregion").value);
    if($("#fmode").value)qs.set("mode",$("#fmode").value);
    try{const {requests}=await api("/requests?"+qs);
      $("#list").innerHTML=requests.length?requests.map(reqCard).join(""):`<div class="empty">还没有需求</div>`;
    }catch(e){$("#list").innerHTML=`<div class="empty">${esc(e.message)}</div>`;}
  }
  ["fsubject","fregion","fmode"].forEach(id=>$("#"+id).onchange=load);
  load();
};

/* 发布需求 */
views["post"]=async()=>{
  const u=me();if(!u)return needLogin();
  if(u.role!=="parent"){setBar("发布需求",{back:true});view.innerHTML=`<div class="empty">仅家长账号可发布需求</div>`;return;}
  setBar("发布需求",{back:true});
  view.innerHTML=`<div class="card">
    <label>科目</label><select id="subject">${SUBJECTS.map(s=>`<option>${s}</option>`).join("")}</select>
    <label>年级</label><select id="grade">${GRADES.map(s=>`<option>${s}</option>`).join("")}</select>
    <label>辅导方式</label><div class="switch" id="mode">${["不限",...MODES].map((m,i)=>`<div class="chip ${i===0?"on":""}" data-v="${m}">${m}</div>`).join("")}</div>
    <label>地区</label><select id="region"><option value="">不限</option>${REGIONS.map(s=>`<option>${s}</option>`).join("")}</select>
    <label>预算（元/小时）</label><input id="budget" placeholder="如 80-120，可留空">
    <label>具体要求</label><textarea id="desc" placeholder="孩子情况、薄弱环节、辅导目标、时间安排等"></textarea>
    <div class="err" id="err"></div><button class="btn block" id="btn">发布需求</button></div>`;
  let mode="不限";
  $$("#mode .chip").forEach(c=>c.onclick=()=>{mode=c.dataset.v;$$("#mode .chip").forEach(x=>x.classList.toggle("on",x===c));});
  $("#btn").onclick=async()=>{$("#err").textContent="";
    try{await api("/requests",{method:"POST",body:{subject:$("#subject").value,grade:$("#grade").value,mode,region:$("#region").value,budget:$("#budget").value,desc:$("#desc").value}});
      toast("发布成功");go("#/requests");}catch(e){$("#err").textContent=e.message;}
  };
};

/* 老师档案 */
views["profile"]=async()=>{
  const u=me();if(!u)return needLogin();
  if(u.role!=="tutor"){setBar("我的档案",{back:true});view.innerHTML=`<div class="empty">仅老师账号有档案</div>`;return;}
  setBar("我的档案",{back:true});
  let t;try{t=(await api("/tutor/profile")).tutor;}catch(e){view.innerHTML=`<div class="empty">${esc(e.message)}</div>`;return;}
  view.innerHTML=`
    ${t.verified?`<div class="card" style="display:flex;align-items:center;gap:8px"><span class="verified">✓认证</span><span class="muted">已实名认证，更受家长信任</span></div>`
      :`<div class="card"><div style="display:flex;justify-content:space-between;align-items:center">
        <span class="muted">未认证，认证后展示"✓"徽章更易接单</span><button class="btn sm" onclick="go('#/verify')">去认证</button></div></div>`}
    <div class="card">
      <label>姓名</label><input id="name" value="${esc(t.name)}">
      <div class="row"><div><label>学校</label><input id="school" value="${esc(t.school)}" placeholder="浙江大学"></div>
      <div><label>专业</label><input id="major" value="${esc(t.major)}" placeholder="数学系"></div></div>
      <label>年级</label><select id="grade">${["大一","大二","大三","大四","研究生","已毕业"].map(g=>`<option ${g===t.grade?"selected":""}>${g}</option>`).join("")}</select>
      <label>可教科目（多选）</label><div class="chips" id="subjects">${SUBJECTS.map(s=>`<div class="chip ${t.subjects.includes(s)?"on":""}" data-v="${s}">${s}</div>`).join("")}</div>
      <label>授课方式（多选）</label><div class="chips" id="modes">${MODES.map(s=>`<div class="chip ${t.modes.includes(s)?"on":""}" data-v="${s}">${s}</div>`).join("")}</div>
      <div class="row"><div><label>地区</label><select id="region"><option value="">不限</option>${REGIONS.map(s=>`<option ${s===t.region?"selected":""}>${s}</option>`).join("")}</select></div>
      <div><label>时薪(元/时)</label><input id="rate" type="number" value="${t.hourlyRate||""}" placeholder="100"></div></div>
      <label>技能标签（逗号分隔）</label><input id="tags" value="${esc((t.tags||[]).join(","))}" placeholder="耐心,提分快,擅长奥数">
      <label>自我介绍</label><textarea id="bio" placeholder="教学经历、成绩、风格等">${esc(t.bio)}</textarea>
      <div class="err" id="err"></div><button class="btn block" id="btn">保存档案</button>
    </div>`;
  $$("#subjects .chip,#modes .chip").forEach(c=>c.onclick=()=>c.classList.toggle("on"));
  const multi=id=>$$(`#${id} .chip.on`).map(c=>c.dataset.v);
  $("#btn").onclick=async()=>{$("#err").textContent="";
    try{await api("/tutor/profile",{method:"PUT",body:{name:$("#name").value,school:$("#school").value,major:$("#major").value,grade:$("#grade").value,
      subjects:multi("subjects"),modes:multi("modes"),region:$("#region").value,hourlyRate:$("#rate").value,
      tags:$("#tags").value.split(/[,，]/).map(s=>s.trim()).filter(Boolean),bio:$("#bio").value}});
      toast("已保存，家长能搜到你了 🎉");}catch(e){$("#err").textContent=e.message;}
  };
};

/* 实名认证 */
views["verify"]=async()=>{
  const u=me();if(!u)return needLogin();
  setBar("实名认证",{back:true});
  view.innerHTML=`<div class="card">
    <p class="muted">认证后档案显示"✓认证"徽章，家长更信任。（演示版提交即通过；正式版应上传学生证/学信网截图由后台审核）</p>
    <label>真实姓名</label><input id="realName" placeholder="与证件一致">
    <label>就读学校</label><input id="school" placeholder="如 浙江大学">
    <div class="err" id="err"></div><button class="btn block" id="btn">提交认证</button></div>`;
  $("#btn").onclick=async()=>{$("#err").textContent="";
    try{await api("/tutor/verify",{method:"POST",body:{realName:$("#realName").value,school:$("#school").value}});
      toast("认证成功 ✓");go("#/profile");}catch(e){$("#err").textContent=e.message;}
  };
};

/* 会员 & 推广（变现页，仅老师） */
views["billing"]=async()=>{
  const u=me();if(!u)return needLogin();
  setBar("会员 & 推广",{back:true});
  if(u.role!=="tutor"){view.innerHTML=`<div class="empty">仅老师账号有会员 &amp; 推广</div>`;return;}
  view.innerHTML=`<div class="muted">加载中…</div>`;
  let plansResp,data;
  try{[plansResp,data]=await Promise.all([api("/billing/plans"),api("/billing/me")]);}
  catch(e){view.innerHTML=`<div class="empty">${esc(e.message)}</div>`;return;}
  const plans=plansResp.plans, sandbox=(plansResp.provider==="mock");
  const planLabel=(o)=>((plans[o.type]||[]).find(x=>x.key===o.plan)||{}).label||"订单";

  const statusCard=()=>`<div class="card bill-status">
    <div class="bs-row"><span class="bs-ico">👑</span>
      <div class="bs-meta"><div class="bs-name">会员 VIP</div>
        <div class="muted">${data.vip?("有效期至 "+fmtDate(data.vipExpire)):"未开通"}</div></div>
      <span class="bs-state ${data.vip?"on":""}">${data.vip?"已开通":"未开通"}</span></div>
    <div class="bs-row"><span class="bs-ico">🚀</span>
      <div class="bs-meta"><div class="bs-name">置顶推广</div>
        <div class="muted">${data.boosted?("有效期至 "+fmtDate(data.boostExpire)):"未开通"}</div></div>
      <span class="bs-state ${data.boosted?"on":""}">${data.boosted?"生效中":"未开通"}</span></div>
  </div>`;

  const section=(type,title,desc,perks)=>`
    <div class="section-title">${title} <span class="muted" style="font-weight:400">${desc}</span></div>
    <div class="perks">${perks.map(p=>`<span class="perk">✓ ${p}</span>`).join("")}</div>
    <div class="plan-grid">${plans[type].map(p=>`
      <div class="plan-card">
        <div class="plan-label">${esc(p.label)}</div>
        <div class="plan-price">¥<b>${yuan(p.price)}</b></div>
        <div class="plan-days muted">${p.days} 天</div>
        <button class="btn sm block buy" data-type="${type}" data-plan="${p.key}">购买</button>
      </div>`).join("")}</div>`;

  view.innerHTML=`
    ${statusCard()}
    ${section("vip","👑 开通会员","专属标识 + 曝光加权",["主页 VIP 标识，更受家长信任","搜索结果排序加权","后续持续解锁接单特权"])}
    ${section("boost","🚀 购买置顶","限时顶到列表最前",["搜索/首页列表靠前展示","带“推广”标签更吸睛","按天计费，可叠加续期"])}
    ${sandbox?`<div class="bill-note">🧪 当前为 <b>沙箱支付</b>：下单后点“我已支付（沙箱）”即可走完整流程，<b>不会真实扣款</b>。接入微信/虎皮椒后会自动切换为真实收款二维码。</div>`:""}
    <div id="payMask"></div>`;

  $$(".buy").forEach(b=>b.onclick=async()=>{
    let resp;
    try{resp=await api("/billing/order",{method:"POST",body:{type:b.dataset.type,plan:b.dataset.plan}});}
    catch(e){return toast(e.message);}
    showPay(resp);
  });

  function showPay({order,pay}){
    const mask=$("#payMask");
    mask.innerHTML=`<div class="pay-mask"><div class="pay-box">
      <div class="pay-title">${esc(planLabel(order))}</div>
      <div class="pay-amount">¥${yuan(order.amount)}</div>
      <div class="pay-qr ${pay.sandbox?"sandbox":""}">${pay.sandbox?"🧪<br>沙箱":(pay.qr?`<img src="${esc(pay.qr)}" alt="二维码">`:"扫码支付")}</div>
      <div class="pay-msg muted">${esc(pay.message||"请扫码完成支付")}</div>
      <div class="pay-actions">
        ${pay.sandbox?`<button class="auth-btn" id="payDone" style="margin-top:0;letter-spacing:1px">我已支付（沙箱）</button>`
                     :`<button class="auth-btn" id="payCheck" style="margin-top:0;letter-spacing:1px">我已支付，刷新</button>`}
        <button class="btn line block" id="payCancel" style="margin-top:10px">取消</button>
      </div>
    </div></div>`;
    $("#payCancel").onclick=()=>{mask.innerHTML="";};
    const done=$("#payDone");
    if(done)done.onclick=async()=>{done.disabled=true;done.textContent="处理中…";
      try{await api("/billing/mock-pay",{method:"POST",body:{orderId:order.id}});
        mask.innerHTML="";toast("开通成功 🎉");render();
      }catch(e){toast(e.message);done.disabled=false;done.textContent="我已支付（沙箱）";}
    };
    const check=$("#payCheck");
    if(check)check.onclick=async()=>{
      try{const {order:o}=await api("/billing/order/"+order.id);
        if(o.status==="paid"){mask.innerHTML="";toast("开通成功 🎉");render();}else toast("尚未到账，支付完成后再点");
      }catch(e){toast(e.message);}
    };
  }
};

/* 我的收藏 */
views["favorites"]=async()=>{
  const u=me();if(!u)return needLogin();
  setBar("我的收藏",{back:true});
  view.innerHTML=`<div id="list"><div class="muted">加载中…</div></div>`;
  try{const {tutors}=await api("/favorites");
    $("#list").innerHTML=tutors.length?tutors.map(tutorCard).join(""):`<div class="empty">还没有收藏老师<br>去"找老师"点♡收藏吧</div>`;
  }catch(e){$("#list").innerHTML=`<div class="empty">${esc(e.message)}</div>`;}
};

/* 消息：会话列表 */
views["messages"]=async()=>{
  setBar("");
  const u=me();if(!u){view.innerHTML=`<div class="empty">登录后查看消息<br><button class="btn" style="margin-top:14px" onclick="go('#/login')">去登录</button></div>`;return;}
  view.innerHTML=`<div class="card" id="list"><div class="muted">加载中…</div></div>`;
  try{const {conversations}=await api("/conversations");
    $("#list").innerHTML=conversations.length?conversations.map(c=>`
      <div class="conv" onclick="go('#/chat/${c.userId}')">
        <div class="avatar">${esc((c.name||"用")[0])}</div>
        <div class="meta"><div class="nm">${esc(c.name)} <small>${timeAgo(c.lastAt)}</small></div>
        <div class="last">${esc(c.last)}</div></div>
        ${c.unread>0?`<span class="undot">${c.unread}</span>`:""}
      </div>`).join(""):`<div class="empty">还没有消息<br>去老师主页或需求里发起私信吧</div>`;
  }catch(e){$("#list").innerHTML=`<div class="empty">${esc(e.message)}</div>`;}
  refreshUnread();
};

/* 聊天 */
views["chat"]=async(uid)=>{
  const u=me();if(!u)return needLogin();
  setBar("聊天",{back:true});
  view.innerHTML=`<div class="chat" id="chat"><div class="muted">加载中…</div></div>
    <div class="chat-input">
      <label class="attach" title="发送图片/文件">📎<input type="file" id="file" hidden></label>
      <input id="msg" placeholder="输入消息…"><button class="btn" id="send">发送</button>
    </div>`;
  // 一条消息渲染成气泡：图片→缩略图，文件→下载链接，文字→转义文本
  function bubble(m){
    const side=m.fromId===u.id?"me":"you";
    let inner;
    if(m.kind==="image")inner=`<a href="${esc(m.fileUrl)}" target="_blank" rel="noopener"><img class="chat-img" src="${esc(m.fileUrl)}" alt="图片"></a>`;
    else if(m.kind==="file")inner=`<a class="chat-file" href="${esc(m.fileUrl)}" target="_blank" rel="noopener" download="${esc(m.fileName||"")}">📎 ${esc(m.fileName||"文件")}</a>`;
    else inner=esc(m.text);
    return `<div class="bubble ${side}${m.kind&&m.kind!=="text"?" media":""}">${inner}</div>`;
  }
  async function load(){
    try{const {messages,peer}=await api("/messages/"+uid);
      setBar(peer.name+(peer.role==="tutor"?"（老师）":"（家长）"),{back:true});
      const c=$("#chat");
      c.innerHTML=messages.length?messages.map(bubble).join(""):`<div class="empty">开始聊天吧~</div>`;
      window.scrollTo(0,document.body.scrollHeight);
      refreshUnread();
    }catch(e){$("#chat").innerHTML=`<div class="empty">${esc(e.message)}</div>`;}
  }
  async function send(){
    const text=$("#msg").value.trim();if(!text)return;
    $("#msg").value="";
    try{await api("/messages",{method:"POST",body:{toId:+uid,text}});await load();}
    catch(e){toast(e.message);}
  }
  async function sendFile(file){
    if(!file)return;
    if(file.size>10*1024*1024)return toast("文件不能超过 10MB");
    const dataUrl=await new Promise((ok,err)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>err(new Error("读取失败"));r.readAsDataURL(file);});
    try{
      toast("上传中…");
      const up=await api("/upload",{method:"POST",body:{dataUrl,name:file.name}});
      await api("/messages",{method:"POST",body:{toId:+uid,kind:up.kind,fileUrl:up.url,fileName:up.name}});
      await load();
    }catch(e){toast(e.message);}
  }
  $("#send").onclick=send;
  $("#msg").addEventListener("keydown",e=>{if(e.key==="Enter")send();});
  $("#file").onchange=e=>{const f=e.target.files[0];e.target.value="";sendFile(f);};
  load();
};

/* 我的 */
views["me"]=async()=>{
  setBar("");
  const u=me();
  if(!u){view.innerHTML=`<div class="empty">未登录<br><button class="btn" style="margin-top:14px" onclick="go('#/login')">登录 / 注册</button></div>`;return;}
  view.innerHTML=`
    <div class="card" style="display:flex;align-items:center;gap:14px">
      <div class="avatar" style="width:56px;height:56px;font-size:24px">${esc(u.name[0])}</div>
      <div><div style="font-weight:700;font-size:18px">${esc(u.name)}</div>
      <div class="muted">${u.role==="tutor"?"大学生老师":u.role==="admin"?"超级管理员":"家长"} · ${esc(u.phone)}</div></div>
    </div>
    <div class="card" style="padding:4px 0">
      ${u.role==="admin"?`
        <div class="conv" onclick="go('#/admin')"><span style="font-size:20px">🛡️</span><div class="meta">管理后台<span class="mini-tip">用户·评论·需求·老师</span></div><span>›</span></div>
      `:`${u.role==="tutor"?`
        <div class="conv" onclick="go('#/profile')"><span style="font-size:20px">🎓</span><div class="meta">我的档案</div><span>›</span></div>
        <div class="conv" onclick="go('#/billing')"><span style="font-size:20px">👑</span><div class="meta">会员 & 推广<span class="mini-tip">接更多单</span></div><span>›</span></div>
        <div class="conv" onclick="go('#/tutor/${u.id}')"><span style="font-size:20px">👁</span><div class="meta">查看我的主页</div><span>›</span></div>
        <div class="conv" onclick="go('#/verify')"><span style="font-size:20px">✓</span><div class="meta">实名认证</div><span>›</span></div>
      `:`
        <div class="conv" onclick="go('#/post')"><span style="font-size:20px">📋</span><div class="meta">发布需求</div><span>›</span></div>
      `}
      <div class="conv" onclick="go('#/favorites')"><span style="font-size:20px">♥</span><div class="meta">我的收藏</div><span>›</span></div>
      <div class="conv" onclick="go('#/messages')"><span style="font-size:20px">💬</span><div class="meta">我的消息</div><span>›</span></div>
      `}
    </div>
    <button class="btn line block" id="logout">退出登录</button>`;
  $("#logout").onclick=async()=>{try{await api("/logout",{method:"POST"});}catch{}clearAuth();toast("已退出");go("#/");refreshUnread();};
};

/* 管理后台（仅 admin） */
const ROLE_LABEL={tutor:"老师",parent:"家长",admin:"管理员"};
views["admin"]=async()=>{
  const u=me();if(!u)return needLogin();
  if(u.role!=="admin"){view.innerHTML=`<div class="empty">无权限</div>`;return;}
  setBar("管理后台",{back:true});
  view.innerHTML=`
    <div class="admin-stats" id="stats"></div>
    <div class="seg" id="seg">
      <button class="seg-btn on" data-t="users">用户</button>
      <button class="seg-btn" data-t="reviews">评论</button>
      <button class="seg-btn" data-t="requests">需求</button>
      <button class="seg-btn" data-t="tutors">老师</button>
    </div>
    <div id="adminList"><div class="muted">加载中…</div></div>`;
  // 统计卡
  try{const s=await api("/admin/stats");
    $("#stats").innerHTML=[["用户",s.users],["老师",s.tutors],["需求",s.requests],["评论",s.reviews]]
      .map(([k,v])=>`<div class="adm-stat"><div class="stat-n">${v}</div><div class="stat-k">${k}</div></div>`).join("");
  }catch(e){$("#stats").innerHTML="";}

  const list=$("#adminList");
  const reload=()=>tabs[cur]();
  // 危险操作统一确认 + 调用 + 重载
  async function act(label,fn){ if(!confirm(label))return; try{await fn();toast("已操作");reload();}catch(e){toast(e.message);} }

  const tabs={
    async users(){
      const {users}=await api("/admin/users");
      list.innerHTML=users.length?users.map(x=>`
        <div class="admin-row">
          <div class="admin-main">
            <div><b>${esc(x.name)}</b> <span class="muted">${esc(x.phone)}</span> ${x.banned?'<span class="tag-ban">已封禁</span>':""}</div>
            <div class="muted sm">${ROLE_LABEL[x.role]||x.role} · 注册 ${fmtDate(x.createdAt)}</div>
          </div>
          <div class="admin-ops">
            ${x.id===u.id?'<span class="muted sm">（你自己）</span>':`
              <select class="role-sel" data-id="${x.id}">
                ${["parent","tutor","admin"].map(r=>`<option value="${r}" ${x.role===r?"selected":""}>${ROLE_LABEL[r]}</option>`).join("")}
              </select>
              <button class="btn xs ${x.banned?"":"line"}" data-ban="${x.id}" data-to="${x.banned?0:1}">${x.banned?"解封":"封禁"}</button>
              <button class="btn xs danger" data-del="${x.id}">删除</button>`}
          </div>
        </div>`).join(""):`<div class="empty">暂无用户</div>`;
      $$(".role-sel").forEach(s=>s.onchange=()=>act(`确定把该用户角色改为「${ROLE_LABEL[s.value]}」？`,
        ()=>api(`/admin/users/${s.dataset.id}/role`,{method:"POST",body:{role:s.value}})));
      $$("[data-ban]").forEach(b=>b.onclick=()=>act(b.dataset.to==="1"?"确定封禁该用户？封禁后对方无法登录。":"确定解封该用户？",
        ()=>api(`/admin/users/${b.dataset.ban}/ban`,{method:"POST",body:{banned:b.dataset.to==="1"}})));
      $$("[data-del]").forEach(b=>b.onclick=()=>act("确定彻底删除该用户？其档案/需求/评论/私信都会一并删除，不可恢复！",
        ()=>api(`/admin/users/${b.dataset.del}`,{method:"DELETE"})));
    },
    async reviews(){
      const {reviews}=await api("/admin/reviews");
      list.innerHTML=reviews.length?reviews.map(r=>`
        <div class="admin-row">
          <div class="admin-main">
            <div>${stars(r.rating)} <span class="muted sm">${fmtDate(r.createdAt)}</span></div>
            <div>${esc(r.comment||"（无文字）")}</div>
            <div class="muted sm">${esc(r.parentName)} → 老师 ${esc(r.tutorName)}</div>
          </div>
          <div class="admin-ops"><button class="btn xs danger" data-del="${r.id}">删除</button></div>
        </div>`).join(""):`<div class="empty">暂无评论</div>`;
      $$("[data-del]").forEach(b=>b.onclick=()=>act("确定删除这条评论？",()=>api(`/admin/reviews/${b.dataset.del}`,{method:"DELETE"})));
    },
    async requests(){
      const {requests}=await api("/admin/requests");
      list.innerHTML=requests.length?requests.map(r=>`
        <div class="admin-row">
          <div class="admin-main">
            <div><b>${esc(r.subject)}·${esc(r.grade)}</b> <span class="muted sm">${esc(r.mode||"")} ${esc(r.region||"")}</span></div>
            <div class="muted sm">${esc(r.desc||"")||"（无描述）"}</div>
            <div class="muted sm">${esc(r.parentName||"家长")} · ${fmtDate(r.createdAt)}</div>
          </div>
          <div class="admin-ops"><button class="btn xs danger" data-del="${r.id}">删除</button></div>
        </div>`).join(""):`<div class="empty">暂无需求</div>`;
      $$("[data-del]").forEach(b=>b.onclick=()=>act("确定删除这条需求帖？",()=>api(`/admin/requests/${b.dataset.del}`,{method:"DELETE"})));
    },
    async tutors(){
      const {tutors}=await api("/admin/tutors");
      list.innerHTML=tutors.length?tutors.map(t=>`
        <div class="admin-row">
          <div class="admin-main">
            <div><b>${esc(t.name||"匿名")}</b> ${t.verified?'<span class="verified">✓认证</span>':""} ${t.vip?'<span class="vip">VIP</span>':""}</div>
            <div class="muted sm">${esc(t.school||"未填学校")}${t.major?" · "+esc(t.major):""} · ${(t.subjects||[]).join("/")||"未填科目"}</div>
            <div class="muted sm">评分 ${t.avg||"暂无"}（${t.count}） · 时薪 ${t.hourlyRate||0}</div>
          </div>
          <div class="admin-ops">
            <button class="btn xs line" onclick="go('#/tutor/${t.userId}')">查看</button>
            <button class="btn xs danger" data-del="${t.userId}">下架</button>
          </div>
        </div>`).join(""):`<div class="empty">暂无老师档案</div>`;
      $$("[data-del]").forEach(b=>b.onclick=()=>act("确定下架该老师档案？档案与其收到的评价会被删除（账号保留）。",
        ()=>api(`/admin/tutors/${b.dataset.del}`,{method:"DELETE"})));
    },
  };
  let cur="users";
  $$("#seg .seg-btn").forEach(b=>b.onclick=()=>{
    cur=b.dataset.t;$$("#seg .seg-btn").forEach(x=>x.classList.toggle("on",x===b));
    list.innerHTML=`<div class="muted">加载中…</div>`;tabs[cur]().catch(e=>list.innerHTML=`<div class="empty">${esc(e.message)}</div>`);
  });
  tabs.users().catch(e=>list.innerHTML=`<div class="empty">${esc(e.message)}</div>`);
};

/* 登录注册 —— 独立左右分栏页 */
views["login"]=async()=>{
  setBar("");
  let mode="login",role="parent";
  function draw(){
    view.innerHTML=`
    <div class="auth-wrap">
      <div class="auth-card">

        <!-- 左侧·品牌图谱区 -->
        <aside class="auth-brand">
          <div class="brand-top">
            <div class="brand-logo">帮</div>
            <div class="brand-id">
              <div class="brand-name">家教帮</div>
              <div class="brand-en">TUTOR · 大学生家教接单平台</div>
            </div>
          </div>

          <div class="brand-graph">
            <svg class="graph-lines" viewBox="0 0 460 320" preserveAspectRatio="none">
              <line x1="230" y1="160" x2="120" y2="70"></line>
              <line x1="230" y1="160" x2="360" y2="90"></line>
              <line x1="230" y1="160" x2="95"  y2="230"></line>
              <line x1="230" y1="160" x2="335" y2="250"></line>
              <line x1="120" y1="70"  x2="95"  y2="230"></line>
              <line x1="360" y1="90"  x2="335" y2="250"></line>
            </svg>
            <span class="node n1"></span><span class="node n2"></span>
            <span class="node n3"></span><span class="node n4"></span>
            <span class="graph-core"><i></i></span>
            <span class="graph-core-label">智能匹配引擎</span>

            <div class="stat stat-a"><div class="stat-label">在线老师</div><div class="stat-num">128<small> 位</small></div></div>
            <div class="stat stat-b"><div class="stat-label">家长需求</div><div class="stat-num">56<small> 条</small></div></div>
            <div class="stat stat-c"><div class="stat-label">本月匹配</div><div class="stat-num green">3,280</div></div>
          </div>

          <div class="brand-foot">
            <h2 class="brand-slogan">名校学子一对一</h2>
            <div class="brand-slogan2">智能匹配 · 全维度筛选</div>
            <p class="brand-desc">老师填档案、家长发需求，搜索、私信、评价、收藏一气呵成</p>
            <div class="brand-meta">
              <span>v0.2 · 移动优先</span>
              <span class="online"><i></i>在线 · 实时数据</span>
            </div>
          </div>
        </aside>

        <!-- 右侧·表单区 -->
        <main class="auth-form">
          <div class="form-inner">
            <h1 class="welcome">${mode==="login"?"欢迎回来":"加入家教帮"}</h1>
            <p class="welcome-sub">${mode==="login"?"登录以继续使用家教帮":"注册一个账号，开始接单 / 发布需求"}</p>

            <div class="seg">
              <div class="seg-item ${mode==="login"?"on":""}" id="tabL">登录</div>
              <div class="seg-item ${mode==="register"?"on":""}" id="tabR">注册</div>
              <div class="seg-ind" style="transform:translateX(${mode==="login"?0:100}%)"></div>
            </div>

            ${mode==="register"?`
              <label class="fl">我的身份</label>
              <div class="role-grid" id="role">
                <div class="role-card ${role==="parent"?"on":""}" data-v="parent">
                  <span class="role-ico">👨‍👩‍👧</span><span class="role-name">我是家长</span>
                </div>
                <div class="role-card ${role==="tutor"?"on":""}" data-v="tutor">
                  <span class="role-ico">🧑‍🏫</span><span class="role-name">我是老师</span>
                </div>
              </div>
              <label class="fl">称呼</label>
              <div class="field"><span class="field-ico">👤</span><input id="name" placeholder="怎么称呼你"></div>
            `:""}

            <label class="fl">手机号</label>
            <div class="field"><span class="field-ico">📱</span><input id="acphone" inputmode="numeric" placeholder="请输入手机号"></div>

            <label class="fl">密码</label>
            <div class="field"><span class="field-ico">🔒</span>
              <input id="password" type="password" placeholder="请输入密码">
              <span class="field-eye" id="eye">👁</span>
            </div>

            <div class="err" id="err"></div>
            <button class="auth-btn" id="btn">${mode==="login"?"登 录":"注 册"}</button>

            <div class="auth-switch">
              ${mode==="login"?`还没有账号？<a id="toReg">立即注册</a>`:`已有账号？<a id="toLogin">去登录</a>`}
              <span class="dot">·</span><a onclick="go('#/')">先随便逛逛 ›</a>
            </div>

            <div class="auth-copyright">© 2026 家教帮 · 大学生家教接单平台</div>
          </div>
        </main>

      </div>
    </div>`;

    $("#tabL").onclick=()=>{mode="login";draw();};
    $("#tabR").onclick=()=>{mode="register";draw();};
    const toReg=$("#toReg"); if(toReg) toReg.onclick=()=>{mode="register";draw();};
    const toLogin=$("#toLogin"); if(toLogin) toLogin.onclick=()=>{mode="login";draw();};
    const eye=$("#eye"); if(eye) eye.onclick=()=>{const p=$("#password");const t=p.type==="password";p.type=t?"text":"password";eye.style.opacity=t?1:.5;};
    if(mode==="register")$$("#role .role-card").forEach(c=>c.onclick=()=>{role=c.dataset.v;$$("#role .role-card").forEach(x=>x.classList.toggle("on",x===c));});

    $("#btn").onclick=async()=>{$("#err").textContent="";
      const phone=$("#acphone").value.trim(),password=$("#password").value;
      if(!phone){$("#err").textContent="请输入手机号";return;}
      if(!password){$("#err").textContent="请输入密码";return;}
      if(mode==="register"&&!$("#name").value.trim()){$("#err").textContent="请填写称呼";return;}
      const btn=$("#btn");btn.disabled=true;btn.textContent="请稍候…";
      try{let d;
        if(mode==="login")d=await api("/login",{method:"POST",body:{phone,password}});
        else d=await api("/register",{method:"POST",body:{name:$("#name").value.trim(),phone,password,role}});
        setAuth(d.token,d.user);toast(mode==="login"?"登录成功":"注册成功");refreshUnread();
        go(d.user.role==="tutor"?"#/profile":"#/tutors");
      }catch(e){$("#err").textContent=e.message;btn.disabled=false;btn.textContent=mode==="login"?"登 录":"注 册";}
    };
  }
  draw();
};

/* ============== 路由 ============== */
// 渲染代次：每次导航 +1。慢网络下旧视图的 await 回来时若已不是当前代次，则不再写 DOM，
// 避免旧请求覆盖/污染新页面（如从首页快速跳到登录页时把登录页冲掉）。
let RENDER_GEN=0;
const isStale=(g)=>g!==RENDER_GEN;
async function render(){
  const myGen=++RENDER_GEN;
  const hash=location.hash.replace(/^#\//,"")||"";
  const [seg,arg]=hash.split("/");
  const v=views[seg]||views[""];
  // 登录页独立全屏：隐藏顶栏和底部导航
  document.body.classList.toggle("auth-mode", seg==="login");
  // 聊天页为二级页：隐藏底部导航，让输入框能贴底显示（否则被 tab 栏盖住）
  document.body.classList.toggle("chat-mode", seg==="chat");
  renderTabs();
  try{await v(arg,myGen);}catch(e){if(!isStale(myGen))view.innerHTML=`<div class="empty">出错了：${esc(e.message)}</div>`;}
  if(!isStale(myGen)&&!["chat"].includes(seg))window.scrollTo(0,0);
}
window.addEventListener("hashchange",render);
refreshUnread();
render();
