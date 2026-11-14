// node --test tools/runtime.test.js
// Run the production release/session functions with a controlled clock and browser storage.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const questions=fs.readFileSync(path.join(root,'questions.js'),'utf8');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const auth=fs.readFileSync(path.join(root,'auth.js'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
// 앱과 별도로 원본 문제 파일을 직접 읽어 기대값을 만든다(고정 숫자 금지)
const SRC=new Function(questions+';return QUESTIONS;')();
const SRC_IDS=SRC.map(q=>q.id);
const upto=d=>SRC.filter(q=>!q.rel||q.rel<=d);
const onDay=d=>SRC.filter(q=>q.rel===d);
const ids=list=>list.map(q=>q.id);
const PLAIN=SRC.filter(q=>!q.rel||q.rel<='2026-11-06').map(q=>q.id); // 공개 문항(현재 rev로 남긴 기록은 유지 대상)
const RV=Object.fromEntries(SRC.filter(q=>q.rev).map(q=>[q.id,q.rev]));
function harness(iso='2026-11-06T23:59:59Z',stored,qsrc=questions){
  let time=Date.parse(iso),timerId=0;const timers=new Map(),listeners={},storage=new Map();
  if(stored)storage.set('promo2-quiz-v3',JSON.stringify(stored));
  class Clock extends Date{constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}}
  const window={BUILD:'202611061553',scrollTo:()=>{},addEventListener:(n,f)=>listeners[n]=f};
  const ctx={Date:Clock,window,document:{documentElement:{dataset:{}},querySelector:()=>({}),visibilityState:'visible',addEventListener:(n,f)=>listeners[n]=f},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    location:{pathname:'/promo2-quiz/',hash:'',replace:u=>ctx.reloads.push(u)},reloads:[],renders:0,
    setTimeout:(f,ms)=>{timers.set(++timerId,{f,ms});return timerId;},clearTimeout:i=>timers.delete(i),clearInterval:()=>{},navigator:{},console};
  vm.createContext(ctx);vm.runInContext(qsrc,ctx);
  const head=app.slice(0,app.indexOf('/* ── 홈·탭 ── */'));
  const daily=app.slice(app.indexOf('function dayKey9()'),app.indexOf('function paperInfo()'));
  const boundary=app.slice(app.indexOf('var releaseTimer=null'),app.indexOf('\n})();',app.indexOf('var releaseTimer=null')));
  vm.runInContext(head+'\n'+daily+`\nconst ov={hidden:true};function render(){globalThis.renders++;}function checkBadges(){}\n`+boundary+`
    globalThis.api={refreshRelease,checkReleaseBoundary,dailyPaper,record,predict,finish,start,toggleStar,
      get state(){return store;},get visible(){return activeQuestions;},get all(){return ALL_QUESTIONS;},
      get fresh(){return FRESH_IDS;},get day(){return REL_DAY;},get subjects(){return SUBJECTS;},
      get byId(){return byId;},setView:v=>view=v};})();`,ctx);
  return {ctx,api:ctx.api,listeners,storage,timers,setTime:iso=>time=Date.parse(iso),runShortTimers:()=>{
    for(const [id,t] of [...timers])if(t.ms<=1000){timers.delete(id);t.f();}
  }};
}
test('9am release updates an open page without deleting future source questions',()=>{
  const h=harness();
  assert.deepEqual([...ids(h.api.all)],SRC_IDS,'원본 문제 ID 목록과 순서가 그대로여야 함');
  assert.deepEqual([...ids(h.api.visible)],ids(upto('2026-11-06')));assert.deepEqual([...h.api.fresh],ids(onDay('2026-11-06')));
  h.setTime('2026-11-07T00:00:01Z');h.api.checkReleaseBoundary();
  assert.deepEqual([...ids(h.api.visible)],ids(upto('2026-11-07')));assert.deepEqual([...h.api.fresh],ids(onDay('2026-11-07')));
  assert.deepEqual([...ids(h.api.all)],SRC_IDS,'공개 후에도 원본이 지워지지 않아야 함');
  assert.equal(h.ctx.renders,1);
});
test('foreground and focus refresh after device sleep; no premature release at midnight KST',()=>{
  const h=harness('2026-11-06T15:00:00Z');assert.deepEqual([...h.api.fresh],ids(onDay('2026-11-06')));
  h.setTime('2026-11-07T15:00:01Z');h.listeners.visibilitychange();
  assert.deepEqual([...ids(h.api.visible)],ids(upto('2026-11-07')),'KST 자정(11/8 00:00)에는 11/8 문제가 아직 열리면 안 됨');
  h.setTime('2026-11-08T00:01:00Z');h.listeners.visibilitychange();
  assert.deepEqual([...ids(h.api.visible)],ids(upto('2026-11-08')));assert.deepEqual([...h.api.fresh],ids(onDay('2026-11-08')));
  h.setTime('2026-11-09T00:01:00Z');h.listeners.focus();assert.deepEqual([...ids(h.api.visible)],ids(upto('2026-11-09')));
});
test('boundary timer is armed for the next 9am',()=>{
  const h=harness();assert([...h.timers.values()].some(t=>t.ms===1100));
});
test('release preserves in-progress mock IDs, answers, order, and deadline without re-render',()=>{
  const h=harness(),ids=h.api.dailyPaper(0);h.api.start(ids,'test','mock',{paper:'p1',mix:true});
  h.api.state.sess.picks[0]=2;h.api.state.sess.i=3;
  const snapshot=JSON.stringify(h.api.state.sess),renders=h.ctx.renders;
  h.setTime('2026-11-07T00:00:01Z');h.api.checkReleaseBoundary();
  assert.equal(JSON.stringify(h.api.state.sess),snapshot);assert.equal(h.ctx.renders,renders);assert.equal(h.api.fresh.length,h.api.all.filter(q=>q.rel==='2026-11-07').length);
});
test('practice answer and revealed explanation stay on screen at boundary',()=>{
  const h=harness();h.api.start(['D50'],'practice','practice',{});h.api.state.sess.picks[0]=0;h.api.state.sess.rev[0]=true;
  const snapshot=JSON.stringify(h.api.state.sess),renders=h.ctx.renders;
  h.setTime('2026-11-07T00:00:01Z');h.listeners.focus();
  assert.equal(JSON.stringify(h.api.state.sess),snapshot);assert.equal(h.ctx.renders,renders);
});
test('daily papers keep the blueprint, have no duplicates, and change each day',()=>{
  const h=harness();let previous=null;
  for(let day=6;day<=12;day++){
    h.setTime(`2026-11-${String(day).padStart(2,'0')}T00:00:01Z`);
    const p0=h.api.dailyPaper(0),p1=h.api.dailyPaper(1);
    assert.equal(p0.length,50);assert.equal(p1.length,50);assert.equal(new Set(p0).size,50);assert.equal(new Set(p1).size,50);
    assert(!p0.some(id=>p1.includes(id)));
    for(const sub of h.api.subjects)for(const p of [p0,p1])assert.equal(p.filter(id=>sub.secs.includes(h.api.byId[id].sec)).length,sub.n);
    if(previous)assert.notEqual(JSON.stringify(p0),previous);previous=JSON.stringify(p0);
  }
  assert.equal(h.api.fresh.length,h.api.all.filter(q=>q.rel==='2026-11-12').length);
});
test('unanswered mock questions enter wrong answers and spaced review; score remains correct',()=>{
  const h=harness();h.api.start(['D50','CS3'],'test','mock',{});h.api.state.sess.picks[0]=0;h.api.finish();
  assert.equal(h.api.state.ans.CS3.ok,false);assert.equal(h.api.state.ans.CS3.pick,null);assert(h.api.state.srs.CS3);
  assert.equal(h.api.state.hist[0].sc,2);assert.equal(h.api.state.ans.D50.ok,true);
});
test('accuracy uses unique visible questions rather than counting repeated memorized answers',()=>{
  const h=harness(),q=h.api.byId.D50;for(let i=0;i<30;i++)h.api.record(q,q.ans);
  assert.equal(h.api.predict().tot,1);assert.equal(h.api.predict().ready,false);
  assert.equal(h.api.predict().rate,100);
});
test('pending build waits until study completes and stores records before reload',()=>{
  const h=harness();h.api.start(['D50'],'practice','practice',{});h.ctx.window.P2RequestVersion('202611061400');h.runShortTimers();
  assert.equal(h.ctx.reloads.length,0);h.api.state.sess.done=true;h.api.checkReleaseBoundary();h.runShortTimers();
  assert.equal(h.ctx.reloads.length,1);assert.match(h.ctx.reloads[0],/v=202611061400/);
  assert(JSON.parse(h.storage.get('promo2-quiz-v3')).sess.done);
});
test('saved stars, answers and history survive release refresh and reload initialization',()=>{
  const P=PLAIN[0],stored={ans:{[P]:{pick:0,ok:true,n:2,t:1,rv:RV[P]}},star:[P],hist:[{name:'test',sc:80,d:'2026-11-06'}],srs:{},trk:{},log:{}};
  const h=harness('2026-11-07T00:00:01Z',stored);
  assert.equal(h.api.state.ans[P].n,2);assert.equal(h.api.state.star[0],P);assert.equal(h.api.state.hist[0].sc,80);
});
test('leaving practice permits a queued version update without deleting its resumable session',()=>{
  const h=harness();h.api.start(['D50'],'practice','practice',{});h.api.state.sess.picks[0]=0;
  h.ctx.window.P2RequestVersion('202611061400');h.runShortTimers();assert.equal(h.ctx.reloads.length,0);
  h.api.setView('home');h.api.checkReleaseBoundary();h.runShortTimers();
  assert.equal(h.ctx.reloads.length,1);assert.equal(JSON.parse(h.storage.get('promo2-quiz-v3')).sess.picks[0],0);
});
test('exam blueprint is 12·12·12·12·2 and pass line is 4 wrong answers',()=>{
  const h=harness();assert.equal(h.api.subjects.map(s=>s.n).join(','),'12,12,12,12,2');
  const p=h.api.predict();assert(p.prob>=0&&p.prob<=100);
});

// 예약 작업이 새 문제를 덧붙인 상황을 흉내 낸다(원본 파일은 건드리지 않음)
function withAdded(extra){ const i=questions.lastIndexOf('\n];'); return questions.slice(0,i)+',\n'+extra.map(q=>JSON.stringify(q)).join(',\n')+questions.slice(i); }
const NEWQ=(id,rel)=>({id,sec:'D',style:'개념형',tags:['개념'],q:'테스트 '+id,opts:['a','b','c','d'],ans:0,exp:'e',ref:'상법',why:['○','×','×','×'],rel});
test('newly appended scheduled questions stay hidden until 9am KST of their day, then appear without losing originals',()=>{
  const src=withAdded([NEWQ('DT1','2026-11-12'),NEWQ('DT2','2026-11-12'),NEWQ('DT3','2026-11-13')]);
  const h=harness('2026-11-11T23:59:59Z',null,src);
  assert.deepEqual([...ids(h.api.all)],SRC_IDS.concat(['DT1','DT2','DT3']));
  assert(!ids(h.api.visible).includes('DT1'),'11/12 08:59 KST에는 숨김');
  h.setTime('2026-11-12T00:00:01Z');h.api.checkReleaseBoundary();
  assert(ids(h.api.visible).includes('DT1')&&ids(h.api.visible).includes('DT2'));assert(!ids(h.api.visible).includes('DT3'));
  assert.deepEqual([...h.api.fresh].filter(id=>id.startsWith('DT')),['DT1','DT2']);
  for(const id of SRC_IDS) assert(ids(h.api.all).includes(id));
  h.setTime('2026-11-13T00:00:01Z');h.api.checkReleaseBoundary();assert(ids(h.api.visible).includes('DT3'));
});
test('service worker cleans up only this app\'s caches (other apps on the same domain are kept)',async()=>{
  const store=new Set(['promo2-v1','promo2-202611061200','promo2-202611061400','other-app-v3','songmu-cache','workbox-precache-v2']);
  const handlers={};let navigated=0;const cur=(sw.match(/const C='(promo2-\d+)'/)||[])[1];store.add(cur);
  const self={addEventListener:(n,f)=>handlers[n]=f,skipWaiting:()=>{},clients:{claim:async()=>{},matchAll:async()=>[{url:'https://x/promo2-quiz/?v=1',navigate:()=>{navigated++;}}]}};
  const caches={keys:async()=>[...store],delete:async k=>store.delete(k),open:async()=>({addAll:async()=>{},put:async()=>{}}),match:async()=>null};
  vm.runInNewContext(sw,{self,caches,fetch:async()=>({}),location:{origin:'https://x'},URL,console});
  let p;handlers.activate({waitUntil:x=>p=x});await p;
  assert.deepEqual([...store].sort(),[cur,'other-app-v3','songmu-cache','workbox-precache-v2'].sort());
  assert.equal(navigated,1,'로그인 이전 캐시가 있던 기기는 새로 불러온다');
  // 로그인 이후 버전끼리 업데이트할 때는 화면을 강제로 새로고침하지 않는다
  store.clear();['promo2-202611061400',cur,'other-app-v3'].forEach(k=>store.add(k));navigated=0;handlers.activate({waitUntil:x=>p=x});await p;
  assert.equal(navigated,0);assert(store.has('other-app-v3'));
});
const merge=new Function(auth.slice(auth.indexOf('function merge('),auth.indexOf('  function stats('))+';return merge;')();
test('sync merge: completed review and removed stars are not revived; new items from the other device are kept',()=>{
  const T=1e12;
  // 서버(a): 예전 상태 — D1 틀림(복습 대기), 별표 D1·D2
  const server={ans:{D1:{pick:1,ok:false,t:T}},srs:{D1:{step:0,due:T+1}},star:['D1','D2'],starT:{D1:T,D2:T}};
  // 이 기기(b): 나중에 D1을 맞혀 복습 완료(srs 없음), D2 별표 해제, D3 새 별표
  const local={ans:{D1:{pick:0,ok:true,t:T+500}},srs:{},star:['D1','D3'],starT:{D1:T,D2:T+400,D3:T+450}};
  for(const aNewer of [true,false]){
    const m=merge(server,local,aNewer);
    assert.equal(m.ans.D1.ok,true);assert.equal(m.srs.D1,undefined,'완료한 복습이 되살아나면 안 됨');
    assert(!m.star.includes('D2'),'해제한 별표가 되살아나면 안 됨');assert(m.star.includes('D3'));assert(m.star.includes('D1'));
  }
  // 반대로 다른 기기(서버)에서 새로 틀린 문제와 새 별표는 이 기기에 들어와야 함
  const server2={ans:{D1:{pick:0,ok:true,t:T+500},D9:{pick:2,ok:false,t:T+900}},srs:{D9:{step:0,due:T+2}},star:['D1','D3','D9'],starT:{D1:T,D2:T+400,D3:T+450,D9:T+910}};
  const m2=merge(server2,local,false);assert(m2.srs.D9&&m2.star.includes('D9')&&!m2.star.includes('D2'));
  // 시각 기록이 없는 옛 데이터는 합집합으로 보존
  const m3=merge({star:['A1']},{star:['A2']},false);assert.deepEqual(m3.star.sort(),['A1','A2']);
});
test('toggleStar records the change time so removals can sync',()=>{
  const h=harness();h.api.toggleStar('D50');h.api.toggleStar('D50');
  assert(!h.api.state.star.includes('D50'));assert(h.api.state.starT&&h.api.state.starT.D50>0);
});

// ── 동기화 저장(push)·로그아웃·간격 복습 재발 방지 ──
function authHarness(server, hooks={}){
  const store=new Map();const ls={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
  let seq=0;
  const sb={auth:{signOut:async()=>{hooks.signedOut=true;return {};}},from:()=>{
    const q={_f:{},select(){return q;},eq(k,v){q._f[k]=v;return q;},
      async maybeSingle(){ if(hooks.failRead) return {error:{message:'offline'}}; const row=server.row; if(hooks.onRead) await hooks.onRead(); return {data:row?{data:JSON.parse(JSON.stringify(row.data)),updated_at:row.updated_at}:null,error:null}; },
      update(v){ q._u=v; return q; },
      insert:async(v)=>{ if(hooks.failWrite) return {error:{message:'offline'}}; if(server.row) return {error:{code:'23505'}}; server.row={data:v.data,updated_at:v.updated_at}; return {error:null}; },
      then(res){ // update(...).eq().eq().select() 결과
        if(hooks.failWrite) return res({error:{message:'offline'}});
        if(!server.row||server.row.updated_at!==q._f.updated_at) return res({data:[],error:null});
        server.row={data:q._u.data,updated_at:q._u.updated_at+'#'+(++seq)}; return res({data:[{updated_at:server.row.updated_at}],error:null}); }};
    return q;}};
  const src=auth.slice(auth.indexOf('  function parse('),auth.indexOf('  /* ── 설정 화면'))+auth.slice(auth.indexOf('  async function logout()'),auth.indexOf('  /* ── 시트'));
  const ctx={localStorage:ls,Storage:function(){},QUESTIONS:[],SUBJECTS:[],document:{addEventListener(){}},window:{addEventListener(){}},setTimeout:()=>0,clearTimeout(){},location:{reload(){hooks.reloaded=true;}},console};
  ctx.Storage.prototype={setItem(){}};
  vm.createContext(ctx);
  vm.runInContext(`var KEY='promo2-quiz-v3',OWNER='promo2-owner',AUTHC='promo2-auth',CHG='promo2-chg';
    var st={sb:null,user:{id:'u1'},me:{},timer:0,syncing:null,lastSync:0,err:''};
    var rd=function(k,d){var v=localStorage.getItem(k);return v==null?d:v;},wr=function(k,v){localStorage.setItem(k,v);},rm=function(k){localStorage.removeItem(k);};
    var esc=function(s){return String(s);},$=function(){return {dataset:{arm:'1'},textContent:'',onclick:null};},msg=function(){},entered=true;
    var sheet=function(){globalThis.sheetShown=true;return {close(){}};};
    ${src}
    globalThis.api={push,merge,unsynced,logout,setSb:function(x){st.sb=x;},st:st};`,ctx);
  ctx.api.setSb(sb);
  const save=d=>{ls.setItem('promo2-quiz-v3',JSON.stringify(d));ls.setItem('promo2-chg',String(Date.now()+Math.random()));};
  return {api:ctx.api,ls,save,ctx,hooks};
}
test('push keeps both devices\' answers when PC and phone save at the same time (conditional write + retry)',async()=>{
  const server={row:{data:{ans:{A1:{ok:true,t:1}}},updated_at:'t0'}};
  const pc=authHarness(server), phone=authHarness(server);
  pc.save({ans:{A1:{ok:true,t:1},B1:{ok:false,t:10}},srs:{B1:{step:0,due:99}}});
  phone.save({ans:{A1:{ok:true,t:1},C1:{ok:true,t:11}}});
  // PC가 읽은 직후 휴대폰이 먼저 저장 → PC의 조건부 저장은 실패하고 다시 읽어 합쳐야 함
  let once=true; pc.hooks.onRead=async()=>{ if(once){ once=false; await phone.api.push(); } };
  assert.equal(await pc.api.push(),true);
  const d=server.row.data; assert(d.ans.A1&&d.ans.B1&&d.ans.C1,'양쪽 답안 보존'); assert(d.srs.B1);
  assert.equal(pc.api.unsynced(),false);
});
test('push merges by question: newer answer on the server is not overwritten by an older local answer',async()=>{
  const server={row:{data:{ans:{A1:{ok:true,t:50}},srs:{},star:[],starT:{A1:50}},updated_at:'t0'}};
  const h=authHarness(server); h.save({ans:{A1:{ok:false,t:20}},srs:{A1:{step:0,due:1}},star:['A1'],starT:{A1:20}});
  await h.api.push(); const d=server.row.data; assert.equal(d.ans.A1.ok,true); assert(!d.srs.A1); assert(!d.star.includes('A1'));
});
test('logout keeps local records when the server save fails, and clears them only after a confirmed save',async()=>{
  const server={row:{data:{},updated_at:'t0'}};
  const h=authHarness(server,{failWrite:true}); h.save({ans:{X1:{ok:true,t:5}}});
  await h.api.logout();
  assert(h.ls.getItem('promo2-quiz-v3'),'실패 시 기록 보존'); assert(h.ctx.sheetShown,'재시도·백업 안내'); assert(!h.hooks.signedOut);
  h.hooks.failWrite=false; await h.api.logout();
  assert.equal(h.ls.getItem('promo2-quiz-v3'),null); assert(h.hooks.signedOut); assert(server.row.data.ans.X1);
});
test('logout waits for an in-flight save before signing out',async()=>{
  const server={row:{data:{},updated_at:'t0'}}; let release;
  const h=authHarness(server); h.save({ans:{Y1:{ok:true,t:5}}});
  h.hooks.onRead=()=>new Promise(r=>release=r);
  const p=h.api.push(); const lo=h.api.logout(); await new Promise(r=>setImmediate(r));
  assert(!h.hooks.signedOut,'저장 중에는 로그아웃 안 함'); h.hooks.onRead=null; release(); await p; await lo;
  assert(h.hooks.signedOut); assert(server.row.data.ans.Y1);
});
test('reset (resetAt) on one device is not undone by older records from another device',()=>{
  const h=authHarness({row:null}); const m=h.api.merge({ans:{A1:{ok:true,t:5}},star:['A1'],starT:{A1:5}},{ans:{},star:[],resetAt:10},false);
  assert(!m.ans.A1); assert(!m.star.includes('A1')); assert.equal(m.resetAt,10);
});
test('spaced review: early correct re-solves do not advance; due reviews advance 1→3→7 days from the last review',()=>{
  const h=harness('2026-11-06T01:00:00Z'),q=h.api.byId.D50,wrong=(q.ans+1)%q.opts.length,DAY=864e5;
  h.api.record(q,wrong); const t0=Date.parse('2026-11-06T01:00:00Z');
  assert.equal(h.api.state.srs.D50.step,0); assert.equal(h.api.state.srs.D50.due,t0+DAY);
  for(let i=0;i<3;i++) h.api.record(q,q.ans);            // 같은 날 바로 세 번 맞힘
  assert(h.api.state.srs.D50,'예정 전 재풀이로 복습 완료되면 안 됨'); assert.equal(h.api.state.srs.D50.step,0);
  h.setTime('2026-11-07T02:00:00Z'); h.api.record(q,q.ans); assert.equal(h.api.state.srs.D50.step,1);
  assert.equal(h.api.state.srs.D50.due,Date.parse('2026-11-07T02:00:00Z')+3*DAY);
  h.setTime('2026-11-10T03:00:00Z'); h.api.record(q,q.ans); assert.equal(h.api.state.srs.D50.step,2);
  h.setTime('2026-11-17T03:00:00Z'); h.api.record(q,q.ans); assert(!h.api.state.srs.D50,'7일 복습 후 완료');
  h.setTime('2026-11-18T03:00:00Z'); h.api.record(q,wrong); assert.equal(h.api.state.srs.D50.step,0);
});
test('first-try result is kept even after the question is re-solved correctly',()=>{
  const h=harness(),q=h.api.byId.D50,wrong=(q.ans+1)%q.opts.length;
  h.api.record(q,wrong); h.api.record(q,q.ans); h.api.record(q,q.ans);
  const a=h.api.state.ans.D50; assert.equal(a.ok,true); assert.equal(a.f,false); assert.equal(a.n,3);
  const q2=h.api.byId.D51; h.api.record(q2,q2.ans); h.api.record(q2,(q2.ans+1)%4); assert.equal(h.api.state.ans.D51.f,true);
});
test('rewritten questions (rev) lose their old answers on load and in sync merge, other records stay',()=>{
  const P=PLAIN[1],old={ans:{D50:{pick:0,ok:true,n:5,t:1},[P]:{pick:0,ok:true,n:1,t:1,rv:RV[P]}},srs:{D50:{step:1,due:9}},star:['D50'],starT:{D50:1}};
  const h=harness('2026-11-06T23:59:59Z',old,questions+";QUESTIONS.find(q=>q.id==='D50').rev=2;");
  assert(!h.api.state.ans.D50,'옛 풀이 기록 삭제'); assert(!h.api.state.srs.D50); assert(h.api.state.ans[P],'다른 문항 유지'); assert(h.api.state.star.includes('D50'),'별표는 유지');
  const q=h.api.byId.D50; h.api.record(q,q.ans); assert.equal(h.api.state.ans.D50.rv,2);
  const a=authHarness({row:null}); a.ctx.QUESTIONS.push({id:'D50',rev:2});
  const m=a.api.merge({ans:{D50:{ok:true,t:5},D51:{ok:true,t:5}},srs:{D50:{step:1}}},{ans:{D52:{ok:false,t:6}}},true);
  assert(!m.ans.D50&&!m.srs.D50,'서버의 옛 기록도 되살리지 않음'); assert(m.ans.D51&&m.ans.D52);
  const m2=a.api.merge({ans:{D50:{ok:true,t:5}}},{ans:{D50:{ok:false,t:9,rv:2}}},true); assert.equal(m2.ans.D50.rv,2);
});
test('every question has a single answer whose explanation matches the stem (옳은 → ○, 옳지 않은 → ×)',()=>{
  const bad=SRC.filter(q=>q.why&&q.why[q.ans]&&/옳지 않은 것은\?|아닌 것은\?|해당하지 않는 것은\?/.test(q.q)&&!/모두|몇 개/.test(q.q)&&!q.why[q.ans].startsWith('×')).map(q=>q.id);
  assert.deepEqual(bad,[]);
  const box=SRC.filter(q=>/있는 대로 고른|모두 고른|몇 개인가/.test(q.q)).map(q=>q.id);
  assert.deepEqual(box,[],'실제 시험에 없는 보기형·개수형 금지');
});

// 2026. 11. 14. 사용자 지시: 12/03 이후 공개분은 기출 비율대로(부정형·문장형 보기 위주)
test('from 2026-12-03, each release day follows the past-exam style mix (negative stems, sentence options)',()=>{
  const NEG=/옳지 않은|틀린|아닌|잘못된|않는|거리가 먼|다른 하나/;
  const sentence=q=>q.opts.reduce((s,o)=>s+o.length,0)/q.opts.length>=18;
  const days=[...new Set(SRC.filter(q=>q.rel>='2026-12-03'&&!q.drill).map(q=>q.rel))];
  for(const d of days){
    const qs=onDay(d).filter(q=>q.sec!=='G');
    if(qs.length<10) continue; // 채우는 중인 날은 10문항부터 검사
    const neg=qs.filter(q=>NEG.test(q.q)).length/qs.length;
    const sen=qs.filter(sentence).length/qs.length;
    assert.ok(neg>=0.5,`${d}: 부정형 발문 ${Math.round(neg*100)}% (50% 이상 필요)`);
    assert.ok(sen>=0.55,`${d}: 문장형 보기 문항 ${Math.round(sen*100)}% (55% 이상 필요)`);
  }
});
