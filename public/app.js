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
          ${t.verified?'<span class="verified">✓认证</span>':""}${t.boosted?'<span class="boost">推广</span>':""}</div>
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
views[""]=async()=>{
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
      if(m.type==="requests"&&m.items.length){
        box.innerHTML=`<div class="section-title">🎯 适合你的需求 <span class="muted" style="font-weight:400">按你的科目地区匹配</span></div>`+m.items.slice(0,3).map(reqCard).join("");
      }else if(m.type==="tutors"&&m.items.length){
        box.innerHTML=`<div class="section-title">🎯 为你推荐${m.basedOn?`（基于"${esc(m.basedOn)}"）`:""}</div>`+m.items.slice(0,3).map(tutorCard).join("");
      }
    }catch{}
  }
  try{
    const {tutors}=await api("/tutors");
    $("#hot").innerHTML=tutors.length?tutors.slice(0,6).map(tutorCard).join(""):`<div class="empty">还没有老师入驻，<a style="color:var(--primary)" onclick="go('#/login')">来当第一个</a></div>`;
  }catch(e){$("#hot").innerHTML=`<div class="empty">${esc(e.message)}</div>`;}
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
            ${t.verified?'<span class="verified">✓认证</span>':""}</div>
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
    <div class="chat-input"><input id="msg" placeholder="输入消息…"><button class="btn" id="send">发送</button></div>`;
  async function load(){
    try{const {messages,peer}=await api("/messages/"+uid);
      setBar(peer.name+(peer.role==="tutor"?"（老师）":"（家长）"),{back:true});
      const c=$("#chat");
      c.innerHTML=messages.length?messages.map(m=>`<div class="bubble ${m.fromId===u.id?"me":"you"}">${esc(m.text)}</div>`).join(""):`<div class="empty">开始聊天吧~</div>`;
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
  $("#send").onclick=send;
  $("#msg").addEventListener("keydown",e=>{if(e.key==="Enter")send();});
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
      <div class="muted">${u.role==="tutor"?"大学生老师":"家长"} · ${esc(u.phone)}</div></div>
    </div>
    <div class="card" style="padding:4px 0">
      ${u.role==="tutor"?`
        <div class="conv" onclick="go('#/profile')"><span style="font-size:20px">🎓</span><div class="meta">我的档案</div><span>›</span></div>
        <div class="conv" onclick="go('#/tutor/${u.id}')"><span style="font-size:20px">👁</span><div class="meta">查看我的主页</div><span>›</span></div>
        <div class="conv" onclick="go('#/verify')"><span style="font-size:20px">✓</span><div class="meta">实名认证</div><span>›</span></div>
      `:`
        <div class="conv" onclick="go('#/post')"><span style="font-size:20px">📋</span><div class="meta">发布需求</div><span>›</span></div>
      `}
      <div class="conv" onclick="go('#/favorites')"><span style="font-size:20px">♥</span><div class="meta">我的收藏</div><span>›</span></div>
      <div class="conv" onclick="go('#/messages')"><span style="font-size:20px">💬</span><div class="meta">我的消息</div><span>›</span></div>
    </div>
    <button class="btn line block" id="logout">退出登录</button>`;
  $("#logout").onclick=async()=>{try{await api("/logout",{method:"POST"});}catch{}clearAuth();toast("已退出");go("#/");refreshUnread();};
};

/* 登录注册 */
views["login"]=async()=>{
  setBar("登录 / 注册",{back:true});
  let mode="login",role="parent";
  function draw(){
    view.innerHTML=`<div class="card">
      <div class="switch"><div class="chip ${mode==="login"?"on":""}" id="tabL">登录</div><div class="chip ${mode==="register"?"on":""}" id="tabR">注册</div></div>
      ${mode==="register"?`<label>我是</label><div class="switch" id="role">
        <div class="chip ${role==="parent"?"on":""}" data-v="parent">家长</div>
        <div class="chip ${role==="tutor"?"on":""}" data-v="tutor">大学生老师</div></div>
        <label>姓名/昵称</label><input id="name" placeholder="怎么称呼你">`:""}
      <label>手机号</label><input id="phone" inputmode="numeric" placeholder="作为登录账号">
      <label>密码</label><input id="password" type="password" placeholder="设置密码">
      <div class="err" id="err"></div>
      <button class="btn block" id="btn">${mode==="login"?"登录":"注册并进入"}</button>
    </div>`;
    $("#tabL").onclick=()=>{mode="login";draw();};
    $("#tabR").onclick=()=>{mode="register";draw();};
    if(mode==="register")$$("#role .chip").forEach(c=>c.onclick=()=>{role=c.dataset.v;$$("#role .chip").forEach(x=>x.classList.toggle("on",x===c));});
    $("#btn").onclick=async()=>{$("#err").textContent="";
      const phone=$("#phone").value.trim(),password=$("#password").value;
      try{let d;
        if(mode==="login")d=await api("/login",{method:"POST",body:{phone,password}});
        else d=await api("/register",{method:"POST",body:{name:$("#name").value.trim(),phone,password,role}});
        setAuth(d.token,d.user);toast(mode==="login"?"登录成功":"注册成功");refreshUnread();
        go(d.user.role==="tutor"?"#/profile":"#/tutors");
      }catch(e){$("#err").textContent=e.message;}
    };
  }
  draw();
};

/* ============== 路由 ============== */
async function render(){
  const hash=location.hash.replace(/^#\//,"")||"";
  const [seg,arg]=hash.split("/");
  const v=views[seg]||views[""];
  renderTabs();
  try{await v(arg);}catch(e){view.innerHTML=`<div class="empty">出错了：${esc(e.message)}</div>`;}
  if(!["chat"].includes(seg))window.scrollTo(0,0);
}
window.addEventListener("hashchange",render);
refreshUnread();
render();
