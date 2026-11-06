(function(){
const KEY='promo2-quiz-v3';
const EXAM={date:'2026-12-18', label:'2026. 12. 18.(금) 11:00', min:90, n:50};
/* 매일 오전 9시(KST) 공개: rel 날짜가 오늘(UTC 기준 = KST 9시 경계)보다 뒤면 숨김 */
const REL_DAY=new Date().toISOString().slice(0,10);
for(let i=QUESTIONS.length-1;i>=0;i--){ const r=QUESTIONS[i].rel; if(r&&r>REL_DAY) QUESTIONS.splice(i,1); }
const HOT_IDS=QUESTIONS.filter(q=>q.hot&&q.hot.y/q.hot.of>=0.6).sort((a,b)=>b.hot.y/b.hot.of-a.hot.y/a.hot.of).map(q=>q.id);
const FRESH_IDS=QUESTIONS.filter(q=>q.rel===REL_DAY).map(q=>q.id);
const byId=Object.fromEntries(QUESTIONS.map(q=>[q.id,q]));
const secOf=Object.fromEntries(SECTIONS.map(s=>[s.id,s]));
const subjOf=Object.fromEntries(SUBJECTS.map(s=>[s.id,s]));
const subjOfSec=s=>SUBJECTS.find(x=>x.secs.includes(s));
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const app=$('#app'), dock=$('#dock'), dockIn=$('#dockIn');
const isHard=q=>q.level==='고난도';
const isOk=(q,p)=>p===q.ans;
// 보기 순서를 섞어도 되는 문항(숫자 오름차순·개수형·괄호·합답형은 제외)
const canShuffle=q=>q.style!=='수능형'&&!(q.tags||[]).some(t=>['계산','괄호','개수형','핵심숫자'].includes(t))&&!q.box;

let store={ans:{},star:[],sess:null,best:{},round:1,log:{},srs:{},hist:[],goal:20,trk:{},pass:60};
const today=()=>{const d=new Date(Date.now()+9*3600000);return d.toISOString().slice(0,10);};
const DAY=86400000, STEPS=[1,3,7];
store.cfg=Object.assign({theme:'system',sound:true,vib:true},store.cfg||{});
function applyTheme(){ document.documentElement.dataset.fs=store.cfg.fs||'m'; const t=store.cfg.theme; if(t==='system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme=t; }
applyTheme();
let actx=null;
function sfx(ok){ if(!store.cfg.sound) return; try{ actx=actx||new (window.AudioContext||window.webkitAudioContext)(); if(actx.state==='suspended') actx.resume(); const now=actx.currentTime;
  const notes=ok==='combo'?[[784,0],[988,.08],[1175,.16],[1568,.26]]:ok?[[1046.5,0],[1318.5,.07],[1568,.14]]:[[220,0],[164.8,.1]];
  notes.forEach(([f,t],k)=>{ const o=actx.createOscillator(), g=actx.createGain(); o.type=ok?'sine':'triangle'; o.frequency.value=f; const peak=ok?0.15:0.2, dur=ok?(k===notes.length-1?0.38:0.16):0.22; g.gain.setValueAtTime(0.0001,now+t); g.gain.exponentialRampToValueAtTime(peak,now+t+0.012); g.gain.exponentialRampToValueAtTime(0.0001,now+t+dur); o.connect(g); g.connect(actx.destination); o.start(now+t); o.stop(now+t+dur+0.02); }); }catch(e){} }
let hapt=null;
function iosHaptic(){ try{ if(!hapt){ hapt=document.createElement('label'); hapt.setAttribute('aria-hidden','true'); hapt.style.cssText='position:fixed;left:-200px;top:0;opacity:0;pointer-events:none'; hapt.innerHTML='<input type="checkbox" switch tabindex="-1">'; document.body.appendChild(hapt);} hapt.click(); }catch(e){} }
function buzz(ms){ if(!store.cfg.vib) return; if(navigator.vibrate){ try{navigator.vibrate(ms);}catch(e){} } else { iosHaptic(); if(Array.isArray(ms)) setTimeout(iosHaptic,130); } }
try{const s=JSON.parse(localStorage.getItem(KEY)||'null'); if(s) store=Object.assign(store,s);}catch(e){}
function save(){try{localStorage.setItem(KEY,JSON.stringify(store));}catch(e){}}
function record(q,pick){const p=store.ans[q.id]||{n:0}; const ok=isOk(q,pick); store.ans[q.id]={pick,ok,n:p.n+1,t:Date.now()};
  const sj=subjOfSec(q.sec).id; store.trk=store.trk||{}; store.trk[sj]=((store.trk[sj]||'')+(ok?'1':'0')).slice(-80);
  const d=today(); store.log[d]=store.log[d]||{n:0,o:0}; store.log[d].n++; if(ok) store.log[d].o++;
  const r=store.srs[q.id];
  if(!ok) store.srs[q.id]={step:0,due:Date.now()+STEPS[0]*DAY};
  else if(r){ const st=r.step+1; if(st>=STEPS.length) delete store.srs[q.id]; else store.srs[q.id]={step:st,due:Date.now()+STEPS[st]*DAY}; }
}
// 합격 예측: 과목별 최근 80회 풀이를 Beta(1+o,1+x) 사후분포로 보고, 시험 배점(SUBJECTS.n)대로 합산한 점수 분포를 정규근사
function erf(x){const t=1/(1+0.3275911*Math.abs(x));const y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x);return x>=0?y:-y;}
const Phi=z=>0.5*(1+erf(z/Math.SQRT2));
function predict(){
  const trk=store.trk||{}; let tot=0, mu=0, v=0; const per=[];
  SUBJECTS.forEach(sub=>{let h=trk[sub.id]||''; if(h.length<10){ const a=QUESTIONS.filter(q=>sub.secs.includes(q.sec)&&store.ans[q.id]).map(q=>store.ans[q.id]).sort((x,y)=>(x.t||0)-(y.t||0)); if(a.length>h.length) h=a.map(x=>x.ok?'1':'0').join('').slice(-80); } const n=h.length, o=(h.match(/1/g)||[]).length; tot+=n;
    const a=1+o, b=1+n-o, p=a/(a+b), vp=a*b/((a+b)**2*(a+b+1));
    mu+=sub.n*p; v+=sub.n*p*(1-p)+sub.n*sub.n*vp; per.push({sub,n,p});});
  const need=(store.pass||60)/2; // 정답 문항 수 기준
  const prob=1-Phi((need-0.5-mu)/Math.sqrt(v));
  return {tot, score:Math.round(mu*2), prob:Math.round(prob*100), per, ready:tot>=20};
}
const dueIds=()=>Object.keys(store.srs).filter(id=>byId[id]&&store.srs[id].due<=Date.now());
function streak(){ let n=0; let t=new Date(Date.now()+9*3600000); for(;;){ const k=t.toISOString().slice(0,10); if(store.log[k]&&store.log[k].n>0){n++; t=new Date(t-DAY);} else { if(n===0&&k===today()){ t=new Date(t-DAY); continue; } break; } } return n; }
const isStar=id=>store.star.includes(id);
function toggleStar(id){store.star=isStar(id)?store.star.filter(x=>x!==id):store.star.concat(id); save();}
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const top=()=>window.scrollTo({top:0});
let lastShown='', tick=null, quitArmed=false, sheetOpen=false, view='home', introPaper='p1', noteTab='wrong';

/* ── 시험지: 과목별 고난도 우선, 단원 고르게 ── */
function pool(sub){
  const lists=sub.secs.map(s=>QUESTIONS.filter(q=>q.sec===s));
  const inter=f=>{const out=[];const ls=lists.map(l=>l.filter(f));let i=0;while(ls.some(l=>l.length)){const l=ls[i%ls.length];if(l.length)out.push(l.shift());i++;}return out;};
  return {hard:inter(isHard), norm:inter(q=>!isHard(q))};
}
function paper(k){
  const ids=[];
  SUBJECTS.forEach(sub=>{const p=pool(sub);
    const pick=p.hard.filter((q,i)=>i%2===k).concat(p.norm.filter((q,i)=>i%2===k)).slice(0,sub.n);
    ids.push(...pick.map(q=>q.id));});
  return ids;
}
function randomPaper(){
  const ids=[];
  SUBJECTS.forEach(sub=>{const p=pool(sub); const nh=Math.min(p.hard.length,Math.ceil(sub.n*0.4));
    const pick=shuffle(p.hard).slice(0,nh).concat(shuffle(p.norm).slice(0,sub.n-nh));
    ids.push(...shuffle(pick).map(q=>q.id));});
  return ids;
}
const PAPERS=[{id:'p1',name:'실전 제1회',desc:'매일 오전 9시 새 시험지',ic:'1',ids:()=>dailyPaper(0)},{id:'p2',name:'실전 제2회',desc:'매일 오전 9시 새 시험지',ic:'2',ids:()=>dailyPaper(1)},{id:'pr',name:'랜덤 실전',desc:'열 때마다 새로 출제',ic:'R',ids:randomPaper}];

/* ── 세션 ── */
function start(ids,title,mode,extra){
  if(!ids.length) return;
  const mix=!!(extra&&extra.mix);
  const perm=ids.map(id=>{const q=byId[id];const base=q.opts.map((_,i)=>i);return mix&&canShuffle(q)?shuffle(base):base;});
  store.sess=Object.assign({t0:Date.now(),combo:0,best:0,ids,title,mode,perm,i:0,picks:Array(ids.length).fill(null),rev:{},done:false,end:mode==='mock'?Date.now()+EXAM.min*60000:null},extra||{});
  save(); quitArmed=false; sheetOpen=false; view='quiz'; render(); top();
}
function finish(){
  const s=store.sess; if(!s||s.done) return;
  clearInterval(tick);
  if(s.mode==='mock'){
    s.ids.forEach((id,i)=>{ if(s.picks[i]!=null) record(byId[id],s.picks[i]); });
    const sc=s.ids.filter((id,i)=>isOk(byId[id],s.picks[i])).length*2;
    if(s.paper) store.best[s.paper]=Math.max(store.best[s.paper]||0,sc);
    const by={}; SUBJECTS.forEach(sub=>{const idx=s.ids.map((id,i)=>i).filter(i=>sub.secs.includes(byId[s.ids[i]].sec)); if(idx.length) by[sub.id]=[idx.filter(i=>isOk(byId[s.ids[i]],s.picks[i])).length,idx.length];});
    store.hist=(store.hist||[]).concat({name:s.title,sc,d:today(),by}).slice(-20);
  }
  s.done=true; s.tEnd=Date.now(); save(); render(); top(); setTimeout(()=>checkBadges(),900);
}

/* ── 홈·탭 ── */
const IC={
  home:'<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1z"/>',
  study:'<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20v-3"/><path d="M8 7h8M8 11h6"/>',
  exam:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5M12 2.5V5"/>',
  chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  flame:'<path d="M12 22c4 0 7-2.7 7-6.8 0-3.6-2.4-5.8-4-8.2-.6 2-1.6 3-3 3.6.4-3-1-6-4-8.6.3 3.6-3 6.1-3 10.4C5 18.7 8 22 12 22z"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  shuffle:'<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  bolt:'<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  calc:'<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M8 6.5h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 18.5h.01M12 18.5h4"/>',
  repeat:'<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  note:'<path d="M6 3h9l5 5v13H6z"/><path d="M14 3v6h6M9 13h7M9 17h5"/>',
  share:'<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  medal:'<circle cx="12" cy="15" r="6"/><path d="M8.5 9.5 6 3h4l2 4 2-4h4l-2.5 6.5"/>',
  star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  chev:'<path d="m9 6 6 6-6 6"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'
};
function go(v,after){ const f=()=>{ view=v; render(); top(); after&&after(); }; if(document.startViewTransition&&!matchMedia('(prefers-reduced-motion: reduce)').matches){ try{ document.startViewTransition(f); return; }catch(e){} } f(); }
const ico=(k,c='')=>`<svg class="i ${c}" viewBox="0 0 24 24" aria-hidden="true">${IC[k]}</svg>`;
const TABS=[['home','홈','home'],['study','연습','study'],['exam','모의고사','exam'],['report','리포트','chart']];
const tabbar=document.getElementById('tabbar');
function showTabs(cur){ tabbar.hidden=false; dock.hidden=true; tabbar.innerHTML=`<div class="wrap tabs">`+TABS.map(([v,l,i])=>`<button data-tab="${v}" aria-current="${cur===v}">${ico(i)}${tabBadge(v)}<span>${l}</span></button>`).join('')+`</div>`; tabbar.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{if(view!==b.dataset.tab) go(b.dataset.tab);}); }
function hideTabs(){ tabbar.hidden=true; }
function dday(){ const d=Math.ceil((new Date(EXAM.date+'T00:00:00+09:00')-new Date())/86400000); return d>0?`D-${d}`:d===0?'D-DAY':'시험 종료'; }
function gauge(pct,ready){
  const r=80, c=Math.PI*r, v=ready?Math.max(0,Math.min(100,pct)):0, cls=!ready?'na':v>=70?'hi':v>=40?'mid':'lo';
  return `<svg class="gauge ${cls}" viewBox="0 0 200 112" role="img" aria-label="합격 가능성 ${ready?v+'%':'계산 전'}"><defs><linearGradient id="ggrad" x1="0" x2="1"><stop offset="0" stop-color="#9fe7ff"/><stop offset=".55" stop-color="#ffffff"/><stop offset="1" stop-color="#ffe066"/></linearGradient></defs><path d="M20 100 A80 80 0 0 1 180 100" class="g-bg"/><path d="M20 100 A80 80 0 0 1 180 100" class="g-fg" style="stroke-dasharray:${c};stroke-dashoffset:${c*(1-v/100)}"/><text x="100" y="86" class="g-v">${ready?v+'%':'–'}</text><text x="100" y="106" class="g-l">합격 가능성</text></svg>`;
}
function stats(){
  const N=QUESTIONS.length, done=QUESTIONS.filter(q=>store.ans[q.id]), ok=done.filter(q=>store.ans[q.id].ok).length;
  return {N,done:done.length,ok,wrongIds:QUESTIONS.filter(q=>store.ans[q.id]&&!store.ans[q.id].ok).map(q=>q.id),newIds:QUESTIONS.filter(q=>!store.ans[q.id]).map(q=>q.id)};
}
function bindActs(){
  app.querySelectorAll('[data-act]').forEach(b=>{ const f=ACTS[b.dataset.act]; if(f){ b.onclick=e=>{e.stopPropagation();f(b);}; b.onkeydown=e=>{if(e.key==='Enter')f(b);}; } });
}
const ACTS={
  resume:()=>{view='quiz';render();top();},
  go:()=>start(stats().newIds,'안 푼 문제','practice',{mix:true}),
  newround:()=>{store.round=(store.round||1)+1; save(); start(shuffle(QUESTIONS.map(q=>q.id)),`${store.round}회독`,'practice',{mix:true});},
  review:()=>start(shuffle(dueIds()),'오늘의 복습','practice',{mix:true,loop:true}),
  rand:()=>start(shuffle(QUESTIONS.map(q=>q.id)).slice(0,10),'랜덤 10문제','practice',{mix:true}),
  hard:()=>start(shuffle(QUESTIONS.filter(isHard).map(q=>q.id)),'고난도','practice',{mix:true}),
  daily:()=>start([dailyQ().id],'오늘의 한 문제','practice',{daily:true}),
  hot:()=>{ const wr=HOT_IDS.filter(id=>store.ans[id]&&!store.ans[id].ok), nx=HOT_IDS.filter(id=>!store.ans[id]); const ids=wr.concat(nx); start(ids.length?ids.slice(0,20):shuffle(HOT_IDS).slice(0,20),'기출 빈출 쟁점','practice',{mix:true}); },
  fresh:()=>{ const nx=FRESH_IDS.filter(id=>!store.ans[id]); start(shuffle(nx.length?nx:FRESH_IDS),'오늘의 새 문제','practice',{mix:true}); },
  lastcheck:()=>{ const ids=lastCheckIds(); if(ids.length) start(ids,'마지막 점검','practice',{mix:true}); },
  flash:()=>flashPick(),
  setgoal:()=>{ const p=planInfo(); store.goal=Math.min(50,Math.max(10,p.need)); save(); toast(`하루 목표를 ${store.goal}문제로 맞췄어요`); render(); },
  guide:()=>installGuide(),
  starq:()=>{const ids=starIds(); if(ids.length) start(shuffle(ids),'별표 문제','practice',{mix:true});},
  wrong:()=>start(shuffle(stats().wrongIds),'오답 정복','practice',{mix:true,loop:true}),
  subj:b=>{const sub=subjOf[b.dataset.id];start(QUESTIONS.filter(q=>sub.secs.includes(q.sec)).map(q=>q.id),sub.name,'practice',{mix:true});},
  chap:b=>{const x=b.dataset.id;start(QUESTIONS.filter(q=>q.sec===x).map(q=>q.id),'공제약관 · '+secOf[x].name,'practice',{mix:true});},
  paper:b=>{introPaper=b.dataset.id;go('intro');},
  report:()=>go('report'),
  note:()=>go('note'),
  study:()=>go('study'),
  exam:()=>go('exam'),
  settings:()=>go('settings')
};
function quickGrid(st){
  const nh=QUESTIONS.filter(isHard).length, ns=starIds().length, nw=st.wrongIds.length, due=dueIds().length;
  const c=(act,emo,t,sub,dis,cls)=>`<button class="hcard ${cls||''}" data-act="${act}" ${dis?'disabled':''}><span class="emo">${emo}</span><b>${t}</b><span>${sub}</span></button>`;
  return `<div class="hscroll">`+c('rand','🎲','랜덤 10문제','전 과목 섞어서',0,'c1')+c('wrong','🔁','오답 정복',nw?`${nw}문제 · 맞힐 때까지`:'틀린 문제가 없어요',!nw,'c2')+c('hard','💎','고난도만',`${nh}문제`,0,'c3')+c('starq','⭐','별표 문제',ns?`${ns}문제`:'☆를 눌러 모아요',!ns,'c4')+c('review','📅','오늘의 복습',due?`${due}문제`:'복습할 문제 없음',!due,'c5')+`</div>`;
}
function home(){
  clearInterval(tick); showTabs('home');
  const st=stats(), s=store.sess, resumable=s&&!s.done&&s.mode!=='mock', allDone=!st.newIds.length, pr=predict();
  let h=`<div class="aurora"></div><header class="top-h"><div><span class="eyebrow">2급 승진자격시험</span><h1 class="title">예상 기출문제</h1></div><span class="hr"><span class="dday">${dday()}</span><button class="gear" data-act="settings" aria-label="설정">${ico('gear')}</button></span></header>`;
  h+=ddayCard();
  h+=`<section class="hero hero-x anim"><span class="hero-orb a"></span><span class="hero-orb b"></span>${pr.ready?`<span class="h-pill ${pr.prob>=70?'hi':pr.prob>=40?'mid':'lo'}"><i></i>${pr.prob>=70?'합격권이에요':pr.prob>=40?'조금만 더 힘내요':'집중 학습이 필요해요'}</span>`:`<span class="h-pill"><i></i>실력 분석 중</span>`}${gauge(pr.prob,pr.ready)}<p class="hero-msg">${pr.ready?`지금 실력이면 <b>${pr.score}점</b> 예상이에요<small>${store.pass||60}점 기준 · 최근 풀이 누적</small>`:`문제를 <b>${20-pr.tot}개</b> 더 풀면<br>합격 가능성을 계산해 드려요`}</p>
    <div class="hero-stats"><div><b>${st.done}</b><span>푼 문제</span></div><div><b>${st.done?Math.round(st.ok/st.done*100):0}%</b><span>정답률</span></div><div><b>${st.wrongIds.length}</b><span>오답</span></div></div>
    ${resumable?`<button class="cta" data-act="resume">이어서 풀기 · ${esc(s.title)} ${s.i+1}/${s.ids.length}</button>`
      :allDone?`<button class="cta warm" data-act="newround">다 풀었어요! 보기 섞어서 ${store.round+1}회독</button>`
      :`<button class="cta" data-act="go">안 푼 문제 풀기 · ${st.newIds.length}문제</button>`}</section>`;
  h+=planCard()+freshCard()+hotCard()+dailyCard();
  const tn=(store.log[today()]||{n:0}).n, due=dueIds().length, stk=streak();
  h+=`<div class="label">오늘의 학습${stk?`<small class="streak">${ico('flame')} ${stk}일 연속</small>`:''}</div><div class="daily anim"><div class="goal"><div class="ring" style="--p:${Math.min(100,tn/store.goal*100)}"><b>${tn}</b><span>/${store.goal}</span></div><div class="gtx"><b>${tn>=store.goal?'오늘 목표 달성! 🎉':`목표까지 ${store.goal-tn}문제`}</b><span>틀린 문제는 1·3·7일 뒤 다시 나와요</span></div></div><button class="cta ${due?'':'ghost'}" data-act="review" ${due?'':'disabled'}>${due?`오늘의 복습 ${due}문제`:'오늘 복습할 문제가 없어요'}</button></div>`;
  h+=`<div class="label">빠르게 풀기</div>`+quickGrid(st);
  h+=`<div class="label">바로가기</div><div class="list"><button class="row" data-act="exam"><span class="ic b">${ico('exam')}</span><span class="tx"><span class="nm">실전 모의고사</span><span class="meta">${EXAM.n}문항 · ${EXAM.min}분 · 제1회·제2회·랜덤</span></span>${ico('chev','chev')}</button><button class="row" data-act="note"><span class="ic y">${ico('note')}</span><span class="tx"><span class="nm">오답·별표 노트</span><span class="meta">틀린 문제 ${st.wrongIds.length} · 별표 ${store.star.length}</span></span>${ico('chev','chev')}</button>${isStandalone()||!isMobile?'':`<button class="row" data-act="guide"><span class="ic b">${ico('home')}</span><span class="tx"><span class="nm">홈 화면에 앱으로 추가하기</span><span class="meta">주소창 없이 앱처럼 · 그림으로 따라하기</span></span>${ico('chev','chev')}</button>`}</div>`;
  h+=`<p class="foot">${esc(EXAM.label)} 시험 · 공고 과목(자배법·손해사정이론·보험계약법·공제약관·상식) 기준 손해사정사 1차 수준 예상문제 ${st.N}문항. 풀이 기록은 이 기기에 저장돼요.</p>`;
  app.innerHTML=h; bindActs();
  const fg=app.querySelector('.hero .g-fg'), gv=app.querySelector('.hero .g-v');
  if(fg&&pr.ready&&!matchMedia('(prefers-reduced-motion: reduce)').matches){ const end=fg.style.strokeDashoffset; const full=fg.style.strokeDasharray; fg.style.transition='none'; fg.style.strokeDashoffset=full; requestAnimationFrame(()=>requestAnimationFrame(()=>{ fg.style.transition=''; fg.style.strokeDashoffset=end; })); if(gv){ const to=pr.prob, t0=performance.now(); const f=t=>{const k=Math.min(1,(t-t0)/1000); gv.textContent=Math.round(to*(1-Math.pow(1-k,3)))+'%'; if(k<1) requestAnimationFrame(f);}; requestAnimationFrame(f);} }
}
function study(){
  clearInterval(tick); showTabs('study');
  const st=stats();
  let h=`<header class="top-h"><div><span class="eyebrow">과목별 연습</span><h1 class="title">무엇을 풀어볼까요?</h1></div></header>`;
  h+=searchBox();
  h+=flashEntry();
  h+=`<div class="list anim">`+SUBJECTS.map((sub,k)=>{
    const qs=QUESTIONS.filter(q=>sub.secs.includes(q.sec)), d=qs.filter(q=>store.ans[q.id]), o=d.filter(q=>store.ans[q.id].ok).length, nh=qs.filter(isHard).length;
    const pct=d.length?Math.round(o/d.length*100):null;
    const chips=sub.secs.length>1?`<span class="chips">${sub.secs.map(x=>`<button class="chip" data-act="chap" data-id="${x}">${esc(secOf[x].name)}</button>`).join('')}</span>`:'';
    return `<div class="row subj" data-act="subj" data-id="${sub.id}" role="button" tabindex="0"><span class="sring n${k}" style="--p:${Math.round(d.length/qs.length*100)}" aria-label="진도 ${Math.round(d.length/qs.length*100)}%"><b>${({F:'🚕',E:'🔍',D:'📜',Y:'📘',G:'📰'})[sub.id]||k+1}</b></span><span class="tx"><span class="nm">${esc(sub.name)}</span><span class="meta">${qs.length}문항 · 고난도 ${nh} · 시험 ${sub.n}문항 예상</span>${chips}<span class="mini"><i class="o" style="width:${o/qs.length*100}%"></i><i class="x" style="width:${(d.length-o)/qs.length*100}%"></i></span></span><span class="pct ${pct==null?'':pct>=60?'hi':'lo'}">${pct==null?'':pct+'%'}</span></div>`;
  }).join('')+`</div>`;
  h+=`<div class="label">빠르게 풀기</div>`+quickGrid(st);
  app.innerHTML=h; bindActs();
}
function exam(){
  clearInterval(tick); showTabs('exam');
  let h=`<header class="top-h"><div><span class="eyebrow">실전 모의고사</span><h1 class="title">실제 시험처럼<br>${EXAM.n}문항 · ${EXAM.min}분</h1></div></header>`;
  h+=paperInfo();
  h+=`<div class="papers anim">`+PAPERS.map(p=>`<button class="paper" data-act="paper" data-id="${p.id}"><span class="ic ${p.id==='pr'?'r':''}">${p.ic}</span><span class="tx"><b>${esc(p.name)}</b><span>${esc(p.desc)}</span></span><span class="best ${store.best[p.id]!=null?'':'no'}">${store.best[p.id]!=null?`최고 ${store.best[p.id]}점`:'미응시'}</span></button>`).join('')+`</div>`;
  const hs=(store.hist||[]).slice(-10);
  h+=`<div class="label">응시 기록</div>`;
  if(hs.length){
    const W=300,H=120,pad=16, xs=i=>pad+(hs.length===1?(W-2*pad)/2:i*(W-2*pad)/(hs.length-1)), ys=v=>H-pad-(v/100)*(H-2*pad);
    const pts=hs.map((x,i)=>`${xs(i)},${ys(x.sc)}`).join(' ');
    h+=`<div class="qcard chartcard"><svg viewBox="0 0 ${W} ${H}" class="line" role="img" aria-label="모의고사 점수 추이"><line x1="${pad}" x2="${W-pad}" y1="${ys(store.pass||60)}" y2="${ys(store.pass||60)}" class="pass"/><text x="${W-pad}" y="${ys(store.pass||60)-5}" class="pl">${store.pass||60}점</text><polyline points="${pts}" class="ln"/>${hs.map((x,i)=>`<circle cx="${xs(i)}" cy="${ys(x.sc)}" r="${i===hs.length-1?5:3.5}" class="${i===hs.length-1?'last':''}"/>`).join('')}<text x="${xs(hs.length-1)}" y="${ys(hs[hs.length-1].sc)-10}" class="lv">${hs[hs.length-1].sc}</text></svg></div>`;
    h+=`<div class="list" style="margin-top:10px"><table class="tbl"><thead><tr><th>날짜</th><th>시험</th><th>점수</th></tr></thead><tbody>`+hs.slice().reverse().map(x=>`<tr><td>${x.d.slice(5).replace('-','.')}</td><td>${esc(x.name)}</td><td><b class="${x.sc>=(store.pass||60)?'hi':'lo'}">${x.sc}</b></td></tr>`).join('')+`</tbody></table></div>`;
  } else h+=`<div class="empty">아직 응시한 모의고사가 없어요.<br>제1회부터 시작해 보세요.</div>`;
  app.innerHTML=h; bindActs();
}

/* ── 응시 안내 ── */
function intro(){
  hideTabs(); dock.hidden=false; dock.classList.remove('fbd','ok','no');
  const p=PAPERS.find(x=>x.id===introPaper);
  let h=`<button class="back" id="back">‹ 모의고사</button><h1 class="title">${esc(p.name)}</h1><p class="sub">객관식 ${EXAM.n}문항 · ${EXAM.min}분 · 문항당 2점</p>`;
  h+=`<div class="list"><table class="tbl"><thead><tr><th>과목</th><th>문항</th><th>배점</th></tr></thead><tbody>`+SUBJECTS.map(s=>`<tr><td>${esc(s.name)}</td><td>${s.n}</td><td>${s.n*2}</td></tr>`).join('')+`<tr class="sum"><td>합계</td><td>${EXAM.n}</td><td>100</td></tr></tbody></table></div>`;
  h+=`<div class="label">응시 안내</div><div class="qcard notes"><p>시작하면 ${EXAM.min}분 타이머가 돌고, 시간이 끝나면 자동으로 제출돼요.</p><p>문항을 오가며 답을 바꿀 수 있어요. 아래 <b>답안지</b>에서 빈 문항을 확인하세요.</p><p>과목마다 손해사정사 1차 수준의 고난도 문항이 포함돼요.</p><p>제출하면 과목별 점수와 해설을 보여줘요.</p></div>`;
  app.innerHTML=h;
  dockIn.innerHTML=`<button class="cta" id="begin">시험 시작하기</button>`;
  $('#back').onclick=()=>go('exam');
  $('#begin').onclick=()=>start(p.ids(),p.name,'mock',{paper:p.id,mix:p.id==='pr'});
}

/* ── 문제 카드 ── */
function card(q,o,no){ // o:{pick,reveal,locked,perm}
  const sub=subjOfSec(q.sec), perm=o.perm||q.opts.map((_,i)=>i);
  let h=`<div class="qmeta"><span class="tag">${esc(sub.name)}${sub.secs.length>1?' · '+esc(secOf[q.sec].name):''}</span>${isHard(q)?'<span class="tag hd">고난도</span>':''}${q.hot&&q.hot.y/q.hot.of>=0.6?'<span class="tag ht">기출 빈출</span>':''}${q.style==='수능형'?'<span class="tag su">보기형</span>':''}<button class="star" data-star="${q.id}" aria-pressed="${isStar(q.id)}" aria-label="별표">${isStar(q.id)?'★':'☆'}</button></div>`;
  h+=`<p class="qtext">${no?`<span class="qno">${no}.</span>`:''}${esc(q.q)}</p>`;
  if(q.case) h+=`<div class="case">${esc(q.case)}</div>`;
  if(q.box){const l=q.boxTitle===undefined?'보기':(q.boxTitle?esc(q.boxTitle):''); h+=`<div class="box">${l?`<span class="lbl">${l}</span>`:''}${q.box.map(b=>`<p>${esc(b)}</p>`).join('')}</div>`;}
  h+=`<ol class="opts">`+perm.map((oi,pos)=>{
    let c='';
    if(o.reveal){ if(oi===q.ans) c='right'; else if(oi===o.pick) c='wrong'; else c='dim'; }
    else if(oi===o.pick) c='sel';
    return `<li><button class="opt ${c}" data-pick="${oi}" ${o.locked?'disabled':''}><span class="n">${pos+1}</span><span class="t">${esc(q.opts[oi])}</span></button></li>`;
  }).join('')+`</ol>`;
  if(o.reveal){
    const ok=isOk(q,o.pick), none=o.pick==null, ansPos=perm.indexOf(q.ans)+1;
    h+=`<div class="fb"><div class="v ${none?'na':ok?'ok':'no'}">${none?'미응답':ok?'정답이에요!':'아쉬워요'} · 정답 ${ansPos}번</div><div class="talk"><div class="me"><span class="mt">${kTime()}</span><span class="mb">${none?'잘 모르겠어요 🤔':`${perm.indexOf(o.pick)+1}번으로 할게요`}</span></div><div class="chat"><span class="av">해설</span><div class="bub"><div class="who">해설 도우미</div><div class="body">${hl(q.exp)}</div>${q.why?`<ul class="why">${perm.map((oi,pos)=>`<li class="${oi===q.ans?'a':''}"><b>${pos+1}</b><span>${hl(q.why[oi])}</span></li>`).join('')}</ul>`:''}${q.hot?`<div class="hotln">📌 ${HOTSRC(q)} · <b>${esc(q.hot.t)}</b></div>`:''}<div class="ref">근거 · ${esc(q.ref)}</div></div></div></div></div>`;
    h+=`<button class="linkbtn rep" data-rep="${q.id}">이 문제 이상해요</button>`;
  }
  return h;
}
function bindStars(root){root.querySelectorAll('[data-star]').forEach(b=>b.onclick=e=>{e.stopPropagation();e.preventDefault();toggleStar(b.dataset.star);const on=isStar(b.dataset.star);toast(on?'별표에 담았어요':'별표에서 뺐어요');b.setAttribute('aria-pressed',on);b.textContent=on?'★':'☆';});}

/* ── 풀이 ── */
function quiz(){
  const s=store.sess, n=s.ids.length, q=byId[s.ids[s.i]], mock=s.mode==='mock';
  const reveal=!mock&&!!s.rev[s.i];
  const filled=s.picks.filter(p=>p!=null).length;
  let h=`<div class="qbar"><button class="x-btn" id="quit" aria-label="나가기">✕</button><div class="track"><i style="width:${(mock?filled:(s.i+(reveal?1:0)))/n*100}%"></i></div><span class="count ${mock?'timer':''}" id="cnt">${mock?fmtLeft():`${s.i+1}/${n}`}</span></div>`;
  if(!mock&&s.combo>=2) h+=`<div class="combo" id="combo">${ico('flame')}<b>${s.combo}</b>연속 정답</div>`;
  if(s.loop) h+=`<div class="secline"><b>오답 정복 모드</b><span>틀리면 맨 뒤에 다시 나와요${s.again?` · 재출제 ${s.again}`:''}</span></div>`;
  if(quitArmed) h+=`<p class="quitmsg">${mock?'한 번 더 누르면 채점 없이 종료돼요':'한 번 더 누르면 홈으로 나가요 · 이어서 풀 수 있어요'}</p>`;
  if(mock) h+=`<div class="secline"><b>${esc(subjOfSec(q.sec).name)}</b><span>${s.i+1} / ${n}번</span></div>`;
  h+=`<article class="qcard" id="qc">${card(q,{pick:s.picks[s.i],reveal,locked:reveal,perm:s.perm[s.i]},mock?s.i+1:null)}</article>`;
  if(mock&&sheetOpen) h+=`<div class="label">답안지<small>${filled}/${n} 표기</small></div><div class="qcard" style="padding:18px">`+SUBJECTS.map(sub=>{const idx=s.ids.map((id,i)=>i).filter(i=>sub.secs.includes(byId[s.ids[i]].sec)); if(!idx.length) return ''; return `<div class="omr-sub">${esc(sub.name)}</div><div class="sheetgrid">${idx.map(i=>{const p=s.picks[i];return `<button class="${p!=null?'m':''} ${i===s.i?'cur':''}" data-jump="${i}">${i+1}${p!=null?'·'+(s.perm[i].indexOf(p)+1):''}</button>`;}).join('')}</div>`;}).join('')+`</div>`;
  const fresh=lastShown!==s.ids[s.i]+':'+s.i; lastShown=s.ids[s.i]+':'+s.i;
  app.innerHTML=h; hideTabs();
  if(fresh){ const qc=$('#qc'); if(qc) qc.classList.add(navDir<0?'slide-back':'slide'); } navDir=1;
  if(reveal&&!isOk(q,s.picks[s.i])){ const qc=$('#qc'); if(qc) qc.classList.add('wr'); }
  dock.hidden=false;
  const last=s.i===n-1;
  if(mock){
    dock.classList.remove('fbd','ok','no');
    dockIn.innerHTML=`<button class="cta ghost side" id="prev" ${s.i===0?'disabled':''}>이전</button><button class="cta ghost side" id="sheet">답안지</button><button class="cta" id="next">${last?'제출하기':'다음'}</button>`;
    $('#prev').onclick=()=>{s.i--;save();quiz();top();};
    $('#sheet').onclick=()=>{sheetOpen=!sheetOpen;quiz();};
    $('#next').onclick=()=>{ if(last){ const blank=s.picks.filter(p=>p==null).length; if(blank&&!s._warn){s._warn=1;$('#next').textContent=`빈 답 ${blank}개 · 그래도 제출`;return;} finish(); } else {s.i++;save();quiz();top();} };
  }else{
    const okNow=reveal&&isOk(q,s.picks[s.i]);
    dock.classList.toggle('fbd',!!reveal); dock.classList.toggle('ok',okNow); dock.classList.toggle('no',!!reveal&&!okNow);
    dockIn.innerHTML=reveal?`<div class="fbbar"><span class="fbi">${okNow?'✓':'✕'}</span><div class="fbt"><b>${okNow?(s.combo>=3?`${s.combo}연속 정답!`:'정답이에요!'):`정답은 ${s.perm[s.i].indexOf(q.ans)+1}번`}</b><span>${okNow?'해설로 한 번 더 다지기':'해설을 확인하고 넘어가요'}</span></div></div><button class="cta" id="next">${last?'결과 보기':'계속'}</button>`:`<button class="cta" id="next" disabled>답을 골라 주세요</button>`;
    if(reveal) $('#next').onclick=()=>{ if(last) finish(); else {s.i++;save();quiz();top();} };
  }
  document.querySelectorAll('#qc .opt').forEach(b=>b.onclick=()=>{
    const p=+b.dataset.pick;
    if(mock){ s.picks[s.i]=p; s._warn=0; save(); quiz(); return; }
    s.picks[s.i]=p; s.rev[s.i]=1; record(q,p); const good=isOk(q,p);
    if(s.daily){ store.daily=store.daily||{}; store.daily[dayKey9()]={id:q.id,ok:good}; }
    if(good){ s.combo=(s.combo||0)+1; s.best=Math.max(s.best||0,s.combo); store.maxCombo=Math.max(store.maxCombo||0,s.combo); const ms=[5,10,20,30].includes(s.combo); sfx(ms?'combo':true); buzz(12); if(ms) setTimeout(()=>comboBurst(s.combo),220); }
    else { s.combo=0; sfx(false); buzz([30,40,30]); }
    if(s.loop&&!isOk(q,p)){ const base=q.opts.map((_,k)=>k); s.ids.push(q.id); s.perm.push(canShuffle(q)?shuffle(base):base); s.picks.push(null); s.again=(s.again||0)+1; }
    save(); quiz();
    const tgt=good?document.querySelector('.fb'):document.querySelector('#qc .opt.right'); if(tgt&&!(typeof DSK!=='undefined'&&DSK.matches)) setTimeout(()=>tgt.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:good?'nearest':'center'}),good?0:380);
    checkBadges();
  });
  document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>{s.i=+b.dataset.jump;save();quiz();top();});
  bindStars(app);
  bindSwipe(dir=>{ if(mock){ if(dir<0&&!last){s.i++;save();quiz();top();} else if(dir>0&&s.i>0){s.i--;navDir=-1;save();quiz();top();} } else if(reveal&&dir<0){ if(last) finish(); else {s.i++;save();quiz();top();} } });
  $('#quit').onclick=()=>quitSheet(mock); if(0){ quitArmed=false; if(mock){store.sess=null;save();} view='home'; render(); top(); };
  if(mock){ clearInterval(tick); tick=setInterval(()=>{ const c=$('#cnt'); if(!store.sess||store.sess.done){clearInterval(tick);return;} if(s.end-Date.now()<=0){finish();return;} if(c){c.textContent=fmtLeft(); c.classList.toggle('low',s.end-Date.now()<600000);} const left=s.end-Date.now(); if(left<600000&&!s._w10){s._w10=1;save();toast('⏰ 10분 남았어요. 빈 답부터 채우세요');buzz([20,60,20]);} if(left<60000&&!s._w1){s._w1=1;save();toast('⏰ 1분 남았어요!');buzz([30,60,30]);} },1000); }
}
function fmtLeft(){const s=store.sess; const t=Math.ceil(Math.max(0,s.end-Date.now())/1000); return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');}

/* ── 결과 ── */
const sname=n=>n.replace('자동차손해배상보장법','자배법');
function result(){
  const s=store.sess; hideTabs(); dock.hidden=false; dock.classList.remove('fbd','ok','no');
  let rs=s.ids.map((id,i)=>({q:byId[id],pick:s.picks[i],perm:s.perm[i],ok:isOk(byId[id],s.picks[i])}));
  if(s.loop){ const first={}; rs.forEach(r=>{ if(!(r.q.id in first)) first[r.q.id]=r; }); rs=Object.values(first); }
  const ok=rs.filter(r=>r.ok).length, wrong=rs.filter(r=>!r.ok).map(r=>r.q.id), mock=s.mode==='mock';
  const sc=mock?ok*2:Math.round(ok/rs.length*100);
  const grade=sc>=90?'S':sc>=80?'A':sc>=70?'B':sc>=60?'C':'D', secs=Math.round(((s.tEnd||Date.now())-(s.t0||Date.now()))/1000);
  const tm=secs>=3600?`${Math.floor(secs/3600)}시간 ${Math.floor(secs%3600/60)}분`:secs>=60?`${Math.floor(secs/60)}분 ${secs%60}초`:`${secs}초`; const per=rs.length?secs/rs.length:0, perT=per<1?'1초 미만':per>=60?`${Math.floor(per/60)}분 ${Math.round(per%60)}초`:`${Math.round(per)}초`;
  let h=`<div class="result"><span class="grade g${grade}">${grade}</span>${mock?`<span class="stamp ${sc>=(store.pass||60)?'ok':'no'}">${sc>=(store.pass||60)?'합격권':'재도전'}</span>`:''}<div class="eyebrow">${esc(s.title)} 결과</div><div class="sc"><span id="scn">0</span><small>점</small></div><p>${s.loop?`${rs.length}문항 모두 정복! 첫 시도 정답 ${ok}문항 · 재출제 ${s.again||0}번`:`${rs.length}문항 중 ${ok}문항 정답`}</p>${mock?`<span class="pass ${sc>=(store.pass||60)?'ok':'no'}">${sc>=(store.pass||60)?'합격권':'합격 기준 미달'} · ${store.pass||60}점 기준</span>`:''}<div class="rmeta"><div><b>${tm}</b><span>소요 시간</span></div><div><b>${perT}</b><span>문항당</span></div>${mock?`<div><b>${rs.length-ok}</b><span>틀린 문제</span></div>`:`<div><b>${s.best||0}</b><span>최대 콤보</span></div>`}</div><button class="shr" id="shr">${ico('share')}결과 카드 저장·공유</button></div>`;
  if(!mock){ const by=SUBJECTS.map(sub=>{const r=rs.filter(x=>sub.secs.includes(x.q.sec));return r.length?{sub,o:r.filter(x=>x.ok).length,n:r.length}:null;}).filter(Boolean); if(by.length>1) h+=`<div class="label">과목별</div><div class="qcard bars stag">`+by.map(x=>`<div class="bar"><span class="bn">${esc(sname(x.sub.name))}</span><span class="bt"><i style="width:${x.o/x.n*100}%" class="${x.o/x.n<.6?'lo':''}"></i></span><span class="bv">${x.o}/${x.n}</span></div>`).join('')+`</div>`; }
  if(mock) h+=`<div class="label">과목별 점수</div><div class="qcard bars stag">`+SUBJECTS.map(sub=>{const r=rs.filter(x=>sub.secs.includes(x.q.sec));if(!r.length)return'';const o=r.filter(x=>x.ok).length;return `<div class="bar"><span class="bn">${esc(sname(sub.name))}</span><span class="bt"><i style="width:${o/r.length*100}%" class="${o/r.length<.6?'lo':''}"></i></span><span class="bv">${o*2}<small>/${r.length*2}점</small></span></div>`;}).join('')+`</div>`;
  h+=`<div class="label">문항별 확인<small>눌러서 해설 보기</small></div><div class="seg rf" style="margin-bottom:10px"><button data-rf="all" aria-pressed="true">전체 ${rs.length}</button><button data-rf="wrong" aria-pressed="false">틀린 문제 ${rs.length-ok}</button></div><ul class="rlist" id="rlist">`+rs.map((r,i)=>`<li><details><summary><span class="mk ${r.ok?'o':'x'}">${r.ok?'○':'×'}</span><span class="qq"><small>${i+1}번 · ${esc(subjOfSec(r.q.sec).name)}${isHard(r.q)?' · 고난도':''}</small>${esc(r.q.q)}</span></summary><div class="inner"><div class="qcard">${card(r.q,{pick:r.pick,reveal:true,locked:true,perm:r.perm})}</div></div></details></li>`).join('')+`</ul>`;
  app.innerHTML=h; bindStars(app);
  const cardData={title:s.title,sc,mock,ok,n:rs.length,grade,pass:store.pass||60,by:SUBJECTS.map(sub=>{const r=rs.filter(x=>sub.secs.includes(x.q.sec));return r.length?{name:sub.name,o:r.filter(x=>x.ok).length,n:r.length}:null;}).filter(Boolean)};
  $('#shr').onclick=()=>shareCard(cardData);
  countUp($('#scn'),sc); if((mock&&sc>=(store.pass||60))||(!mock&&sc===100&&rs.length>=5)) confetti();
  dockIn.innerHTML=`<button class="cta ghost side" id="home">홈</button><button class="cta" id="retry" ${wrong.length?'':'disabled'}>${wrong.length?(s.loop?`처음 틀린 ${wrong.length}문제 한 번 더`:`틀린 ${wrong.length}문제 맞힐 때까지 풀기`):'모두 맞혔어요'}</button>`;
  $('#home').onclick=()=>{store.sess=null;save();view='home';render();top();};
  if(wrong.length) $('#retry').onclick=()=>start(wrong,'오답 정복','practice',{mix:true,loop:true});
}

function countUp(el,to){ if(!el) return; if(matchMedia('(prefers-reduced-motion: reduce)').matches){el.textContent=to;return;} const t0=performance.now(),d=700; const f=t=>{const k=Math.min(1,(t-t0)/d); el.textContent=Math.round(to*(1-Math.pow(1-k,3))); if(k<1) requestAnimationFrame(f);}; requestAnimationFrame(f); }
function confetti(){ if(matchMedia('(prefers-reduced-motion: reduce)').matches) return; const c=document.createElement('canvas'); c.className='confetti'; document.body.appendChild(c); const x=c.getContext('2d'); const W=c.width=innerWidth*2, H=c.height=innerHeight*2; const cols=['#3182f6','#fee500','#0ca678','#f04452','#a78bfa']; const ps=[...Array(110)].map(()=>({x:W/2+(Math.random()-.5)*W*.3,y:H*.35,vx:(Math.random()-.5)*26,vy:-Math.random()*28-8,r:Math.random()*10+6,c:cols[Math.floor(Math.random()*cols.length)],a:Math.random()*6})); let n=0; const step=()=>{ x.clearRect(0,0,W,H); ps.forEach(p=>{p.vy+=1.1;p.x+=p.vx;p.y+=p.vy;p.a+=.2;x.save();x.translate(p.x,p.y);x.rotate(p.a);x.fillStyle=p.c;x.fillRect(-p.r/2,-p.r/4,p.r,p.r/2);x.restore();}); if(++n<110) requestAnimationFrame(step); else c.remove(); }; requestAnimationFrame(step); }
/* ── 노트 ── */
function note(){
  showTabs('report');
  const wrong=QUESTIONS.filter(q=>store.ans[q.id]&&!store.ans[q.id].ok), stars=QUESTIONS.filter(q=>isStar(q.id));
  const list0=noteTab==='wrong'?wrong:stars; const list=noteSub?list0.filter(q=>subjOfSec(q.sec).id===noteSub):list0;
  let h=`<button class="back" id="back">‹ 리포트</button><h1 class="title">오답·별표 노트</h1><p class="sub">다시 맞히면 오답 목록에서 빠져요.</p>`;
  h+=`<div class="seg" style="margin-bottom:14px"><button data-t="wrong" aria-pressed="${noteTab==='wrong'}">오답 ${wrong.length}</button><button data-t="star" aria-pressed="${noteTab==='star'}">별표 ${stars.length}</button></div>`;
  h+=noteChips(list0);
  if(!list.length) h+=`<div class="empty">${noteTab==='wrong'?'아직 틀린 문제가 없어요.':'별표한 문제가 없어요.<br>문제 오른쪽 위 ☆를 눌러 모아 보세요.'}</div>`;
  else h+=`<ul class="rlist">`+list.map(q=>{const a=store.ans[q.id];return `<li><details><summary><span class="mk ${a?(a.ok?'o':'x'):''}">${a?(a.ok?'○':'×'):'–'}</span><span class="qq"><small>${esc(subjOfSec(q.sec).name)}</small>${esc(q.q)}</span></summary><div class="inner"><div class="qcard">${card(q,{pick:a?a.pick:null,reveal:true,locked:true})}</div></div></details></li>`;}).join('')+`</ul>`;
  app.innerHTML=h; bindStars(app);
  if(list.length){ app.insertAdjacentHTML('beforeend',`<div style="margin-top:14px"><button class="cta" id="redo">이 ${list.length}문제 맞힐 때까지 풀기</button></div>`); $('#redo').onclick=()=>start(shuffle(list.map(q=>q.id)),noteTab==='wrong'?'오답 정복':'별표 문제','practice',{mix:true,loop:true}); }
  $('#back').onclick=()=>go('report');
  document.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{noteTab=b.dataset.t;noteSub='';note();});
  document.querySelectorAll('[data-ns]').forEach(b=>b.onclick=()=>{noteSub=b.dataset.ns;note();});
}

function report(){
  store.badgeSeen=Object.assign({},store.badges||{}); save();
  showTabs('report');
  const rate=qs=>{const d=qs.filter(q=>store.ans[q.id]);const o=d.filter(q=>store.ans[q.id].ok).length;return {d:d.length,o,r:d.length?Math.round(o/d.length*100):null,t:qs.length};};
  let h=`<header class="top-h"><div><span class="eyebrow">학습 리포트</span><h1 class="title">나의 실력 분석</h1></div></header>`;
  const all=rate(QUESTIONS);
  h+=`<div class="stat3"><div><b>${all.d}</b><span>푼 문항</span></div><div><b>${all.r==null?'–':all.r+'%'}</b><span>정답률</span></div><div><b>${streak()}일</b><span>연속 학습</span></div></div>`;
  const pr=predict();
  h+=`<div class="label">합격 예측<small>최근 풀이 누적 · ${store.pass||60}점 이상 합격 가정</small></div><div class="qcard predbox">`+(pr.ready?`<div class="pbig ${pr.prob>=70?'hi':pr.prob>=40?'mid':'lo'}">${pr.prob}%</div><p class="psub">지금 실력으로 시험을 보면 예상 점수는 <b>${pr.score}점</b>이에요.</p><table class="tbl" style="margin-top:8px"><thead><tr><th>과목</th><th>최근 정답률</th><th>예상 점수</th></tr></thead><tbody>`+pr.per.map(x=>`<tr><td>${esc(x.sub.name)}</td><td>${x.n?Math.round(x.p*100)+'%':'–'}<small style="color:var(--muted)"> (${x.n}회)</small></td><td>${Math.round(x.sub.n*x.p*2)}/${x.sub.n*2}</td></tr>`).join('')+`</tbody></table><p class="foot" style="margin:12px 0 0">과목별 최근 80회 풀이로 정답률을 추정하고, 시험 배점대로 합산해 계산해요. 적게 푼 과목은 50% 쪽으로 보수적으로 잡혀요. 공고에 합격 기준이 없어 아래에서 기준 점수를 고를 수 있어요.</p>`:`<p class="psub">문제를 ${20-pr.tot}개 더 풀면 합격 가능성을 계산해 드려요.</p>`)+`<div class="seg" style="margin-top:12px">${[60,70,80].map(g=>`<button data-pass="${g}" aria-pressed="${(store.pass||60)===g}">${g}점 기준</button>`).join('')}</div></div>`;
  h+=`<div class="list" style="margin-top:12px"><button class="row" id="gonote"><span class="ic y">${ico('note')}</span><span class="tx"><span class="nm">오답·별표 노트</span><span class="meta">틀린 문제와 보기별 해설 모아보기</span></span>${ico('chev','chev')}</button><button class="row" id="goset"><span class="ic">${ico('gear')}</span><span class="tx"><span class="nm">설정</span><span class="meta">테마·효과음·진동·목표·합격 기준</span></span>${ico('chev','chev')}</button></div>`;
  h+=`<div class="label">과목별 정답률</div><div class="qcard bars">`+SUBJECTS.map(sub=>{const r=rate(QUESTIONS.filter(q=>sub.secs.includes(q.sec)));return `<div class="bar"><span class="bn">${esc(sname(sub.name))}</span><span class="bt"><i style="width:${r.r||0}%" class="${r.r!=null&&r.r<60?'lo':''}"></i></span><span class="bv">${r.r==null?'–':r.r+'%'}<small>${r.d}/${r.t}</small></span></div>`;}).join('')+`</div>`;
  const secs=SECTIONS.map(s=>({s,...rate(QUESTIONS.filter(q=>q.sec===s.id))})).filter(x=>x.d>=3).sort((a,b)=>a.r-b.r).slice(0,3);
  h+=`<div class="label">취약 단원 TOP 3<small>3문항 이상 푼 단원</small></div>`;
  h+=secs.length?`<div class="list">`+secs.map((x,i)=>`<button class="row" data-weak="${x.s.id}"><span class="ic">${i+1}</span><span class="tx"><span class="nm">${esc(subjOfSec(x.s.id).name)}${subjOfSec(x.s.id).secs.length>1?' · '+esc(x.s.name):''}</span><span class="meta">정답률 ${x.r}% · ${x.o}/${x.d}</span></span><span class="chev">›</span></button>`).join('')+`</div>`:`<div class="empty">문제를 더 풀면 취약 단원을 알려 드려요.</div>`;
  h+=planCard()+heatmap()+badgeGrid();
  const days=[...Array(7)].map((_,i)=>{const t=new Date(Date.now()+9*3600000-(6-i)*DAY);const k=t.toISOString().slice(0,10);return {k,n:(store.log[k]||{n:0}).n,l:['일','월','화','수','목','금','토'][t.getUTCDay()]};});
  const mx=Math.max(store.goal,...days.map(d=>d.n));
  h+=`<div class="label">최근 7일 학습량<small>진한 막대 = 목표 ${store.goal}문제 달성</small></div><div class="qcard week"><div class="cols" style="--g:${store.goal/mx*100}%">`+days.map(d=>`<div class="col"><span class="cv">${d.n||''}</span><i style="height:${d.n/mx*100}%" class="${d.n>=store.goal?'hit':''}"></i><span class="cl">${d.l}</span></div>`).join('')+`</div></div>`;
  const hs=(store.hist||[]).slice(-8);
  h+=`<div class="label">모의고사 기록</div>`;
  h+=hs.length?`<div class="list"><table class="tbl"><thead><tr><th>날짜</th><th>시험</th><th>점수</th></tr></thead><tbody>`+hs.slice().reverse().map(x=>`<tr><td>${x.d.slice(5).replace('-','.')}</td><td>${esc(x.name)}</td><td><b>${x.sc}</b></td></tr>`).join('')+`</tbody></table></div>`:`<div class="empty">아직 응시한 모의고사가 없어요.</div>`;
  h+=`<div class="label">하루 목표</div><div class="seg" id="goals">${[10,20,30,50].map(g=>`<button data-g="${g}" aria-pressed="${store.goal===g}">${g}문제</button>`).join('')}</div>`;
  app.innerHTML=h;
  $('#gonote').onclick=()=>go('note');
  $('#goset').onclick=()=>go('settings');
  document.querySelectorAll('[data-weak]').forEach(b=>b.onclick=()=>{const x=b.dataset.weak;start(QUESTIONS.filter(q=>q.sec===x).map(q=>q.id),'취약 단원 · '+secOf[x].name,'practice',{mix:true});});
  document.querySelectorAll('[data-pass]').forEach(b=>b.onclick=()=>{store.pass=+b.dataset.pass;save();report();});
  document.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{store.goal=+b.dataset.g;save();report();});
}
function settings(){
  showTabs('report');
  const c=store.cfg;
  const seg=(k,opts)=>`<div class="seg">${opts.map(([v,l])=>`<button data-k="${k}" data-v="${v}" aria-pressed="${String(c[k])===String(v)}">${l}</button>`).join('')}</div>`;
  let h=`<button class="back" id="back">‹ 리포트</button><h1 class="title">설정</h1><p class="sub">이 기기에만 저장돼요.</p>`;
  h+=`<div class="set"><div class="sr"><b>화면 테마</b>${seg('theme',[['system','시스템'],['light','라이트'],['dark','다크']])}</div>
    <div class="sr"><b>글자 크기</b><small>문제·해설 글자</small>${seg('fs',[['m','보통'],['l','크게'],['xl','아주 크게']])}</div>
    <div class="sr"><b>효과음</b>${seg('sound',[['true','켜기'],['false','끄기']])}</div>
    <div class="sr"><b>진동</b><small>아이폰은 iOS 18 이상</small>${seg('vib',[['true','켜기'],['false','끄기']])}</div>
    <div class="sr"><b>하루 목표</b><div class="seg">${[10,20,30,50].map(g=>`<button data-goal="${g}" aria-pressed="${store.goal===g}">${g}문제</button>`).join('')}</div></div>
    <div class="sr"><b>합격 기준</b><small>공고에 없어 직접 정해요</small><div class="seg">${[60,70,80].map(g=>`<button data-pass="${g}" aria-pressed="${(store.pass||60)===g}">${g}점</button>`).join('')}</div></div></div>`;
  h+=`<div class="label">앱 정보</div><div class="list"><div class="row"><span class="tx"><span class="nm">문항 수</span><span class="meta">총 ${QUESTIONS.length}문항 · 고난도 ${QUESTIONS.filter(isHard).length} · 보기별 해설 ${QUESTIONS.filter(q=>q.why).length}</span></span></div><div class="row"><span class="tx"><span class="nm">업데이트</span><span class="meta">매주 월·목 새 문제가 자동으로 추가돼요</span></span></div><button class="row" id="gdOpen"><span class="tx"><span class="nm">홈 화면에 앱으로 추가하는 법</span><span class="meta">아이폰·갤럭시 그림으로 단계별 안내</span></span>${ico('chev','chev')}</button><button class="row" id="bk"><span class="tx"><span class="nm">기록 백업하기</span><span class="meta">폰을 바꾸거나 사파리 기록을 지울 때 대비해요</span></span>${ico('chev','chev')}</button><button class="row" id="rs"><span class="tx"><span class="nm">기록 복원하기</span><span class="meta">백업 코드를 붙여넣어 그대로 되살려요</span></span>${ico('chev','chev')}</button><button class="row" id="replay"><span class="tx"><span class="nm">처음 안내 다시 보기</span></span>${ico('chev','chev')}</button><button class="row" id="wipe"><span class="tx"><span class="nm danger">풀이 기록 초기화</span><span class="meta">푼 기록·오답·별표·모의고사 기록이 모두 지워져요</span></span></button></div>`;
  app.innerHTML=h;
  $('#back').onclick=()=>go('report');
  app.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{const k=b.dataset.k,v=b.dataset.v; c[k]=v==='true'?true:v==='false'?false:v; save(); applyTheme(); if(k==='sound'&&c.sound) sfx(true); settings();});
  app.querySelectorAll('[data-goal]').forEach(b=>b.onclick=()=>{store.goal=+b.dataset.goal;save();settings();});
  app.querySelectorAll('[data-pass]').forEach(b=>b.onclick=()=>{store.pass=+b.dataset.pass;save();settings();});
  $('#replay').onclick=()=>{slideI=0;onboarding();};
  $('#gdOpen').onclick=()=>installGuide();
  $('#bk').onclick=backup; $('#rs').onclick=restore;
  let armed=false; $('#wipe').onclick=()=>{ if(!armed){armed=true;$('#wipe .nm').textContent='한 번 더 누르면 초기화돼요';return;} const cfg=store.cfg; store={ans:{},star:[],sess:null,best:{},round:1,log:{},srs:{},hist:[],goal:20,trk:{},pass:60,cfg}; save(); toast('기록을 초기화했어요'); view='home'; render(); };
}
function render(){
  app.ontouchstart=app.ontouchend=null;
  const s=store.sess;
  if(s&&s.done) return result();
  if(s&&!s.done&&(view==='quiz'||s.mode==='mock')){ view='quiz'; return quiz(); }
  if(view==='note') return note();
  if(view==='report') return report();
  if(view==='study') return study();
  if(view==='settings') return settings();
  if(view==='exam') return exam();
  if(view==='intro') return intro();
  return home();
}
/* ── 첫 실행 경험: 스플래시 → 온보딩 → 설치 안내 → 업데이트 알림 ── */
const ov=document.getElementById('ov');
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
const META_KEY='promo2-meta-v1';
let meta={onb:false,inst:0,seen:0,seenIds:[]};
try{ const m=JSON.parse(localStorage.getItem(META_KEY)||'null'); if(m) meta=Object.assign(meta,m); }catch(e){}
const saveMeta=()=>{try{localStorage.setItem(META_KEY,JSON.stringify(meta));}catch(e){}};
const isStandalone=()=>{try{return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;}catch(e){return false;}};
const inFrame=()=>{try{return window.self!==window.top;}catch(e){return true;}};
const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const isMobile=/android|iphone|ipad|ipod/i.test(navigator.userAgent)||isIOS;

function hideSplash(){ const sp=document.getElementById('splash'); if(!sp) return; if(RM){ sp.remove(); return; } sp.classList.add('out'); setTimeout(()=>sp.classList.add('gone'),230); setTimeout(()=>sp.remove(),560); }

const SLIDES=[
 {k:'exam',t:'실제 시험처럼 연습해요',d:'공고와 같은 50문항 · 90분 실전 모의고사.\n과목별 점수와 보기별 해설까지 바로 확인해요.',
  art:`<div class="art-paper"><div class="ap-top"><span>실전 제1회</span><b>87:42</b></div><div class="ap-q"><i></i><i></i><i class="s"></i></div><div class="ap-o sel"><b>1</b><i></i></div><div class="ap-o"><b>2</b><i></i></div><div class="ap-o"><b>3</b><i></i></div></div>`},
 {k:'repeat',t:'틀린 문제는 맞힐 때까지',d:'오답 정복 모드는 틀리면 보기를 섞어 다시 나와요.\n1일·3일·7일 뒤 자동 복습으로 확실히 기억해요.',
  art:`<div class="art-cards"><div class="ac c3">7일</div><div class="ac c2">3일</div><div class="ac c1"><span class="x">✕</span> → <span class="o">○</span><small>1일 뒤 복습</small></div></div>`},
 {k:'chart',t:'합격 가능성을 실시간으로',d:'푼 기록을 계속 누적해 예상 점수와\n합격 가능성을 계산하고, 취약 단원을 짚어줘요.',
  art:`<div class="art-gauge"><svg viewBox="0 0 200 112"><path d="M20 100 A80 80 0 0 1 180 100" class="g-bg"/><path d="M20 100 A80 80 0 0 1 180 100" class="g-fg dash"/></svg><b>78%</b><span>합격 가능성</span></div>`},
 {k:'target',t:'매일 조금씩, 꾸준히',d:'월·목마다 새 문제가 자동으로 추가돼요.\n하루 목표를 정하고 시작해 볼까요?',goal:true,
  art:`<div class="art-ring"><div class="ring big" style="--p:72"><b>14</b><span>/20</span></div><span class="fl">🔥 5일 연속</span></div>`}
];
let slideI=0;
function onboarding(){
  ov.hidden=false; ov.className='ov onb';
  const s=SLIDES[slideI], last=slideI===SLIDES.length-1;
  ov.innerHTML=`<div class="onb-wrap"><button class="onb-skip" id="skip">${last?'':'건너뛰기'}</button>
    <div class="onb-art" id="art">${s.art}</div>
    <div class="onb-tx"><h2>${s.t}</h2><p>${esc(s.d)}</p>${s.goal?`<div class="seg onb-goal">${[10,20,30,50].map(g=>`<button data-g="${g}" aria-pressed="${store.goal===g}">하루 ${g}문제</button>`).join('')}</div>`:''}</div>
    <div class="dots">${SLIDES.map((_,i)=>`<i class="${i===slideI?'on':''}"></i>`).join('')}</div>
    <button class="cta" id="onext">${last?'시작하기':'다음'}</button></div>`;
  const art=$('#art'); if(!RM) art.classList.add('in');
  ov.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{store.goal=+b.dataset.g;save();onboarding();});
  const next=()=>{ if(last){ meta.onb=true; meta.seen=QUESTIONS.length; meta.seenIds=QUESTIONS.map(q=>q.id); saveMeta(); closeOv(); setTimeout(maybeInstall,350); } else { slideI++; onboarding(); } };
  const prev=()=>{ if(slideI>0){ slideI--; onboarding(); } };
  $('#onext').onclick=next;
  const sk=$('#skip'); if(sk&&!last) sk.onclick=()=>{ slideI=SLIDES.length-1; onboarding(); };
  let x0=null; const w=ov.querySelector('.onb-wrap');
  w.ontouchstart=e=>{x0=e.touches[0].clientX;}; w.ontouchend=e=>{ if(x0==null) return; const dx=e.changedTouches[0].clientX-x0; if(dx<-50) next(); else if(dx>50) prev(); x0=null; };
}
function closeOv(){ ov.classList.add('out'); setTimeout(()=>{ov.hidden=true; ov.className='ov'; ov.innerHTML='';},RM?0:250); }
function sheet(html,onBind){
  ov.hidden=false; ov.className='ov dim';
  ov.innerHTML=`<div class="sheet" role="dialog" aria-modal="true"><span class="grab"></span>${html}</div>`;
  ov.onclick=e=>{ if(e.target===ov) closeOv(); };
  onBind&&onBind();
}
function maybeInstall(){
  if(isStandalone()&&isIOS&&!meta.icon2&&meta.onb){ meta.icon2=true; saveMeta(); return iconNotice(); }
  if(isStandalone()||inFrame()||!isMobile) return maybeUpdate();
  if(meta.inst&&Date.now()-meta.inst<3*86400000) return maybeUpdate();
  const steps=isIOS?[['Safari 맨 아래 주소창 오른쪽 <b>⋯</b>를 눌러요','share'],['<b>공유</b> → <b>더 보기</b>를 눌러요','plus'],['<b>홈 화면에 추가</b> → 오른쪽 위 <b>추가</b>','check']]
                  :[['Chrome 오른쪽 위 <b>⋮ 메뉴</b>를 눌러요','menu'],['<b>홈 화면에 추가</b> 또는 <b>앱 설치</b>를 골라요','plus'],['<b>설치</b>를 누르면 끝!','check']];
  sheet(`<div class="app-badge"><img src="icon-192.png" alt="" onerror="this.style.display='none'"><div><b>앱으로 설치하기</b><span>홈 화면에서 바로 열리고, 주소창 없이 전체화면으로 풀 수 있어요.</span></div></div>
    <ol class="steps">${steps.map(([t],i)=>`<li><span>${i+1}</span><p>${t}</p></li>`).join('')}</ol>
    <button class="cta" id="instGd">그림으로 따라하기</button><button class="cta ghost" id="instOk">알겠어요</button><button class="linkbtn center" id="instLater">나중에 할게요</button>`,()=>{
      { const g=$('#instGd'); if(g) g.onclick=()=>{meta.inst=Date.now()+30*86400000;saveMeta();closeOv();setTimeout(()=>installGuide(),280);}; }
      $('#instOk').onclick=()=>{meta.inst=Date.now()+30*86400000;saveMeta();closeOv();setTimeout(maybeUpdate,300);};
      $('#instLater').onclick=()=>{meta.inst=Date.now();saveMeta();closeOv();setTimeout(maybeUpdate,300);};
    });
}
function maybeUpdate(){
  const seen=new Set(meta.seenIds||[]);
  const fresh=QUESTIONS.filter(q=>!seen.has(q.id));
  if(!meta.onb||!fresh.length||!(meta.seenIds||[]).length){ meta.seenIds=QUESTIONS.map(q=>q.id); saveMeta(); return; }
  const by={}; fresh.forEach(q=>{const n=subjOfSec(q.sec).name; by[n]=(by[n]||0)+1;});
  sheet(`<div class="upd"><span class="upd-ic">${ico('bolt')}</span><b>새 문제 ${fresh.length}개가 추가됐어요</b><p>${Object.entries(by).map(([k,v])=>`${esc(k)} ${v}`).join(' · ')}</p></div>
    <button class="cta" id="updGo">새 문제 바로 풀기</button><button class="linkbtn center" id="updLater">나중에</button>`,()=>{
      const done=()=>{meta.seenIds=QUESTIONS.map(q=>q.id);saveMeta();};
      $('#updGo').onclick=()=>{done();closeOv();start(fresh.map(q=>q.id),'새로 추가된 문제','practice',{mix:true});};
      $('#updLater').onclick=()=>{done();closeOv();};
    });
}
function toast(msg){ const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.classList.add('out'),1800); setTimeout(()=>t.remove(),2200); }
document.addEventListener('pointerdown',e=>{ const el=e.target.closest('button,.row,.opt,.paper,.qbtn,.chip'); if(!el||el.disabled||matchMedia('(prefers-reduced-motion: reduce)').matches) return; const r=el.getBoundingClientRect(), d=Math.max(r.width,r.height)*1.2; const sp=document.createElement('span'); sp.className='ripple'; sp.style.width=sp.style.height=d+'px'; sp.style.left=(e.clientX-r.left-d/2)+'px'; sp.style.top=(e.clientY-r.top-d/2)+'px'; el.appendChild(sp); setTimeout(()=>sp.remove(),600); },{passive:true});
function launch(){
  setTimeout(()=>{ hideSplash(); setTimeout(()=>{ if(!meta.onb && !(store.sess&&!store.sess.done)) onboarding(); else maybeInstall(); }, RM?0:300); }, RM?150:1900);
}

if(store.sess&&store.sess.mode==='mock'&&!store.sess.done&&store.sess.end<Date.now()) finish();
const hs=(location.hash||'').slice(1);
const hsub=SUBJECTS.find(x=>x.id===hs.toUpperCase())||SUBJECTS.find(x=>x.secs.includes(hs.toUpperCase()));
const hpaper=PAPERS.find(p=>p.id===hs.toLowerCase());
const busy=store.sess&&!store.sess.done;
if(hpaper&&!busy){ view='intro'; introPaper=hpaper.id; render(); }
else if(hsub&&!busy){ start(QUESTIONS.filter(q=>hsub.secs.includes(q.sec)).map(q=>q.id),hsub.name,'practice',{mix:true}); }
else render();
launch();

/* ── v11: 별표·신고·백업 ── */
function starIds(){ const ids=new Set(QUESTIONS.map(q=>q.id)); return (store.star||[]).filter(id=>ids.has(id)); }
function copyText(t){ try{ if(navigator.clipboard&&window.isSecureContext) return navigator.clipboard.writeText(t).then(()=>true,()=>false); }catch(e){} try{ const ta=document.createElement('textarea'); ta.value=t; ta.setAttribute('readonly',''); ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); const ok=document.execCommand('copy'); ta.remove(); return Promise.resolve(ok);}catch(e){ return Promise.resolve(false);} }
function reportQ(id){
  const q=QUESTIONS.find(x=>x.id===id); if(!q) return;
  sheet(`<div class="upd"><span class="upd-ic">${ico('note')}</span><b>이 문제 이상해요</b><p>문제 번호 ${esc(id)} · ${esc(subjOfSec(q.sec).name)}</p></div>
    <div class="chips rep-chips">${['정답이 틀렸어요','해설이 이상해요','법령이 바뀌었어요','오타가 있어요'].map(t=>`<button class="chip" data-why="${t}">${t}</button>`).join('')}</div>
    <textarea id="repTx" class="bk-ta" rows="3" placeholder="어떤 점이 이상한지 적어 주세요 (선택)"></textarea>
    <button class="cta" id="repGo">신고 내용 복사하기</button><p class="bk-note">복사한 내용을 카카오톡으로 김민기 대리에게 보내 주시면 확인 후 고칠게요.</p>`,()=>{
      let tag=''; ov.querySelectorAll('[data-why]').forEach(b=>b.onclick=()=>{tag=b.dataset.why; ov.querySelectorAll('[data-why]').forEach(x=>x.setAttribute('aria-pressed',x===b));});
      $('#repGo').onclick=()=>{ const t=`[2급 진급시험 문제 신고]\n문제: ${id} (${subjOfSec(q.sec).name})\n${q.q.slice(0,60)}…\n유형: ${tag||'-'}\n내용: ${$('#repTx').value.trim()||'-'}`; copyText(t).then(ok=>{ closeOv(); toast(ok?'복사했어요. 카톡에 붙여넣어 보내 주세요':'복사가 안 되면 화면을 캡처해 보내 주세요'); }); };
    });
}
document.addEventListener('click',e=>{ const b=e.target.closest&&e.target.closest('[data-rep]'); if(b){ e.preventDefault(); e.stopPropagation(); reportQ(b.dataset.rep); } },true);
function enc(o){ return btoa(unescape(encodeURIComponent(JSON.stringify(o)))); }
function dec(s){ return JSON.parse(decodeURIComponent(escape(atob(s.replace(/\s+/g,''))))); }
function backup(){
  const code='P2Q1.'+enc({v:1,t:Date.now(),store});
  sheet(`<div class="upd"><span class="upd-ic">${ico('note')}</span><b>기록 백업 코드</b><p>푼 문제 ${Object.keys(store.ans).length}개 · 별표 ${(store.star||[]).length}개 · 모의고사 ${(store.hist||[]).length}회</p></div>
    <textarea class="bk-ta" rows="4" readonly>${code}</textarea>
    <button class="cta" id="bkCopy">코드 복사하기</button><p class="bk-note">카톡 나에게 보내기나 메모장에 붙여 두세요. 새 폰에서 설정 → 기록 복원하기에 붙여넣으면 돼요.</p>`,()=>{
      $('#bkCopy').onclick=()=>copyText(code).then(ok=>{ toast(ok?'백업 코드를 복사했어요':'코드를 길게 눌러 직접 복사해 주세요'); if(ok) closeOv(); });
    });
}
function restore(){
  sheet(`<div class="upd"><span class="upd-ic">${ico('repeat')}</span><b>기록 복원하기</b><p>지금 기기의 기록은 백업 코드 내용으로 바뀌어요.</p></div>
    <textarea id="rsTx" class="bk-ta" rows="4" placeholder="P2Q1.로 시작하는 백업 코드를 붙여넣으세요"></textarea>
    <button class="cta" id="rsGo">복원하기</button>`,()=>{
      $('#rsGo').onclick=()=>{ try{ const raw=$('#rsTx').value.trim(); if(!raw.startsWith('P2Q1.')) throw 0; const d=dec(raw.slice(5)); if(!d||!d.store||typeof d.store.ans!=='object') throw 0; const cfg=store.cfg; store=Object.assign({ans:{},star:[],sess:null,best:{},round:1,log:{},srs:{},hist:[],goal:20,trk:{},pass:60},d.store); store.cfg=store.cfg||cfg; store.sess=null; save(); closeOv(); toast('기록을 복원했어요'); view='home'; render(); }catch(e){ toast('코드가 올바르지 않아요. 다시 확인해 주세요'); } };
    });
}

/* ── v12: 연출·오늘의 한 문제·D-Day·잔디·배지·결과 카드 ── */
var navDir=1;
function bindSwipe(fn){ let x0=null,y0=null; app.ontouchstart=e=>{ const t=e.touches[0]; x0=t.clientX; y0=t.clientY; }; app.ontouchend=e=>{ if(x0==null) return; const t=e.changedTouches[0], dx=t.clientX-x0, dy=t.clientY-y0; x0=null; if(Math.abs(dx)>70&&Math.abs(dy)<45) fn(dx<0?-1:1); }; }
function hl(s){ return esc(s).replace(/(제\d+조(?:의\d+)?(?:\s?제\d+항)?(?:\s?제\d+호)?(?:\s?단서)?|\d[\d,.]*\s?(?:%p|%|만\s?원|억\s?원|천만\s?원|원|개월|주|일|년|월|급|km|세|점|배|회|분|시간|명|건))/g,'<mark class="hl">$1</mark>'); }
function daysLeft(){ return Math.ceil((new Date(EXAM.date+'T00:00:00+09:00')-new Date())/86400000); }
function dailyQ(){ const d=dayKey9(); let h=0; for(const c of d+'promo2') h=(h*31+c.charCodeAt(0))>>>0; const list=QUESTIONS.slice().sort((a,b)=>a.id<b.id?-1:1); return list[h%list.length]; }
function HOTSRC(q){ return q.hot.of===17?`손해사정사 2차 자동차보험 기출 ${q.hot.of}회 중 ${q.hot.y}회 출제 쟁점`:`손해사정사 1차 기출 최근 ${q.hot.of}회 중 ${q.hot.y}회 출제 쟁점`; }
function hotCard(){
  if(!HOT_IDS.length) return '';
  const done=HOT_IDS.filter(id=>store.ans[id]).length, ok=HOT_IDS.filter(id=>store.ans[id]&&store.ans[id].ok).length;
  const pct=Math.round(done/HOT_IDS.length*100);
  return `<div class="label">기출 빈출 쟁점<small>손해사정사 기출 분석</small></div><button class="hotc anim" data-act="hot"><span class="hc-top"><span class="hc-ic">🔥</span><span class="hc-tx"><b>빈출 ${HOT_IDS.length}문제</b><small>${done?`${done}문제 풀었어요 · 정답 ${ok}개`:'시험마다 나오는 쟁점부터 잡아요'}</small></span><span class="hc-go">${done>=HOT_IDS.length?'다시':'풀기'} ›</span></span><span class="hc-bar"><i style="width:${pct}%"></i></span></button>`;
}
function freshCard(){
  if(!FRESH_IDS.length) return '';
  const done=FRESH_IDS.filter(id=>store.ans[id]).length, all=done>=FRESH_IDS.length;
  return `<div class="label">오늘 공개된 새 문제<small>매일 오전 9시 · 교재·수료시험 반영</small></div><button class="fresh anim" data-act="fresh"><span class="fr-ic">✨</span><span class="fr-tx"><b>새 문제 ${FRESH_IDS.length}개</b><small>${all?'오늘 새 문제를 다 풀었어요 · 다시 풀기':done?`${done}개 풀었어요 · 이어서 풀기`:'오늘 처음 나온 문제부터 풀어 보세요'}</small></span><span class="fr-go">${all?'다시':'풀기'} ›</span></button>`;
}
function dailyCard(){
  const d=dayKey9(), q=dailyQ(), r=(store.daily||{})[d];
  return `<div class="label">오늘의 한 문제<small>${d.slice(5).replace('-','.')} · 매일 오전 9시에 바뀌어요</small></div><button class="dq anim" data-act="daily"><span class="dq-top"><span class="dq-tag">${esc(subjOfSec(q.sec).name)}${isHard(q)?' · 고난도':''}</span>${r?`<span class="dq-st ${r.ok?'ok':'no'}">${r.ok?'✓ 맞혔어요':'✕ 틀렸어요'}</span>`:''}</span><span class="dq-q">${esc(q.q)}</span><span class="dq-go">${r?'다시 풀어보기':'지금 풀기'} ›</span></button>`;
}
function lastCheckIds(){ const st=stats(); const seen=new Set(), out=[]; const add=a=>a.forEach(id=>{ if(byId[id]&&!seen.has(id)&&out.length<20){ seen.add(id); out.push(id);} });
  add(shuffle(st.wrongIds).slice(0,8)); add(shuffle(dueIds())); add(shuffle(starIds()).slice(0,4));
  const pr=predict(); const weak=pr.per.slice().sort((a,b)=>a.p-b.p).slice(0,2).map(x=>x.sub);
  weak.forEach(sub=>add(shuffle(QUESTIONS.filter(q=>sub.secs.includes(q.sec)).map(q=>q.id)).slice(0,4)));
  add(shuffle(QUESTIONS.filter(isHard).map(q=>q.id))); return shuffle(out); }
function ddayCard(){
  const d=daysLeft(); let cls='', t='', p='', btn=false;
  if(d<0) return '';
  if(d===0){ cls='d0'; t='오늘이 시험날이에요'; p=`${EXAM.label} · 90분 · 50문항. 지금까지 충분히 준비했어요. 잘 보고 오세요!`; }
  else if(d===1){ cls='d1'; t='내일이 시험이에요'; p='새 문제보다 오답·별표만 가볍게 훑고 일찍 쉬어요.'; btn=true; }
  else if(d<=7){ cls='d7'; t=`실전 주간 · D-${d}`; p='하루 한 번 실전 모의고사, 틀린 문제는 바로 오답 정복.'; btn=true; }
  else if(d<=30){ cls='d30'; t=`마지막 한 달 · D-${d}`; p='취약 과목부터 채우고, 주 2회 모의고사로 시간 감각을 익혀요.'; }
  else return '';
  return `<section class="dday-card ${cls} anim"><b>${t}</b><p>${p}</p>${btn?`<button class="cta sm" data-act="lastcheck">마지막 점검 20문제</button>`:''}</section>`;
}
function comboBurst(n){ if(RM){ toast(`🔥 ${n}연속 정답!`); return; } const el=document.createElement('div'); el.className='burst'; el.innerHTML=`<span>🔥</span><b>${n}연속 정답!</b>`; document.body.appendChild(el); setTimeout(()=>el.remove(),1500); if(n>=10) confetti(); }
var BADGES=[
 ['first','🌱','첫걸음','첫 문제 풀기',st=>st.done>=1],
 ['q50','✏️','50문제','50문항 풀기',st=>st.done>=50],
 ['q100','📚','100문제','100문항 풀기',st=>st.done>=100],
 ['all','🏁','1회독 완주','전 문항 한 번씩 풀기',st=>st.done>=st.N],
 ['st3','🔥','3일 연속','3일 연속 학습',()=>streak()>=3],
 ['st7','⚡','7일 연속','7일 연속 학습',()=>streak()>=7],
 ['c10','🎯','10연속','10문제 연속 정답',()=>(store.maxCombo||0)>=10],
 ['hard20','💎','고난도 사냥꾼','고난도 20문항 정답',()=>QUESTIONS.filter(q=>isHard(q)&&store.ans[q.id]&&store.ans[q.id].ok).length>=20],
 ['mock1','📝','첫 모의고사','실전 모의고사 1회 응시',()=>(store.hist||[]).length>=1],
 ['pass','🎓','합격권','모의고사 합격 기준 넘기',()=>(store.hist||[]).some(h=>h.sc>=(store.pass||60))],
 ['m90','🏆','90점 클럽','모의고사 90점 이상',()=>(store.hist||[]).some(h=>h.sc>=90)],
 ['master','👑','과목 마스터','한 과목 20문항 이상·정답률 80%',()=>SUBJECTS.some(sub=>{const d=QUESTIONS.filter(q=>sub.secs.includes(q.sec)&&store.ans[q.id]);return d.length>=20&&d.filter(q=>store.ans[q.id].ok).length/d.length>=.8;})],
 ['daily7','☀️','오늘의 7문제','오늘의 한 문제 7번 풀기',()=>Object.keys(store.daily||{}).length>=7],
 ['clean','✨','오답 제로','50문항 이상 풀고 오답 0개',st=>st.done>=50&&st.wrongIds.length===0]
];
function checkBadges(silent){ store.badges=store.badges||{}; const st=stats(); const got=[]; BADGES.forEach(b=>{ if(!store.badges[b[0]]){ let ok=false; try{ok=b[4](st);}catch(e){} if(ok){ store.badges[b[0]]=Date.now(); got.push(b);} } }); if(got.length){ save(); if(!silent) got.forEach((b,i)=>setTimeout(()=>badgePop(b),i*1700)); } }
function badgePop(b){ const el=document.createElement('div'); el.className='bpop'; el.innerHTML=`<span class="be">${b[1]}</span><span><small>새 배지 획득</small><b>${esc(b[2])}</b></span>`; document.body.appendChild(el); sfx('combo'); buzz(15); setTimeout(()=>el.classList.add('out'),2300); setTimeout(()=>el.remove(),2700); }
function badgeGrid(){ const have=store.badges||{}; const n=BADGES.filter(b=>have[b[0]]).length;
  return `<div class="label">배지<small>${n} / ${BADGES.length} 획득</small></div><div class="badges anim">`+BADGES.map(b=>`<div class="bd ${have[b[0]]?'on':''}" title="${esc(b[3])}"><span class="be">${b[1]}</span><b>${esc(b[2])}</b><small>${esc(b[3])}</small></div>`).join('')+`</div>`; }
function heatmap(){
  const toK=t=>new Date(t+9*3600000).toISOString().slice(0,10);
  const now=Date.now(), dow=new Date(now+9*3600000).getUTCDay(), mon=(dow+6)%7;
  const start=now-(mon+7*9)*DAY; const examT=new Date(EXAM.date+'T12:00:00+09:00').getTime();
  const end=Math.max(now,examT); const cells=[]; let i=0;
  for(let t=start;t<=end+6*DAY;t+=DAY,i++){ const k=toK(t); if(i%7===0&&t>end) break; const n=(store.log[k]||{n:0}).n; const lv=n===0?0:n<store.goal/2?1:n<store.goal?2:3; const isEx=k===EXAM.date, fut=t>now&&k!==today(); cells.push(`<i class="l${lv}${fut?' f':''}${isEx?' ex':''}${k===today()?' td':''}" title="${k} · ${n}문제"></i>`); }
  const act=Object.values(store.log).filter(x=>x.n>0).length;
  return `<div class="label">학습 잔디<small>${act}일 공부 · 시험일(★)까지</small></div><div class="qcard heat anim"><div class="hm">${cells.join('')}</div><div class="hl-leg"><span>적음</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><span>목표 달성</span><i class="ex"></i><span>시험일</span></div></div>`;
}
function shareCard(d){
  const W=1080,H=1350,c=document.createElement('canvas'); c.width=W; c.height=H; const x=c.getContext('2d');
  const F='Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  const g=x.createLinearGradient(0,0,W,H); g.addColorStop(0,'#1b64da'); g.addColorStop(.5,'#3182f6'); g.addColorStop(1,'#6a5cff'); x.fillStyle=g; x.fillRect(0,0,W,H);
  x.globalAlpha=.35; x.fillStyle='#9fe7ff'; x.beginPath(); x.arc(120,140,260,0,7); x.fill(); x.fillStyle='#b197fc'; x.beginPath(); x.arc(980,1240,300,0,7); x.fill(); x.globalAlpha=1;
  const rr=(X,Y,w,h,r)=>{x.beginPath();x.moveTo(X+r,Y);x.arcTo(X+w,Y,X+w,Y+h,r);x.arcTo(X+w,Y+h,X,Y+h,r);x.arcTo(X,Y+h,X,Y,r);x.arcTo(X,Y,X+w,Y,r);x.closePath();};
  x.fillStyle='rgba(255,255,255,.85)'; x.font=`600 34px ${F}`; x.fillText('2급 승진자격시험 · 예상 기출문제',80,120);
  x.fillStyle='#fff'; x.font=`800 58px ${F}`; x.fillText(d.title+' 결과',80,200);
  rr(60,250,W-120,1000,48); x.fillStyle='#fff'; x.fill();
  x.fillStyle='#191f28'; x.font=`800 230px ${F}`; x.textAlign='center'; x.fillText(String(d.sc),W/2-40,530);
  x.font=`700 64px ${F}`; x.fillStyle='#8b95a1'; x.fillText(d.mock?'점':'점(정답률)',W/2+(d.sc>=100?190:150),530); x.textAlign='left';
  x.textAlign='center'; x.font=`600 38px ${F}`; x.fillStyle='#4e5968'; x.fillText(`${d.n}문항 중 ${d.ok}문항 정답 · 등급 ${d.grade}`,W/2,610); x.textAlign='left';
  if(d.mock){ const ok=d.sc>=d.pass; x.save(); x.translate(860,330); x.rotate(-.22); x.strokeStyle=ok?'#0ca678':'#f04452'; x.lineWidth=10; x.beginPath(); x.arc(0,0,105,0,7); x.stroke(); x.lineWidth=4; x.beginPath(); x.arc(0,0,88,0,7); x.stroke(); x.fillStyle=ok?'#0ca678':'#f04452'; x.font=`900 50px ${F}`; x.textAlign='center'; x.fillText(ok?'합격권':'재도전',0,18); x.restore(); }
  let y=700; x.font=`700 34px ${F}`;
  d.by.slice(0,5).forEach(b=>{ const r=b.o/b.n; x.fillStyle='#191f28'; x.font=`700 34px ${F}`; x.fillText(b.name,120,y); x.textAlign='right'; x.fillStyle='#4e5968'; x.font=`600 32px ${F}`; x.fillText(d.mock?`${b.o*2}/${b.n*2}점`:`${b.o}/${b.n}`,W-120,y); x.textAlign='left';
    rr(120,y+20,W-240,22,11); x.fillStyle='#f2f4f6'; x.fill(); if(r>0){ rr(120,y+20,Math.max(22,(W-240)*r),22,11); x.fillStyle=r<.6?'#f04452':'#3182f6'; x.fill(); } y+=104; });
  x.fillStyle='#8b95a1'; x.font=`500 30px ${F}`; x.fillText(`${today().replace(/-/g,'.')} · 시험까지 ${dday()}`,120,1205);
  const url=c.toDataURL('image/png');
  sheet(`<div class="upd"><b>결과 카드</b><p>이미지를 길게 눌러 사진에 저장하거나 공유하세요.</p></div><img class="rc-img" src="${url}" alt="결과 카드"><button class="cta" id="rcShare">공유하기</button>`,()=>{
    $('#rcShare').onclick=()=>{ c.toBlob(bl=>{ try{ const f=new File([bl],'2급시험_결과.png',{type:'image/png'}); if(navigator.canShare&&navigator.canShare({files:[f]})){ navigator.share({files:[f],title:'2급 진급시험 결과'}).catch(()=>{}); return; } }catch(e){} const a=document.createElement('a'); a.href=url; a.download='2급시험_결과.png'; document.body.appendChild(a); a.click(); a.remove(); toast('이미지를 저장했어요'); },'image/png'); };
  });
}
checkBadges(true);


/* ── v13: 토스·카카오톡 디테일 ── */
var noteSub='';
function kTime(){ const d=new Date(), h=d.getHours(); return (h<12?'오전 ':'오후 ')+((h%12)||12)+':'+String(d.getMinutes()).padStart(2,'0'); }
function quitSheet(mock){
  sheet(`<div class="upd"><span class="upd-ic">${ico(mock?'exam':'home')}</span><b>${mock?'시험을 그만둘까요?':'그만 풀까요?'}</b><p>${mock?'지금 나가면 채점 없이 종료돼요.':'푼 기록은 저장돼요. 홈에서 이어서 풀 수 있어요.'}</p></div><div class="btn2"><button class="cta ghost" id="qsStay">계속 풀기</button><button class="cta ${mock?'danger':''}" id="qsGo">${mock?'종료하기':'나가기'}</button></div>`,()=>{
    $('#qsStay').onclick=closeOv;
    $('#qsGo').onclick=()=>{ closeOv(); clearInterval(tick); if(mock){store.sess=null;save();} view='home'; render(); top(); };
  });
}
function tabBadge(v){
  let n=0;
  if(v==='home') n=dueIds().length+((store.daily||{})[dayKey9()]?0:1);
  if(v==='report'){ const seen=store.badgeSeen||{}; n=Object.keys(store.badges||{}).filter(k=>!seen[k]).length; }
  return n?`<em class="tb">${n>99?'99+':n}</em>`:'';
}
function noteChips(list){
  const SH={F:'자배법',E:'손해사정',D:'보험계약법',Y:'공제약관',G:'상식'};
  const cnt=id=>list.filter(q=>subjOfSec(q.sec).id===id).length;
  return `<div class="folders"><button data-ns="" aria-pressed="${!noteSub}">전체 <i>${list.length}</i></button>`+SUBJECTS.map(sub=>`<button data-ns="${sub.id}" aria-pressed="${noteSub===sub.id}">${SH[sub.id]||esc(sub.name)} <i>${cnt(sub.id)}</i></button>`).join('')+`</div>`;
}
/* 스크롤하면 작은 제목이 붙는 상단 바 */
var appbar=document.createElement('div'); appbar.className='appbar'; appbar.setAttribute('aria-hidden','true'); document.body.appendChild(appbar);
function updBar(){ const t=app.querySelector('h1.title'); const on=!!t&&!app.querySelector('.qbar')&&window.scrollY>t.offsetTop+t.offsetHeight-10; if(on){ const tx=t.textContent.replace(/\s+/g,' ').trim(); if(appbar.textContent!==tx) appbar.textContent=tx; } appbar.classList.toggle('on',on); }
window.addEventListener('scroll',updBar,{passive:true});
new MutationObserver(()=>{ appbar.classList.remove('on'); requestAnimationFrame(updBar); }).observe(app,{childList:true});
/* 탭 배지 새로 반영 */
if(!tabbar.hidden){ const cur=tabbar.querySelector('[aria-current="true"]'); if(cur) showTabs(cur.dataset.tab); }


/* ── v14: 합격 준비도·합격 플랜·암기 카드 ── */
function isMastered(id){ const a=store.ans[id]; return !!(a&&a.ok&&!store.srs[id]); }
function readiness(){ let w=0,t=0; const per=SUBJECTS.map(sub=>{ const qs=QUESTIONS.filter(q=>sub.secs.includes(q.sec)); const m=qs.filter(q=>isMastered(q.id)).length; const r=qs.length?m/qs.length:0; w+=r*sub.n; t+=sub.n; return {sub,m,n:qs.length,r}; }); return {pct:Math.round(w/t*100),per}; }
function planInfo(){ const left=QUESTIONS.filter(q=>!isMastered(q.id)).length; const d=daysLeft(); const days=Math.max(1,d-7); return {left,d,days,need:Math.ceil(left/days)}; }
function planCard(){
  const rd=readiness(), p=planInfo(); if(p.d<0) return '';
  const msg=p.left===0?'모든 문제를 숙달했어요! 이제 모의고사로 실전 감각만 유지해요.':p.d<=7?`시험 주간이에요. 오답·별표 위주로 하루 ${Math.min(p.left,40)}문제씩 정리해요.`:`하루 <b>${p.need}문제</b>씩 풀면 시험 1주 전까지 전 범위를 숙달할 수 있어요.`;
  return `<div class="label">합격 플랜<small>숙달 = 맞히고 복습까지 끝낸 문제</small></div><section class="plan anim">
    <div class="pl-top"><div class="pl-ring" style="--p:${rd.pct}"><b>${rd.pct}<small>%</small></b></div><div class="pl-tx"><span>합격 준비도</span><p>${msg}</p></div></div>
    <div class="pl-bars">${rd.per.map(x=>`<div class="pl-b"><span>${({F:'자배법',E:'손해사정',D:'보험계약법',Y:'공제약관',G:'상식'})[x.sub.id]}</span><i><em style="width:${Math.round(x.r*100)}%"></em></i><b>${x.m}/${x.n}</b></div>`).join('')}</div>
    ${p.left&&p.d>7&&store.goal!==Math.min(50,Math.max(10,p.need))?`<button class="cta ghost sm" data-act="setgoal">하루 목표를 ${Math.min(50,Math.max(10,p.need))}문제로 맞추기</button>`:''}
  </section>`;
}
function flashEntry(){ const nk=QUESTIONS.filter(q=>(q.tags||[]).includes('핵심숫자')).length, nw=stats().wrongIds.length;
  return `<div class="list anim" style="margin-bottom:14px"><button class="row" data-act="flash"><span class="ic y" style="font-size:22px">🃏</span><span class="tx"><span class="nm">암기 카드</span><span class="meta">핵심 숫자 ${nk}장 · 오답 ${nw}장 · 뒤집어서 외우기</span></span>${ico('chev','chev')}</button></div>`; }
var fc=null;
function flashStart(kind){
  const ids=kind==='wrong'?stats().wrongIds:kind==='star'?starIds():QUESTIONS.filter(q=>(q.tags||[]).includes('핵심숫자')).map(q=>q.id);
  if(!ids.length){ toast(kind==='wrong'?'틀린 문제가 없어요':'카드가 없어요'); return; }
  fc={ids:shuffle(ids),i:0,flip:false,known:0,again:0}; flashShow();
}
function flashPick(){
  sheet(`<div class="upd"><span class="upd-ic" style="font-size:26px">🃏</span><b>암기 카드</b><p>앞면은 문제, 뒤집으면 정답과 해설이 나와요. 모르는 카드는 뒤로 다시 와요.</p></div>
   <div class="list"><button class="row" data-fk="key"><span class="tx"><span class="nm">핵심 숫자·기간</span><span class="meta">${QUESTIONS.filter(q=>(q.tags||[]).includes('핵심숫자')).length}장 · 한도·기간·비율</span></span>${ico('chev','chev')}</button><button class="row" data-fk="wrong"><span class="tx"><span class="nm">내 오답</span><span class="meta">${stats().wrongIds.length}장</span></span>${ico('chev','chev')}</button><button class="row" data-fk="star"><span class="tx"><span class="nm">별표</span><span class="meta">${starIds().length}장</span></span>${ico('chev','chev')}</button></div>`,()=>{
    ov.querySelectorAll('[data-fk]').forEach(b=>b.onclick=()=>{ closeOv(); setTimeout(()=>flashStart(b.dataset.fk),260); });
  });
}
function flashShow(){
  if(!fc) return; const done=fc.i>=fc.ids.length;
  ov.hidden=false; ov.className='ov fcv'; ov.onclick=null;
  if(done){ ov.innerHTML=`<div class="fc-wrap"><div class="fc-done"><span>🎉</span><b>카드 ${fc.ids.length}장 완료!</b><p>바로 안 ${fc.known}장 · 다시 본 카드 ${fc.again}번</p><button class="cta" id="fcEnd">닫기</button></div></div>`; $('#fcEnd').onclick=()=>{fc=null;closeOv();}; return; }
  const q=byId[fc.ids[fc.i]];
  ov.innerHTML=`<div class="fc-wrap"><div class="fc-bar"><button class="x-btn" id="fcX" aria-label="닫기">✕</button><div class="track"><i style="width:${fc.i/fc.ids.length*100}%"></i></div><span class="count">${fc.i+1}/${fc.ids.length}</span></div>
   <button class="fc ${fc.flip?'on':''}" id="fcCard"><span class="fc-in"><span class="fc-f"><small>${esc(subjOfSec(q.sec).name)}</small><b>${esc(q.q)}</b>${q.box?`<span class="fc-box">${q.box.map(esc).join('<br>')}</span>`:''}<em>탭해서 뒤집기</em></span><span class="fc-b"><small>정답</small><b>${esc(q.opts[q.ans])}</b><span class="fc-exp">${hl(q.exp)}</span></span></span></button>
   <div class="fc-act">${fc.flip?`<button class="cta ghost" id="fcNo">아직 몰라요</button><button class="cta" id="fcOk">알아요</button>`:`<button class="cta" id="fcFlip">정답 보기</button>`}</div></div>`;
  const flip=()=>{fc.flip=!fc.flip;flashShow();};
  $('#fcCard').onclick=flip; const fl=$('#fcFlip'); if(fl) fl.onclick=flip;
  $('#fcX').onclick=()=>{fc=null;closeOv();};
  const ok=$('#fcOk'), no=$('#fcNo');
  if(ok) ok.onclick=()=>{fc.known++;fc.i++;fc.flip=false;buzz(10);flashShow();};
  if(no) no.onclick=()=>{fc.again++;fc.ids.push(fc.ids[fc.i]);fc.i++;fc.flip=false;flashShow();};
}


/* v16: 아이폰 홈 화면 아이콘 교체 안내 (한 번만) */
function iconNotice(){
  sheet(`<div class="app-badge"><img src="icon-192.png" alt=""><div><b>새 아이콘이 나왔어요</b><span>아이폰은 홈 화면 아이콘을 자동으로 바꿔주지 않아서, 한 번만 다시 추가해 주세요.</span></div></div>
    <ol class="steps"><li><span>1</span><p>먼저 아래 <b>백업 코드 복사</b> → 카톡 나에게 보내기에 붙여 두기 <b>(꼭!)</b> 아이폰은 앱을 지우면 기록도 같이 지워져요</p></li><li><span>2</span><p>지금 아이콘을 길게 눌러 <b>앱 제거</b></p></li><li><span>3</span><p>사파리에서 사이트를 열고 <b>공유 → 홈 화면에 추가</b></p></li><li><span>4</span><p>새 아이콘으로 열고 <b>설정 → 기록 복원하기</b>에 코드 붙여넣기</p></li></ol>
    <button class="cta" id="icBk">백업 코드 복사</button><button class="cta ghost" id="icGd">3단계 그림으로 보기</button><button class="linkbtn center" id="icLater">다음에 할게요</button>`,()=>{
      $('#icBk').onclick=()=>{ const code='P2Q1.'+enc({v:1,t:Date.now(),store}); copyText(code).then(ok=>toast(ok?'백업 코드를 복사했어요. 카톡 나에게 보내기에 붙여 두세요':'설정 → 기록 백업하기에서 복사해 주세요')); };
      $('#icGd').onclick=()=>{ closeOv(); setTimeout(()=>installGuide('ios'),280); };
      $('#icLater').onclick=()=>{ closeOv(); setTimeout(maybeUpdate,300); };
    });
}

/* ── v17: 홈 화면 추가 그림 안내 ── */
var gd={os:'ios',i:0};
function pmBar(hl){ return `<div class="pm-bar"><span class="pm-b">‹</span><span class="pm-url">siskimmk-cpu.github.io</span><span class="pm-b ${hl==='more'?'hl':''}">⋯</span></div>`; }
function pmPage(){ return `<div class="pm-page"><i class="w60"></i><i class="w80 big"></i><i class="card"></i><i class="w70"></i><i class="w50"></i></div>`; }
function pmIcon(){ return `<img class="pm-ic" src="icon-192.png" alt="" onerror="this.style.visibility='hidden'">`; }
var GUIDE={
 ios:[
  {t:'사파리로 열어요',d:'카톡에서 링크를 열었다면 화면 아래쪽(또는 위쪽) <b>⋮</b> 메뉴 → <b>다른 브라우저로 열기</b>(또는 <b>Safari로 열기</b>)를 골라요. 카톡 안 화면에서는 홈 화면에 추가가 안 돼요.',
   m:()=>`<div class="pm-scr">${pmPage()}<div class="pm-menu up"><span>새로고침</span><span>링크 복사</span><span class="hl">다른 브라우저로 열기</span></div><div class="pm-kbar"><span>✕</span><span class="pm-kt">2급 합격</span><span class="hl-dot">⋮</span></div></div>`},
  {t:'아래 ⋯ 버튼을 눌러요',d:'사파리 화면 맨 아래 주소창 오른쪽의 <b>⋯</b>(더보기)를 눌러요.<br><small>예전 iOS는 아래 가운데 <b>공유 버튼</b>(네모에 화살표)을 바로 누르면 돼요 → 4단계로</small>',
   m:()=>`<div class="pm-scr">${pmPage()}${pmBar('more')}</div>`},
  {t:'공유를 눌러요',d:'올라온 메뉴에서 <b>공유</b>를 눌러요.',
   m:()=>`<div class="pm-scr">${pmPage()}<div class="pm-menu"><span class="hl"><em>⬆︎</em>공유</span><span><em>☆</em>즐겨찾기에 추가</span><span><em>⌕</em>페이지에서 찾기</span><span><em>⧉</em>새 탭</span></div>${pmBar()}</div>`},
  {t:'더 보기를 눌러요',d:'공유 창이 뜨면 아래쪽 목록에서 <b>더 보기</b>를 눌러 메뉴를 펼쳐요.',
   m:()=>`<div class="pm-scr dim">${pmPage()}<div class="pm-sheet"><div class="pm-sh-h">${pmIcon()}<span><b>2급 합격</b><small>siskimmk-cpu.github.io</small></span></div><div class="pm-apps"><i class="a1"></i><i class="a2"></i><i class="a3"></i><i class="a4"></i></div><div class="pm-list"><span>복사</span><span>읽기 목록에 추가</span><span class="hl">더 보기 <em>⌄</em></span></div></div></div>`},
  {t:'홈 화면에 추가를 눌러요',d:'펼쳐진 목록을 조금 내려서 <b>홈 화면에 추가</b>를 눌러요.',
   m:()=>`<div class="pm-scr dim">${pmPage()}<div class="pm-sheet tall"><div class="pm-list"><span>복사</span><span>읽기 목록에 추가</span><span>즐겨찾기에 추가</span><span>페이지에서 찾기</span><span class="hl">홈 화면에 추가 <em>⊞</em></span><span>프린트</span></div></div></div>`},
  {t:'오른쪽 위 추가를 눌러요',d:'이름이 <b>2급 합격</b>인지 보고, <b>웹 앱으로 열기</b>가 켜져 있는 상태로 오른쪽 위 <b>추가</b>를 눌러요.',
   m:()=>`<div class="pm-scr"><div class="pm-add"><div class="pm-nav"><span>취소</span><b>홈 화면에 추가</b><span class="hl">추가</span></div><div class="pm-row">${pmIcon()}<span><b>2급 합격</b><small>https://siskimmk-cpu.github.io/…</small></span></div><div class="pm-tg"><span>웹 앱으로 열기</span><i class="on"></i></div></div></div>`},
  {t:'끝! 홈 화면에서 열어요',d:'홈 화면에 생긴 <b>2급 합격</b> 아이콘을 누르면 주소창 없이 앱처럼 열려요.',
   m:()=>`<div class="pm-scr home"><div class="pm-grid"><i></i><i></i><i></i><i></i><i></i><span class="me">${pmIcon()}<small>2급 합격</small></span><i></i><i></i></div></div>`}
 ],
 android:[
  {t:'크롬으로 열어요',d:'카톡에서 열었다면 화면 위쪽(또는 아래쪽) <b>⋮</b> 메뉴 → <b>다른 브라우저로 열기</b>를 눌러 <b>Chrome</b>으로 열어요.',
   m:()=>`<div class="pm-scr"><div class="pm-cbar"><span class="pm-b">✕</span><span class="pm-url" style="background:none;text-align:center">2급 합격</span><span class="pm-b hl">⋮</span></div>${pmPage()}<div class="pm-menu right"><span>새로고침</span><span>링크 복사</span><span class="hl">다른 브라우저로 열기</span></div></div>`},
  {t:'오른쪽 위 ⋮ 을 눌러요',d:'크롬 주소창 오른쪽 끝의 <b>⋮</b>(점 세 개)를 눌러요.',
   m:()=>`<div class="pm-scr"><div class="pm-cbar"><span class="pm-url">siskimmk-cpu.github.io</span><span class="pm-b hl">⋮</span></div>${pmPage()}</div>`},
  {t:'홈 화면에 추가를 눌러요',d:'메뉴에서 <b>홈 화면에 추가</b>(또는 <b>앱 설치</b>)를 눌러요.',
   m:()=>`<div class="pm-scr"><div class="pm-cbar"><span class="pm-url">siskimmk-cpu.github.io</span><span class="pm-b">⋮</span></div>${pmPage()}<div class="pm-menu right"><span>새 탭</span><span>방문 기록</span><span>다운로드</span><span class="hl">홈 화면에 추가</span><span>설정</span></div></div>`},
  {t:'설치를 눌러요',d:'창이 뜨면 <b>설치</b>(또는 <b>추가</b>)를 눌러요.',
   m:()=>`<div class="pm-scr dim">${pmPage()}<div class="pm-dlg">${pmIcon()}<b>앱을 설치할까요?</b><small>2급 합격</small><div><span>취소</span><span class="hl">설치</span></div></div></div>`},
  {t:'끝! 홈 화면에서 열어요',d:'홈 화면이나 앱 목록의 <b>2급 합격</b> 아이콘으로 바로 열려요.',
   m:()=>`<div class="pm-scr home"><div class="pm-grid"><i></i><i></i><i></i><i></i><i></i><span class="me">${pmIcon()}<small>2급 합격</small></span><i></i><i></i></div></div>`}
 ]
};
function installGuide(os){ gd={os:os||(/android/i.test(navigator.userAgent)?'android':'ios'),i:0}; guideShow(); }
function guideShow(){
  const L=GUIDE[gd.os], s=L[gd.i], last=gd.i===L.length-1;
  ov.hidden=false; ov.className='ov fcv gdv'; ov.onclick=null;
  ov.innerHTML=`<div class="fc-wrap gd-wrap"><div class="gd-top"><button class="x-btn" id="gdX" aria-label="닫기">✕</button><div class="seg gd-os"><button data-os="ios" aria-pressed="${gd.os==='ios'}">아이폰</button><button data-os="android" aria-pressed="${gd.os==='android'}">갤럭시</button></div></div>
    <div class="gd-main"><div class="pm">${s.m()}<span class="tap"></span></div>
    <div class="gd-tx"><span class="gd-no">${gd.i+1} / ${L.length}</span><h2>${s.t}</h2><p>${s.d}</p></div></div>
    <div class="gd-foot"><div class="dots">${L.map((_,k)=>`<i class="${k===gd.i?'on':''}"></i>`).join('')}</div><div class="fc-act"><button class="cta ghost" id="gdPrev" ${gd.i?'':'disabled'}>이전</button><button class="cta" id="gdNext">${last?'다 했어요':'다음'}</button></div></div></div>`;
  $('#gdX').onclick=closeOv;
  ov.querySelectorAll('[data-os]').forEach(b=>b.onclick=()=>{gd={os:b.dataset.os,i:0};guideShow();});
  $('#gdPrev').onclick=()=>{ if(gd.i>0){gd.i--;guideShow();} };
  $('#gdNext').onclick=()=>{ if(last){ closeOv(); toast('홈 화면의 "2급 합격" 아이콘으로 열어 보세요'); } else { gd.i++; guideShow(); } };
  const w=ov.querySelector('.gd-wrap'); let x0=null; w.ontouchstart=e=>{x0=e.touches[0].clientX;}; w.ontouchend=e=>{ if(x0==null)return; const dx=e.changedTouches[0].clientX-x0; x0=null; if(dx<-60&&!last){gd.i++;guideShow();} else if(dx>60&&gd.i>0){gd.i--;guideShow();} };
}

/* ── v18: PC 키보드 단축키 ── */
var kbdEl=null;
function kbdHint(on){ const pc=matchMedia('(min-width:1024px) and (hover:hover)').matches; if(!pc){ if(kbdEl){kbdEl.remove();kbdEl=null;} return; }
  if(on&&!kbdEl){ kbdEl=document.createElement('div'); kbdEl.className='kbd-hint'; kbdEl.innerHTML='<span><kbd>1</kbd>~<kbd>5</kbd> 보기 선택</span><span><kbd>Enter</kbd> 다음</span><span><kbd>←</kbd><kbd>→</kbd> 이동</span><span><kbd>S</kbd> 별표</span><span><kbd>Esc</kbd> 나가기</span>'; document.body.appendChild(kbdEl); }
  else if(!on&&kbdEl){ kbdEl.remove(); kbdEl=null; } }
new MutationObserver(()=>kbdHint(view==='quiz'&&!!store.sess&&!store.sess.done)).observe(app,{childList:true});
document.addEventListener('keydown',e=>{
  if(e.metaKey||e.ctrlKey||e.altKey) return;
  const tg=e.target; if(tg&&(tg.tagName==='INPUT'||tg.tagName==='TEXTAREA'||tg.isContentEditable)) return;
  const k=e.key;
  if(!ov.hidden){
    if(k==='Escape'){ e.preventDefault(); const x=ov.querySelector('#fcX,#gdX'); if(x) x.click(); else closeOv(); return; }
    if(ov.classList.contains('fcv')){
      const pick=s=>{const b=ov.querySelector(s); if(b&&!b.disabled){e.preventDefault(); b.click(); return true;} return false;};
      if(k===' '||k==='Enter'){ if(pick('#fcFlip')||pick('#gdNext')) return; }
      if(k==='ArrowRight'){ if(pick('#fcOk')||pick('#gdNext')) return; }
      if(k==='ArrowLeft'){ if(pick('#fcNo')||pick('#gdPrev')) return; }
    }
    return;
  }
  if(view!=='quiz'||!store.sess||store.sess.done) return;
  const opts=[...document.querySelectorAll('#qc .opt')];
  if(/^[1-5]$/.test(k)){ const b=opts[+k-1]; if(b&&!b.disabled){ e.preventDefault(); b.click(); } return; }
  const nx=$('#next'), pv=$('#prev');
  if((k==='Enter'||k==='ArrowRight')&&nx&&!nx.disabled){ e.preventDefault(); nx.click(); return; }
  if(k==='ArrowLeft'&&pv&&!pv.disabled){ e.preventDefault(); pv.click(); return; }
  if(k==='s'||k==='S'){ const st=document.querySelector('#qc [data-star]'); if(st){ e.preventDefault(); st.click(); } return; }
  if(k==='Escape'){ e.preventDefault(); quitSheet(store.sess.mode==='mock'); }
});

/* ── v19: 매일 오전 9시 새 시험지 · 문제 검색 ── */
function dayKey9(){ return new Date().toISOString().slice(0,10); } /* 한국시간 오전 9시 = UTC 0시 */
function msToSwitch(){ const n=new Date(); const t=Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate()+1); return t-n.getTime(); }
function rng(seed){ let h=1779033703^seed.length; for(let i=0;i<seed.length;i++){h=Math.imul(h^seed.charCodeAt(i),3432918353);h=h<<13|h>>>19;} let a=h>>>0; return ()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}; }
function seeded(arr,r){ const a=arr.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function dailyPaper(k){
  const key=dayKey9();
  if(!store.dp||store.dp.key!==key){
    const P=[[],[]];
    SUBJECTS.forEach(sub=>{
      const r=rng(key+'|'+sub.id); const qs=QUESTIONS.filter(q=>sub.secs.includes(q.sec));
      const fresh=q=>store.ans[q.id]?(store.ans[q.id].ok?2:1):0; /* 안 푼 문제 → 틀린 문제 → 맞힌 문제 순으로 먼저 */
      const ord=list=>seeded(list,r).sort((a,b)=>fresh(a)-fresh(b));
      const hard=ord(qs.filter(isHard)), norm=ord(qs.filter(q=>!isHard(q)));
      const nh=Math.min(Math.ceil(sub.n*0.4),Math.floor(hard.length/2));
      for(let p=0;p<2;p++){ const pick=hard.slice(p*nh,(p+1)*nh).concat(norm.slice(p*(sub.n-nh),(p+1)*(sub.n-nh))); P[p].push(...seeded(pick,r).map(q=>q.id)); }
    });
    store.dp={key,p:P}; if(store.best){ delete store.best.p1; delete store.best.p2; } save();
  }
  return store.dp.p[k].slice();
}
function paperInfo(){ const ms=msToSwitch(), h=Math.floor(ms/3600000), m=Math.floor(ms%3600000/60000);
  return `<div class="pinfo anim"><span class="pi-ic">🗓️</span><div><b>제1회·제2회는 매일 오전 9시에 새 시험지로 바뀌어요</b><span>안 푼 문제부터 먼저 나와요 · 다음 교체까지 ${h}시간 ${m}분</span></div></div>`; }
/* 문제 검색 */
function searchBox(){ return `<div class="qsearch anim"><span class="qs-ic">⌕</span><input id="qsIn" type="search" placeholder="문제 검색 (예: 가불금, 고지의무, 제652조)" autocomplete="off" enterkeyhint="search"></div><div id="qsRes"></div>`; }
const SNORM=s=>String(s).toLowerCase().replace(/\s+/g,'');
function searchRun(v){
  const box=$('#qsRes'); if(!box) return; const w=SNORM(v);
  if(w.length<2){ box.innerHTML=''; return; }
  const hits=QUESTIONS.filter(q=>SNORM(q.q+' '+q.opts.join(' ')+' '+q.exp+' '+(q.ref||'')+' '+(q.tags||[]).join(' ')).includes(w));
  box.innerHTML=hits.length?`<div class="label">검색 결과<small>${hits.length}문제</small></div><div class="list">`+hits.slice(0,30).map(q=>`<button class="row" data-qs="${q.id}"><span class="tx"><span class="meta">${esc(subjOfSec(q.sec).name)}${isHard(q)?' · 고난도':''}${store.ans[q.id]?(store.ans[q.id].ok?' · 맞힘':' · 틀림'):''}</span><span class="nm qs-q">${esc(q.q)}</span></span>${ico('chev','chev')}</button>`).join('')+`</div><button class="cta" id="qsAll" style="margin-top:12px">검색된 ${hits.length}문제 풀기</button>`:`<div class="empty">"${esc(v)}" 관련 문제가 없어요.</div>`;
  box.querySelectorAll('[data-qs]').forEach(b=>b.onclick=()=>start([b.dataset.qs],'검색 문제','practice',{mix:true}));
  const all=$('#qsAll'); if(all) all.onclick=()=>start(shuffle(hits.map(q=>q.id)),`검색: ${v}`,'practice',{mix:true});
}
document.addEventListener('input',e=>{ if(e.target&&e.target.id==='qsIn') searchRun(e.target.value.trim()); });

/* v19: 결과 화면 틀린 문제만 보기 */
document.addEventListener("click",e=>{ const b=e.target.closest&&e.target.closest("[data-rf]"); if(!b) return; const l=document.getElementById("rlist"); if(!l) return; l.classList.toggle("wonly",b.dataset.rf==="wrong"); b.parentNode.querySelectorAll("[data-rf]").forEach(x=>x.setAttribute("aria-pressed",x===b)); });

/* ── v21: PC 대시보드 레이아웃 ── */
var DSK=matchMedia('(min-width:1200px)');
var _render0=render;
function dskKey(el){
  const c=el.classList, q=s=>el.querySelector(s);
  if(el.matches('header.top-h')) return 'head';
  const b=el.matches('.dblk')?el:null; const f=b?b.querySelector(':scope > :not(.label)'):el;
  if(!f) return 'x';
  const m=(sel,k)=>f.matches(sel)?k:null;
  return m('.hero','hero')||m('.plan','plan')||m('.dq','dq')||m('.fresh','fresh')||m('.hotc','hot')||m('.daily','daily')||m('.hscroll','quick')||m('.qsearch','search')||m('.pinfo','pinfo')||m('.papers','papers')||m('.chartcard','chart')||m('.predbox','pred')||m('.bars','bars')||m('.heat','heat')||m('.badges','badges')||m('.week','week')||m('.seg','goal')||m('.stat3','stat')||m('.foot','foot')||(f.matches('.list')?((b&&b.querySelector('.label')?.innerText||'').includes('취약')?'weak':(b&&b.querySelector('.label')?.innerText||'').includes('모의고사')?'mock':'list'):'x');
}
function dskLayout(){
  const v=document.body.dataset.view;
  app.classList.remove('dsk');
  if(!DSK.matches||!['home','study','exam','report'].includes(v)) return;
  const kids=[...app.children].filter(e=>!e.matches('.aurora'));
  let cur=null, prevLabel=false; const out=[];
  kids.forEach(e=>{
    if(e.matches('header.top-h')){ out.push(e); cur=null; prevLabel=false; return; }
    if(e.matches('.label')){ cur=document.createElement('div'); cur.className='dblk'; cur.appendChild(e); out.push(cur); prevLabel=true; return; }
    if(prevLabel&&cur){ cur.appendChild(e); prevLabel=false; return; }
    if(cur&&(e.matches('.list')||(e.matches('div')&&!e.className&&!e.children.length))){ cur.appendChild(e); return; }
    cur=document.createElement('div'); cur.className='dblk'; cur.appendChild(e); out.push(cur); prevLabel=false;
  });
  out.forEach(e=>{ app.appendChild(e); e.dataset.k=dskKey(e); });
  app.classList.add('dsk');
}
render=function(){
  const r=_render0.apply(this,arguments);
  try{
    const s=store.sess, v=(s&&s.done)?'result':document.getElementById('qc')?'quiz':view||'home';
    document.body.dataset.view=v; dskLayout();
  }catch(e){}
  return r;
};
try{ DSK.addEventListener('change',()=>render()); }catch(e){}
try{ const s0=store.sess; document.body.dataset.view=(s0&&s0.done)?'result':document.getElementById('qc')?'quiz':view||'home'; dskLayout(); }catch(e){}

/* ── v22: PC 전용 기능 — 문제은행 · 실전 시험지(OMR) · 인쇄 ── */
IC.bank='<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>';
var bankF={sub:'',st:'',lv:'',q:'',sel:null,show:false};
var CIR='①②③④⑤';
function bankRows(){
  const t=(bankF.q||'').trim().toLowerCase();
  return QUESTIONS.filter(q=>{
    const a=store.ans[q.id];
    if(bankF.sub&&subjOfSec(q.sec).id!==bankF.sub) return false;
    if(bankF.lv==='hard'&&!isHard(q)) return false;
    if(bankF.st==='new'&&a) return false;
    if(bankF.st==='wrong'&&!(a&&!a.ok)) return false;
    if(bankF.st==='right'&&!(a&&a.ok)) return false;
    if(bankF.st==='star'&&!isStar(q.id)) return false;
    if(t){ const hay=[q.q,q.case||'',(q.box||[]).join(' '),q.opts.join(' '),q.exp,q.ref||'',(q.tags||[]).join(' ')].join(' ').toLowerCase(); if(!hay.includes(t)) return false; }
    return true;
  });
}
function bankTable(rows){
  if(!rows.length) return `<div class="bk-empty">조건에 맞는 문제가 없어요</div>`;
  return `<table class="bk-t"><thead><tr><th class="c-no">#</th><th class="c-sub">과목</th><th>문제</th><th class="c-lv">난이도</th><th class="c-me">내 기록</th><th class="c-st">★</th></tr></thead><tbody>`+
    rows.map((q,k)=>{const a=store.ans[q.id];return `<tr data-id="${q.id}" class="${bankF.sel===q.id?'on':''}"><td class="c-no">${k+1}</td><td class="c-sub"><span class="bk-sub s-${subjOfSec(q.sec).id}">${esc(sname(subjOfSec(q.sec).name))}</span></td><td class="c-q">${esc(q.q)}${q.case?'<em>사례</em>':''}</td><td class="c-lv">${isHard(q)?'<span class="bk-hd">고난도</span>':'<span class="bk-nm">기본</span>'}</td><td class="c-me">${a?(a.ok?'<span class="mk o">○</span>':'<span class="mk x">×</span>'):'<span class="mk n">–</span>'}</td><td class="c-st">${isStar(q.id)?'<b class="bk-star">★</b>':''}</td></tr>`;}).join('')+`</tbody></table>`;
}
function bankDetail(){
  const q=bankF.sel&&byId[bankF.sel];
  if(!q) return `<div class="bk-ph"><b>문제를 고르세요</b><span>표에서 문제를 누르면 여기에 문제와 해설이 나와요<br><kbd>↑</kbd><kbd>↓</kbd> 이동 · <kbd>Space</kbd> 정답 보기</span></div>`;
  const a=store.ans[q.id];
  return `<div class="bk-dt"><div class="qcard">${card(q,{pick:bankF.show&&a?a.pick:null,reveal:bankF.show,locked:true})}</div><div class="bk-act"><button class="cta ghost" id="bkShow">${bankF.show?'해설 접기':'정답·해설 보기'}</button><button class="cta" id="bkSolve">이 문제 풀기</button></div></div>`;
}
function bankView(){
  showTabs('bank');
  const rows=bankRows();
  const chip=(k,v,l)=>`<button class="chip" data-f="${k}" data-v="${v}" aria-pressed="${bankF[k]===v}">${l}</button>`;
  let h=`<header class="top-h"><div><span class="eyebrow">PC 전용</span><h1 class="title">문제은행</h1></div><span class="hr"><button class="cta ghost sm" id="bkPrint">인쇄·PDF</button></span></header>`;
  h+=`<div class="bk"><div class="bk-l"><div class="bk-bar"><div class="qsearch"><span>⌕</span><input id="bkQ" type="search" placeholder="문제·보기·해설·조문 검색" value="${esc(bankF.q)}" autocomplete="off"></div>
    <div class="bk-f">${chip('sub','','전체')}${SUBJECTS.map(s=>chip('sub',s.id,esc(sname(s.name)))).join('')}<i></i>${chip('st','','모든 기록')}${chip('st','new','안 푼')}${chip('st','wrong','틀린')}${chip('st','right','맞힌')}${chip('st','star','별표')}<i></i>${chip('lv','','모든 난이도')}${chip('lv','hard','고난도')}</div></div>
    <div class="bk-cnt"><b id="bkN">${rows.length}</b>문제<button class="cta sm" id="bkRun" ${rows.length?'':'disabled'}>검색된 문제 풀기</button></div>
    <div class="bk-tw" id="bkT">${bankTable(rows)}</div></div>
    <aside class="bk-r" id="bkD">${bankDetail()}</aside></div>`;
  app.innerHTML=h;
  app.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{bankF[b.dataset.f]=b.dataset.v;bankView();});
  const inp=$('#bkQ'); inp.oninput=()=>{bankF.q=inp.value;const r=bankRows();$('#bkT').innerHTML=bankTable(r);$('#bkN').textContent=r.length;$('#bkRun').disabled=!r.length;bindBankRows();};
  $('#bkRun').onclick=()=>{const ids=bankRows().map(q=>q.id);start(ids,'문제은행 선택','practice',{mix:true});};
  $('#bkPrint').onclick=()=>printQs(bankRows(),'문제은행'+(bankF.q?` · "${bankF.q}"`:''));
  bindBankRows(); bindBankDetail();
}
function bindBankRows(){ app.querySelectorAll('.bk-t tr[data-id]').forEach(tr=>tr.onclick=()=>bankPick(tr.dataset.id)); }
function bankPick(id){ bankF.sel=id; bankF.show=false; app.querySelectorAll('.bk-t tr').forEach(t=>t.classList.toggle('on',t.dataset.id===id)); $('#bkD').innerHTML=bankDetail(); bindBankDetail(); const tr=app.querySelector(`.bk-t tr[data-id="${id}"]`); if(tr) tr.scrollIntoView({block:'nearest'}); }
function bindBankDetail(){ const s=$('#bkShow'); if(s) s.onclick=()=>{bankF.show=!bankF.show;$('#bkD').innerHTML=bankDetail();bindBankDetail();}; const v=$('#bkSolve'); if(v) v.onclick=()=>start([bankF.sel],'문제은행','practice',{}); bindStars($('#bkD')); }
document.addEventListener('keydown',e=>{
  if(view!=='bank'||!DSK.matches||(store.sess&&!store.sess.done&&document.getElementById('qc'))) return;
  if(e.target&&/input|textarea/i.test(e.target.tagName)) return;
  const rows=[...app.querySelectorAll('.bk-t tr[data-id]')].map(t=>t.dataset.id); if(!rows.length) return;
  const i=rows.indexOf(bankF.sel);
  if(e.key==='ArrowDown'){ e.preventDefault(); bankPick(rows[Math.min(rows.length-1,i+1)]); }
  else if(e.key==='ArrowUp'){ e.preventDefault(); bankPick(rows[Math.max(0,i-1)]); }
  else if(e.key===' '&&bankF.sel){ e.preventDefault(); bankF.show=!bankF.show; $('#bkD').innerHTML=bankDetail(); bindBankDetail(); }
});

/* 인쇄·PDF */
function printQs(list,title){
  if(!list.length){ toast('인쇄할 문제가 없어요'); return; }
  let el=document.getElementById('printArea'); if(!el){ el=document.createElement('div'); el.id='printArea'; document.body.appendChild(el); }
  const d=new Date(); const ds=`${d.getFullYear()}. ${d.getMonth()+1}. ${d.getDate()}.`;
  el.innerHTML=`<div class="pa-h"><b>${esc(title)}</b><span>2급 승진자격시험 예상 기출문제 · ${list.length}문제 · ${ds}</span></div>`+list.map((q,k)=>{const a=store.ans[q.id];
    return `<section class="pa-q"><div class="pa-m">${k+1}. <span>${esc(sname(subjOfSec(q.sec).name))}${isHard(q)?' · 고난도':''}${a?(a.ok?' · 맞힘':' · 틀림 (내 답 '+CIR[a.pick]+')'):''}</span></div><p class="pa-t">${esc(q.q)}</p>${q.case?`<div class="pa-c">${esc(q.case)}</div>`:''}${q.box?`<div class="pa-b">${q.box.map(b=>`<p>${esc(b)}</p>`).join('')}</div>`:''}<ol class="pa-o">${q.opts.map((o,i)=>`<li class="${i===q.ans?'a':''}"><b>${CIR[i]}</b> ${esc(o)}</li>`).join('')}</ol><div class="pa-e"><b>정답 ${CIR[q.ans]}</b> ${esc(q.exp)}${q.why?`<ul>${q.why.map((w,i)=>`<li>${CIR[i]} ${esc(w)}</li>`).join('')}</ul>`:''}<small>근거 · ${esc(q.ref||'')}</small></div></section>`;}).join('');
  document.body.classList.add('printing');
  const done=()=>{ document.body.classList.remove('printing'); window.removeEventListener('afterprint',done); };
  window.addEventListener('afterprint',done); setTimeout(()=>window.print(),60); setTimeout(done,60000);
}

/* 실전 시험지(OMR) */
var _quiz0=quiz;
function paperQuiz(){
  const s=store.sess, n=s.ids.length; hideTabs(); dock.hidden=true;
  const filled=()=>s.picks.filter(p=>p!=null).length;
  let h=`<div class="xp"><div class="xp-paper"><div class="xp-head"><div><span class="eyebrow">실전 시험지</span><h1>${esc(s.title)}</h1><p>${n}문항 · ${EXAM.min}분 · 문항당 2점 · 보기를 누르거나 오른쪽 답안지에 표기해요</p></div></div>`;
  let lastSub='';
  s.ids.forEach((id,i)=>{ const q=byId[id], sub=subjOfSec(q.sec); if(sub.id!==lastSub){ lastSub=sub.id; h+=`<div class="xp-sec">${esc(sub.name)}</div>`; } h+=`<article class="qcard xq" id="xq${i}" data-i="${i}">${card(q,{pick:s.picks[i],perm:s.perm[i]},i+1)}</article>`; });
  h+=`<div class="xp-end">마지막 문항이에요 · 답안지를 확인하고 제출하세요</div></div>`;
  h+=`<aside class="xp-side"><div class="xp-timer"><span>남은 시간</span><b id="cnt">${fmtLeft()}</b><div class="xp-prog"><i id="xpBar" style="width:${filled()/n*100}%"></i></div><small id="xpFill">${filled()} / ${n} 표기</small></div><div class="xp-omr">`;
  lastSub='';
  s.ids.forEach((id,i)=>{ const q=byId[id], sub=subjOfSec(q.sec); if(sub.id!==lastSub){ lastSub=sub.id; h+=`<div class="omr-h">${esc(sname(sub.name))}</div>`; } const pk=s.picks[i]; h+=`<div class="omr-r" data-r="${i}"><button class="omr-n" data-go="${i}">${i+1}</button>${s.perm[i].map((oi,pos)=>`<button class="bub ${pk===oi?'on':''}" data-b="${i}:${oi}" aria-label="${i+1}번 ${pos+1}">${pos+1}</button>`).join('')}</div>`; });
  h+=`</div><div class="xp-act"><button class="cta ghost" id="xpQuit">나가기</button><button class="cta" id="xpSub">제출하기</button></div></aside></div>`;
  app.innerHTML=h; bindStars(app);
  const mark=(i,oi)=>{ s.picks[i]=oi; s._warn=0; save();
    const art=$('#xq'+i); if(art) art.querySelectorAll('.opt').forEach(b=>b.classList.toggle('sel',+b.dataset.pick===oi));
    const row=app.querySelector(`.omr-r[data-r="${i}"]`); if(row) row.querySelectorAll('.bub').forEach(b=>b.classList.toggle('on',+b.dataset.b.split(':')[1]===oi));
    $('#xpFill').textContent=`${filled()} / ${n} 표기`; $('#xpBar').style.width=filled()/n*100+'%'; $('#xpSub').textContent='제출하기'; };
  app.querySelectorAll('.xq .opt').forEach(b=>b.onclick=()=>{ const i=+b.closest('.xq').dataset.i; mark(i,+b.dataset.pick); });
  app.querySelectorAll('.bub').forEach(b=>b.onclick=()=>{ const [i,oi]=b.dataset.b.split(':').map(Number); mark(i,oi); const art=$('#xq'+i); if(art) art.scrollIntoView({block:'center',behavior:'smooth'}); });
  app.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{ const art=$('#xq'+b.dataset.go); if(art) art.scrollIntoView({block:'start',behavior:'smooth'}); });
  $('#xpQuit').onclick=()=>quitSheet(true);
  $('#xpSub').onclick=()=>{ const blank=n-filled(); if(blank&&!s._warn){ s._warn=1; $('#xpSub').textContent=`빈 답 ${blank}개 · 그래도 제출`; const k=s.picks.findIndex(p=>p==null); const art=$('#xq'+k); if(art) art.scrollIntoView({block:'center',behavior:'smooth'}); return; } finish(); };
  const io=new IntersectionObserver(es=>es.forEach(en=>{ if(en.isIntersecting){ const i=+en.target.dataset.i; s.i=i; app.querySelectorAll('.omr-r').forEach(r=>r.classList.toggle('cur',+r.dataset.r===i)); } }),{rootMargin:'-45% 0px -50% 0px'});
  app.querySelectorAll('.xq').forEach(a=>io.observe(a));
  clearInterval(tick); tick=setInterval(()=>{ const c=$('#cnt'); if(!store.sess||store.sess.done){clearInterval(tick);return;} if(s.end-Date.now()<=0){finish();return;} if(c){c.textContent=fmtLeft(); c.classList.toggle('low',s.end-Date.now()<600000);} const left=s.end-Date.now(); if(left<600000&&!s._w10){s._w10=1;save();toast('⏰ 10분 남았어요. 빈 답부터 채우세요');} if(left<60000&&!s._w1){s._w1=1;save();toast('⏰ 1분 남았어요!');} },1000);
  if(s.i){ const art=$('#xq'+s.i); if(art) setTimeout(()=>art.scrollIntoView({block:'start'}),30); }
}
quiz=function(){ const s=store.sess; if(s&&s.mode==='mock'&&!s.done&&DSK.matches){ document.body.dataset.view='paper'; return paperQuiz(); } return _quiz0.apply(this,arguments); };

/* 메뉴·화면 연결 */
var _showTabs0=showTabs;
showTabs=function(cur){ _showTabs0(cur); if(!DSK.matches) return; const t=tabbar.querySelector('.tabs'); if(!t) return; const b=document.createElement('button'); b.dataset.tab='bank'; b.setAttribute('aria-current',cur==='bank'); b.innerHTML=`${ico('bank')}<span>문제은행</span><em class="pc-only">PC</em>`; b.onclick=()=>{ if(view!=='bank') go('bank'); }; const ref=t.querySelector('[data-tab="exam"]'); t.insertBefore(b,ref); };
document.addEventListener('keydown',e=>{ if(document.body.dataset.view!=='paper'||!ov.hidden) return; const tg=e.target; if(tg&&/input|textarea/i.test(tg.tagName)) return; if(e.key==='Escape'){ e.preventDefault(); e.stopImmediatePropagation(); quitSheet(true); return; } if(/^[1-5]$|^Enter$|^Arrow(Left|Right)$|^[sS]$/.test(e.key)) e.stopImmediatePropagation(); },true);
var _render1=render;
render=function(){
  const s=store.sess;
  if(view==='bank'&&!(s&&s.done)&&!(s&&!s.done&&s.mode==='mock')){ if(DSK.matches){ app.ontouchstart=app.ontouchend=null; document.body.dataset.view='bank'; app.classList.remove('dsk'); return bankView(); } view='home'; }
  const r=_render1.apply(this,arguments);
  if(s&&s.mode==='mock'&&!s.done&&DSK.matches) document.body.dataset.view='paper';
  return r;
};
var _note0=note;
note=function(){ const r=_note0.apply(this,arguments); if(DSK.matches){ const sub=app.querySelector('.sub'); if(sub){ const b=document.createElement('button'); b.className='cta ghost sm pc-print'; b.textContent='지금 목록 인쇄·PDF'; b.onclick=()=>{ const ids=[...app.querySelectorAll('.rlist [data-star]')].map(x=>x.dataset.star); printQs(ids.map(id=>byId[id]).filter(Boolean),noteTab==='wrong'?'오답 노트':'별표 노트'); }; sub.after(b); } } return r; };
try{ const s1=store.sess; if(DSK.matches&&(!tabbar.hidden||(s1&&s1.mode==='mock'&&!s1.done))) render(); }catch(e){}

/* v15: 스플래시 D-Day */
(function(){ const sd=document.getElementById("spDd"); if(sd) sd.textContent="시험까지 "+dday()+" · 12. 18.(금) 11:00"; })();
})();

/* 오프라인 지원 */
if('serviceWorker' in navigator && location.protocol==='https:' && !(function(){try{return window.self!==window.top;}catch(e){return true;}})()){ window.addEventListener('load',()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{}); }); }

/* 새 버전 자동 감지: 캐시된 옛 화면이면 최신으로 새로고침 */
(function(){ try{ if(!window.BUILD||location.protocol==='file:') return;
  fetch('version.json?t='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>{ if(!j||!j.v||j.v===window.BUILD) return;
    const k='promo2-reloaded-'+j.v; if(sessionStorage.getItem(k)) return; sessionStorage.setItem(k,'1');
    location.replace(location.pathname+'?v='+j.v+location.hash); }).catch(()=>{});
}catch(e){} })();
