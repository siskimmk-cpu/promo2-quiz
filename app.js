(function(){
const KEY='promo2-quiz-v3';
const EXAM={date:'2026-12-18', label:'2026. 12. 18.(금) 11:00', min:90, n:50};
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
function applyTheme(){ const t=store.cfg.theme; if(t==='system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme=t; }
applyTheme();
let actx=null;
function sfx(ok){ if(!store.cfg.sound) return; try{ actx=actx||new (window.AudioContext||window.webkitAudioContext)(); const now=actx.currentTime;
  const notes=ok?[[880,0],[1318.5,.09]]:[[196,0]];
  notes.forEach(([f,t])=>{ const o=actx.createOscillator(), g=actx.createGain(); o.type=ok?'sine':'triangle'; o.frequency.value=f; g.gain.setValueAtTime(0.0001,now+t); g.gain.exponentialRampToValueAtTime(ok?0.18:0.22,now+t+0.01); g.gain.exponentialRampToValueAtTime(0.0001,now+t+(ok?0.22:0.18)); o.connect(g); g.connect(actx.destination); o.start(now+t); o.stop(now+t+0.25); }); }catch(e){} }
function buzz(ms){ if(store.cfg.vib&&navigator.vibrate){ try{navigator.vibrate(ms);}catch(e){} } }
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
  SUBJECTS.forEach(sub=>{const h=trk[sub.id]||''; const n=h.length, o=(h.match(/1/g)||[]).length; tot+=n;
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
const PAPERS=[{id:'p1',name:'실전 제1회',desc:'고정 시험지',ic:'1',ids:()=>paper(0)},{id:'p2',name:'실전 제2회',desc:'고정 시험지',ic:'2',ids:()=>paper(1)},{id:'pr',name:'랜덤 실전',desc:'열 때마다 새로 출제',ic:'R',ids:randomPaper}];

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
  s.done=true; s.tEnd=Date.now(); save(); render(); top();
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
  star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  chev:'<path d="m9 6 6 6-6 6"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'
};
function go(v,after){ const f=()=>{ view=v; render(); top(); after&&after(); }; if(document.startViewTransition&&!matchMedia('(prefers-reduced-motion: reduce)').matches){ try{ document.startViewTransition(f); return; }catch(e){} } f(); }
const ico=(k,c='')=>`<svg class="i ${c}" viewBox="0 0 24 24" aria-hidden="true">${IC[k]}</svg>`;
const TABS=[['home','홈','home'],['study','연습','study'],['exam','모의고사','exam'],['report','리포트','chart']];
const tabbar=document.getElementById('tabbar');
function showTabs(cur){ tabbar.hidden=false; dock.hidden=true; tabbar.innerHTML=`<div class="wrap tabs">`+TABS.map(([v,l,i])=>`<button data-tab="${v}" aria-current="${cur===v}">${ico(i)}<span>${l}</span></button>`).join('')+`</div>`; tabbar.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{if(view!==b.dataset.tab) go(b.dataset.tab);}); }
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
  return `<div class="quick">
    <button class="qbtn" data-act="rand"><span class="qi">${ico('shuffle')}</span><b>랜덤 10문제</b><span>전 과목에서</span></button>
    <button class="qbtn" data-act="hard"><span class="qi r">${ico('bolt')}</span><b>고난도만</b><span>${QUESTIONS.filter(isHard).length}문제</span></button>
    <button class="qbtn" data-act="starq" ${starIds().length?'':'disabled'}><span class="qi g">${ico('star')}</span><b>별표 문제</b><span>${starIds().length}문제 · 다시 보기</span></button>
    <button class="qbtn" data-act="wrong" ${st.wrongIds.length?'':'disabled'}><span class="qi y">${ico('repeat')}</span><b>오답 정복</b><span>${st.wrongIds.length}문제 · 맞힐 때까지</span></button>
  </div>`;
}
function home(){
  clearInterval(tick); showTabs('home');
  const st=stats(), s=store.sess, resumable=s&&!s.done&&s.mode!=='mock', allDone=!st.newIds.length, pr=predict();
  let h=`<div class="aurora"></div><header class="top-h"><div><span class="eyebrow">2급 승진자격시험</span><h1 class="title">예상 기출문제</h1></div><span class="hr"><span class="dday">${dday()}</span><button class="gear" data-act="settings" aria-label="설정">${ico('gear')}</button></span></header>`;
  h+=`<section class="hero hero-x anim"><span class="hero-orb a"></span><span class="hero-orb b"></span>${pr.ready?`<span class="h-pill ${pr.prob>=70?'hi':pr.prob>=40?'mid':'lo'}"><i></i>${pr.prob>=70?'합격권이에요':pr.prob>=40?'조금만 더 힘내요':'집중 학습이 필요해요'}</span>`:`<span class="h-pill"><i></i>실력 분석 중</span>`}${gauge(pr.prob,pr.ready)}<p class="hero-msg">${pr.ready?`지금 실력이면 <b>${pr.score}점</b> 예상이에요<small>${store.pass||60}점 기준 · 최근 풀이 누적</small>`:`문제를 <b>${20-pr.tot}개</b> 더 풀면<br>합격 가능성을 계산해 드려요`}</p>
    <div class="hero-stats"><div><b>${st.done}</b><span>푼 문제</span></div><div><b>${st.done?Math.round(st.ok/st.done*100):0}%</b><span>정답률</span></div><div><b>${st.wrongIds.length}</b><span>오답</span></div></div>
    ${resumable?`<button class="cta" data-act="resume">이어서 풀기 · ${esc(s.title)} ${s.i+1}/${s.ids.length}</button>`
      :allDone?`<button class="cta warm" data-act="newround">다 풀었어요! 보기 섞어서 ${store.round+1}회독</button>`
      :`<button class="cta" data-act="go">안 푼 문제 풀기 · ${st.newIds.length}문제</button>`}</section>`;
  const tn=(store.log[today()]||{n:0}).n, due=dueIds().length, stk=streak();
  h+=`<div class="label">오늘의 학습${stk?`<small class="streak">${ico('flame')} ${stk}일 연속</small>`:''}</div><div class="daily anim"><div class="goal"><div class="ring" style="--p:${Math.min(100,tn/store.goal*100)}"><b>${tn}</b><span>/${store.goal}</span></div><div class="gtx"><b>${tn>=store.goal?'오늘 목표 달성! 🎉':`목표까지 ${store.goal-tn}문제`}</b><span>틀린 문제는 1·3·7일 뒤 다시 나와요</span></div></div><button class="cta ${due?'':'ghost'}" data-act="review" ${due?'':'disabled'}>${due?`오늘의 복습 ${due}문제`:'오늘 복습할 문제가 없어요'}</button></div>`;
  h+=`<div class="label">빠르게 풀기</div>`+quickGrid(st);
  h+=`<div class="label">바로가기</div><div class="list"><button class="row" data-act="exam"><span class="ic b">${ico('exam')}</span><span class="tx"><span class="nm">실전 모의고사</span><span class="meta">${EXAM.n}문항 · ${EXAM.min}분 · 제1회·제2회·랜덤</span></span>${ico('chev','chev')}</button><button class="row" data-act="note"><span class="ic y">${ico('note')}</span><span class="tx"><span class="nm">오답·별표 노트</span><span class="meta">틀린 문제 ${st.wrongIds.length} · 별표 ${store.star.length}</span></span>${ico('chev','chev')}</button></div>`;
  h+=`<p class="foot">${esc(EXAM.label)} 시험 · 공고 과목(자배법·손해사정이론·보험계약법·공제약관·상식) 기준 손해사정사 1차 수준 예상문제 ${st.N}문항. 풀이 기록은 이 기기에 저장돼요.</p>`;
  app.innerHTML=h; bindActs();
  const fg=app.querySelector('.hero .g-fg'), gv=app.querySelector('.hero .g-v');
  if(fg&&pr.ready&&!matchMedia('(prefers-reduced-motion: reduce)').matches){ const end=fg.style.strokeDashoffset; const full=fg.style.strokeDasharray; fg.style.transition='none'; fg.style.strokeDashoffset=full; requestAnimationFrame(()=>requestAnimationFrame(()=>{ fg.style.transition=''; fg.style.strokeDashoffset=end; })); if(gv){ const to=pr.prob, t0=performance.now(); const f=t=>{const k=Math.min(1,(t-t0)/1000); gv.textContent=Math.round(to*(1-Math.pow(1-k,3)))+'%'; if(k<1) requestAnimationFrame(f);}; requestAnimationFrame(f);} }
}
function study(){
  clearInterval(tick); showTabs('study');
  const st=stats();
  let h=`<header class="top-h"><div><span class="eyebrow">과목별 연습</span><h1 class="title">무엇을 풀어볼까요?</h1></div></header>`;
  h+=`<div class="list anim">`+SUBJECTS.map((sub,k)=>{
    const qs=QUESTIONS.filter(q=>sub.secs.includes(q.sec)), d=qs.filter(q=>store.ans[q.id]), o=d.filter(q=>store.ans[q.id].ok).length, nh=qs.filter(isHard).length;
    const pct=d.length?Math.round(o/d.length*100):null;
    const chips=sub.secs.length>1?`<span class="chips">${sub.secs.map(x=>`<button class="chip" data-act="chap" data-id="${x}">${esc(secOf[x].name)}</button>`).join('')}</span>`:'';
    return `<div class="row subj" data-act="subj" data-id="${sub.id}" role="button" tabindex="0"><span class="sring n${k}" style="--p:${Math.round(d.length/qs.length*100)}" aria-label="진도 ${Math.round(d.length/qs.length*100)}%"><b>${k+1}</b></span><span class="tx"><span class="nm">${esc(sub.name)}</span><span class="meta">${qs.length}문항 · 고난도 ${nh} · 시험 ${sub.n}문항 예상</span>${chips}<span class="mini"><i class="o" style="width:${o/qs.length*100}%"></i><i class="x" style="width:${(d.length-o)/qs.length*100}%"></i></span></span><span class="pct ${pct==null?'':pct>=60?'hi':'lo'}">${pct==null?'':pct+'%'}</span></div>`;
  }).join('')+`</div>`;
  h+=`<div class="label">빠르게 풀기</div>`+quickGrid(st);
  app.innerHTML=h; bindActs();
}
function exam(){
  clearInterval(tick); showTabs('exam');
  let h=`<header class="top-h"><div><span class="eyebrow">실전 모의고사</span><h1 class="title">실제 시험처럼<br>${EXAM.n}문항 · ${EXAM.min}분</h1></div></header>`;
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
  let h=`<div class="qmeta"><span class="tag">${esc(sub.name)}${sub.secs.length>1?' · '+esc(secOf[q.sec].name):''}</span>${isHard(q)?'<span class="tag hd">고난도</span>':''}${q.style==='수능형'?'<span class="tag su">보기형</span>':''}<button class="star" data-star="${q.id}" aria-pressed="${isStar(q.id)}" aria-label="별표">${isStar(q.id)?'★':'☆'}</button></div>`;
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
    h+=`<div class="fb"><div class="v ${none?'na':ok?'ok':'no'}">${none?'미응답':ok?'정답이에요!':'아쉬워요'} · 정답 ${ansPos}번</div><div class="chat"><span class="av">해설</span><div class="bub"><div class="who">해설 도우미</div><div class="body">${esc(q.exp)}</div>${q.why?`<ul class="why">${perm.map((oi,pos)=>`<li class="${oi===q.ans?'a':''}"><b>${pos+1}</b><span>${esc(q.why[oi])}</span></li>`).join('')}</ul>`:''}<div class="ref">근거 · ${esc(q.ref)}</div></div></div></div>`;
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
  if(fresh){ const qc=$('#qc'); if(qc) qc.classList.add('slide'); }
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
    if(good){ s.combo=(s.combo||0)+1; s.best=Math.max(s.best||0,s.combo); sfx(true); buzz(12); if(s.combo===5||s.combo===10||s.combo===20) setTimeout(()=>toast(`🔥 ${s.combo}연속 정답!`),300); }
    else { s.combo=0; sfx(false); buzz([30,40,30]); }
    if(s.loop&&!isOk(q,p)){ const base=q.opts.map((_,k)=>k); s.ids.push(q.id); s.perm.push(canShuffle(q)?shuffle(base):base); s.picks.push(null); s.again=(s.again||0)+1; }
    save(); quiz();
    const fb=document.querySelector('.fb'); if(fb) fb.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});
  });
  document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>{s.i=+b.dataset.jump;save();quiz();top();});
  bindStars(app);
  $('#quit').onclick=()=>{ if(!quitArmed){quitArmed=true;quiz();return;} quitArmed=false; if(mock){store.sess=null;save();} view='home'; render(); top(); };
  if(mock){ clearInterval(tick); tick=setInterval(()=>{ const c=$('#cnt'); if(!store.sess||store.sess.done){clearInterval(tick);return;} if(s.end-Date.now()<=0){finish();return;} if(c){c.textContent=fmtLeft(); c.classList.toggle('low',s.end-Date.now()<600000);} },1000); }
}
function fmtLeft(){const s=store.sess; const t=Math.ceil(Math.max(0,s.end-Date.now())/1000); return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');}

/* ── 결과 ── */
function result(){
  const s=store.sess; hideTabs(); dock.hidden=false; dock.classList.remove('fbd','ok','no');
  let rs=s.ids.map((id,i)=>({q:byId[id],pick:s.picks[i],perm:s.perm[i],ok:isOk(byId[id],s.picks[i])}));
  if(s.loop){ const first={}; rs.forEach(r=>{ if(!(r.q.id in first)) first[r.q.id]=r; }); rs=Object.values(first); }
  const ok=rs.filter(r=>r.ok).length, wrong=rs.filter(r=>!r.ok).map(r=>r.q.id), mock=s.mode==='mock';
  const sc=mock?ok*2:Math.round(ok/rs.length*100);
  const grade=sc>=90?'S':sc>=80?'A':sc>=70?'B':sc>=60?'C':'D', secs=Math.round(((s.tEnd||Date.now())-(s.t0||Date.now()))/1000);
  const tm=secs>=3600?`${Math.floor(secs/3600)}시간 ${Math.floor(secs%3600/60)}분`:`${Math.floor(secs/60)}분 ${secs%60}초`;
  let h=`<div class="result"><span class="grade g${grade}">${grade}</span><div class="eyebrow">${esc(s.title)} 결과</div><div class="sc"><span id="scn">0</span><small>점</small></div><p>${s.loop?`${rs.length}문항 모두 정복! 첫 시도 정답 ${ok}문항 · 재출제 ${s.again||0}번`:`${rs.length}문항 중 ${ok}문항 정답`}</p>${mock?`<span class="pass ${sc>=(store.pass||60)?'ok':'no'}">${sc>=(store.pass||60)?'합격권':'합격 기준 미달'} · ${store.pass||60}점 기준</span>`:''}<div class="rmeta"><div><b>${tm}</b><span>소요 시간</span></div><div><b>${rs.length?Math.round(secs/rs.length):0}초</b><span>문항당</span></div><div><b>${mock?'–':(s.best||0)}</b><span>최대 콤보</span></div></div></div>`;
  if(!mock){ const by=SUBJECTS.map(sub=>{const r=rs.filter(x=>sub.secs.includes(x.q.sec));return r.length?{sub,o:r.filter(x=>x.ok).length,n:r.length}:null;}).filter(Boolean); if(by.length>1) h+=`<div class="label">과목별</div><div class="qcard bars">`+by.map(x=>`<div class="bar"><span class="bn">${esc(x.sub.name)}</span><span class="bt"><i style="width:${x.o/x.n*100}%" class="${x.o/x.n<.6?'lo':''}"></i></span><span class="bv">${x.o}/${x.n}</span></div>`).join('')+`</div>`; }
  if(mock) h+=`<div class="label">과목별 점수</div><div class="list"><table class="tbl"><thead><tr><th>과목</th><th>정답</th><th>점수</th></tr></thead><tbody>`+SUBJECTS.map(sub=>{const r=rs.filter(x=>sub.secs.includes(x.q.sec));if(!r.length)return'';const o=r.filter(x=>x.ok).length;return `<tr><td>${esc(sub.name)}</td><td>${o}/${r.length}</td><td>${o*2}</td></tr>`;}).join('')+`</tbody></table></div>`;
  h+=`<div class="label">문항별 확인<small>눌러서 해설 보기</small></div><ul class="rlist">`+rs.map((r,i)=>`<li><details><summary><span class="mk ${r.ok?'o':'x'}">${r.ok?'○':'×'}</span><span class="qq"><small>${i+1}번 · ${esc(subjOfSec(r.q.sec).name)}${isHard(r.q)?' · 고난도':''}</small>${esc(r.q.q)}</span></summary><div class="inner"><div class="qcard">${card(r.q,{pick:r.pick,reveal:true,locked:true,perm:r.perm})}</div></div></details></li>`).join('')+`</ul>`;
  app.innerHTML=h; bindStars(app);
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
  const list=noteTab==='wrong'?wrong:stars;
  let h=`<button class="back" id="back">‹ 리포트</button><h1 class="title">오답·별표 노트</h1><p class="sub">다시 맞히면 오답 목록에서 빠져요.</p>`;
  h+=`<div class="seg" style="margin-bottom:14px"><button data-t="wrong" aria-pressed="${noteTab==='wrong'}">오답 ${wrong.length}</button><button data-t="star" aria-pressed="${noteTab==='star'}">별표 ${stars.length}</button></div>`;
  if(!list.length) h+=`<div class="empty">${noteTab==='wrong'?'아직 틀린 문제가 없어요.':'별표한 문제가 없어요.<br>문제 오른쪽 위 ☆를 눌러 모아 보세요.'}</div>`;
  else h+=`<ul class="rlist">`+list.map(q=>{const a=store.ans[q.id];return `<li><details><summary><span class="mk ${a?(a.ok?'o':'x'):''}">${a?(a.ok?'○':'×'):'–'}</span><span class="qq"><small>${esc(subjOfSec(q.sec).name)}</small>${esc(q.q)}</span></summary><div class="inner"><div class="qcard">${card(q,{pick:a?a.pick:null,reveal:true,locked:true})}</div></div></details></li>`;}).join('')+`</ul>`;
  app.innerHTML=h; bindStars(app);
  if(list.length){ app.insertAdjacentHTML('beforeend',`<div style="margin-top:14px"><button class="cta" id="redo">이 ${list.length}문제 맞힐 때까지 풀기</button></div>`); $('#redo').onclick=()=>start(shuffle(list.map(q=>q.id)),noteTab==='wrong'?'오답 정복':'별표 문제','practice',{mix:true,loop:true}); }
  $('#back').onclick=()=>go('report');
  document.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{noteTab=b.dataset.t;note();});
}

function report(){
  showTabs('report');
  const rate=qs=>{const d=qs.filter(q=>store.ans[q.id]);const o=d.filter(q=>store.ans[q.id].ok).length;return {d:d.length,o,r:d.length?Math.round(o/d.length*100):null,t:qs.length};};
  let h=`<header class="top-h"><div><span class="eyebrow">학습 리포트</span><h1 class="title">나의 실력 분석</h1></div></header>`;
  const all=rate(QUESTIONS);
  h+=`<div class="stat3"><div><b>${all.d}</b><span>푼 문항</span></div><div><b>${all.r==null?'–':all.r+'%'}</b><span>정답률</span></div><div><b>${streak()}일</b><span>연속 학습</span></div></div>`;
  const pr=predict();
  h+=`<div class="label">합격 예측<small>최근 풀이 누적 · ${store.pass||60}점 이상 합격 가정</small></div><div class="qcard predbox">`+(pr.ready?`<div class="pbig ${pr.prob>=70?'hi':pr.prob>=40?'mid':'lo'}">${pr.prob}%</div><p class="psub">지금 실력으로 시험을 보면 예상 점수는 <b>${pr.score}점</b>이에요.</p><table class="tbl" style="margin-top:8px"><thead><tr><th>과목</th><th>최근 정답률</th><th>예상 점수</th></tr></thead><tbody>`+pr.per.map(x=>`<tr><td>${esc(x.sub.name)}</td><td>${x.n?Math.round(x.p*100)+'%':'–'}<small style="color:var(--muted)"> (${x.n}회)</small></td><td>${Math.round(x.sub.n*x.p*2)}/${x.sub.n*2}</td></tr>`).join('')+`</tbody></table><p class="foot" style="margin:12px 0 0">과목별 최근 80회 풀이로 정답률을 추정하고, 시험 배점대로 합산해 계산해요. 적게 푼 과목은 50% 쪽으로 보수적으로 잡혀요. 공고에 합격 기준이 없어 아래에서 기준 점수를 고를 수 있어요.</p>`:`<p class="psub">문제를 ${20-pr.tot}개 더 풀면 합격 가능성을 계산해 드려요.</p>`)+`<div class="seg" style="margin-top:12px">${[60,70,80].map(g=>`<button data-pass="${g}" aria-pressed="${(store.pass||60)===g}">${g}점 기준</button>`).join('')}</div></div>`;
  h+=`<div class="list" style="margin-top:12px"><button class="row" id="gonote"><span class="ic y">${ico('note')}</span><span class="tx"><span class="nm">오답·별표 노트</span><span class="meta">틀린 문제와 보기별 해설 모아보기</span></span>${ico('chev','chev')}</button><button class="row" id="goset"><span class="ic">${ico('gear')}</span><span class="tx"><span class="nm">설정</span><span class="meta">테마·효과음·진동·목표·합격 기준</span></span>${ico('chev','chev')}</button></div>`;
  h+=`<div class="label">과목별 정답률</div><div class="qcard bars">`+SUBJECTS.map(sub=>{const r=rate(QUESTIONS.filter(q=>sub.secs.includes(q.sec)));return `<div class="bar"><span class="bn">${esc(sub.name)}</span><span class="bt"><i style="width:${r.r||0}%" class="${r.r!=null&&r.r<60?'lo':''}"></i></span><span class="bv">${r.r==null?'–':r.r+'%'}<small>${r.d}/${r.t}</small></span></div>`;}).join('')+`</div>`;
  const secs=SECTIONS.map(s=>({s,...rate(QUESTIONS.filter(q=>q.sec===s.id))})).filter(x=>x.d>=3).sort((a,b)=>a.r-b.r).slice(0,3);
  h+=`<div class="label">취약 단원 TOP 3<small>3문항 이상 푼 단원</small></div>`;
  h+=secs.length?`<div class="list">`+secs.map((x,i)=>`<button class="row" data-weak="${x.s.id}"><span class="ic">${i+1}</span><span class="tx"><span class="nm">${esc(subjOfSec(x.s.id).name)}${subjOfSec(x.s.id).secs.length>1?' · '+esc(x.s.name):''}</span><span class="meta">정답률 ${x.r}% · ${x.o}/${x.d}</span></span><span class="chev">›</span></button>`).join('')+`</div>`:`<div class="empty">문제를 더 풀면 취약 단원을 알려 드려요.</div>`;
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
    <div class="sr"><b>효과음</b>${seg('sound',[['true','켜기'],['false','끄기']])}</div>
    <div class="sr"><b>진동</b><small>안드로이드에서 동작</small>${seg('vib',[['true','켜기'],['false','끄기']])}</div>
    <div class="sr"><b>하루 목표</b><div class="seg">${[10,20,30,50].map(g=>`<button data-goal="${g}" aria-pressed="${store.goal===g}">${g}문제</button>`).join('')}</div></div>
    <div class="sr"><b>합격 기준</b><small>공고에 없어 직접 정해요</small><div class="seg">${[60,70,80].map(g=>`<button data-pass="${g}" aria-pressed="${(store.pass||60)===g}">${g}점</button>`).join('')}</div></div></div>`;
  h+=`<div class="label">앱 정보</div><div class="list"><div class="row"><span class="tx"><span class="nm">문항 수</span><span class="meta">총 ${QUESTIONS.length}문항 · 고난도 ${QUESTIONS.filter(isHard).length} · 보기별 해설 ${QUESTIONS.filter(q=>q.why).length}</span></span></div><div class="row"><span class="tx"><span class="nm">업데이트</span><span class="meta">매주 월·목 새 문제가 자동으로 추가돼요</span></span></div><button class="row" id="bk"><span class="tx"><span class="nm">기록 백업하기</span><span class="meta">폰을 바꾸거나 사파리 기록을 지울 때 대비해요</span></span>${ico('chev','chev')}</button><button class="row" id="rs"><span class="tx"><span class="nm">기록 복원하기</span><span class="meta">백업 코드를 붙여넣어 그대로 되살려요</span></span>${ico('chev','chev')}</button><button class="row" id="replay"><span class="tx"><span class="nm">처음 안내 다시 보기</span></span>${ico('chev','chev')}</button><button class="row" id="wipe"><span class="tx"><span class="nm danger">풀이 기록 초기화</span><span class="meta">푼 기록·오답·별표·모의고사 기록이 모두 지워져요</span></span></button></div>`;
  app.innerHTML=h;
  $('#back').onclick=()=>go('report');
  app.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{const k=b.dataset.k,v=b.dataset.v; c[k]=v==='true'?true:v==='false'?false:v; save(); applyTheme(); if(k==='sound'&&c.sound) sfx(true); settings();});
  app.querySelectorAll('[data-goal]').forEach(b=>b.onclick=()=>{store.goal=+b.dataset.goal;save();settings();});
  app.querySelectorAll('[data-pass]').forEach(b=>b.onclick=()=>{store.pass=+b.dataset.pass;save();settings();});
  $('#replay').onclick=()=>{slideI=0;onboarding();};
  $('#bk').onclick=backup; $('#rs').onclick=restore;
  let armed=false; $('#wipe').onclick=()=>{ if(!armed){armed=true;$('#wipe .nm').textContent='한 번 더 누르면 초기화돼요';return;} const cfg=store.cfg; store={ans:{},star:[],sess:null,best:{},round:1,log:{},srs:{},hist:[],goal:20,trk:{},pass:60,cfg}; save(); toast('기록을 초기화했어요'); view='home'; render(); };
}
function render(){
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

function hideSplash(){ const sp=document.getElementById('splash'); if(!sp) return; sp.classList.add('out'); setTimeout(()=>sp.remove(),RM?0:450); }

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
  if(isStandalone()||inFrame()||!isMobile) return maybeUpdate();
  if(meta.inst&&Date.now()-meta.inst<3*86400000) return maybeUpdate();
  const steps=isIOS?[['Safari 아래쪽 <b>공유 버튼</b>을 눌러요','share'],['<b>홈 화면에 추가</b>를 골라요','plus'],['오른쪽 위 <b>추가</b>를 누르면 끝!','check']]
                  :[['Chrome 오른쪽 위 <b>⋮ 메뉴</b>를 눌러요','menu'],['<b>홈 화면에 추가</b> 또는 <b>앱 설치</b>를 골라요','plus'],['<b>설치</b>를 누르면 끝!','check']];
  sheet(`<div class="app-badge"><img src="icon-192.png" alt="" onerror="this.style.display='none'"><div><b>앱으로 설치하기</b><span>홈 화면에서 바로 열리고, 주소창 없이 전체화면으로 풀 수 있어요.</span></div></div>
    <ol class="steps">${steps.map(([t],i)=>`<li><span>${i+1}</span><p>${t}</p></li>`).join('')}</ol>
    <button class="cta" id="instOk">알겠어요</button><button class="linkbtn center" id="instLater">나중에 할게요</button>`,()=>{
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
  setTimeout(()=>{ hideSplash(); setTimeout(()=>{ if(!meta.onb && !(store.sess&&!store.sess.done)) onboarding(); else maybeInstall(); }, RM?0:300); }, RM?150:1600);
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
})();

/* 오프라인 지원 */
if('serviceWorker' in navigator && location.protocol==='https:' && !(function(){try{return window.self!==window.top;}catch(e){return true;}})()){ window.addEventListener('load',()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{}); }); }

/* 새 버전 자동 감지: 캐시된 옛 화면이면 최신으로 새로고침 */
(function(){ try{ if(!window.BUILD||location.protocol==='file:') return;
  fetch('version.json?t='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>{ if(!j||!j.v||j.v===window.BUILD) return;
    const k='promo2-reloaded-'+j.v; if(sessionStorage.getItem(k)) return; sessionStorage.setItem(k,'1');
    location.replace(location.pathname+'?v='+j.v+location.hash); }).catch(()=>{});
}catch(e){} })();
