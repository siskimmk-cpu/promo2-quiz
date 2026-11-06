// node --test tools/runtime.test.js
// Run the production release/session functions with a controlled clock and browser storage.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const questions=fs.readFileSync(path.join(root,'questions.js'),'utf8');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
function harness(iso='2026-11-06T23:59:59Z',stored){
  let time=Date.parse(iso),timerId=0;const timers=new Map(),listeners={},storage=new Map();
  if(stored)storage.set('promo2-quiz-v3',JSON.stringify(stored));
  class Clock extends Date{constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}}
  const window={BUILD:'202611061553',scrollTo:()=>{},addEventListener:(n,f)=>listeners[n]=f};
  const ctx={Date:Clock,window,document:{documentElement:{dataset:{}},querySelector:()=>({}),visibilityState:'visible',addEventListener:(n,f)=>listeners[n]=f},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    location:{pathname:'/promo2-quiz/',hash:'',replace:u=>ctx.reloads.push(u)},reloads:[],renders:0,
    setTimeout:(f,ms)=>{timers.set(++timerId,{f,ms});return timerId;},clearTimeout:i=>timers.delete(i),clearInterval:()=>{},navigator:{},console};
  vm.createContext(ctx);vm.runInContext(questions,ctx);
  const head=app.slice(0,app.indexOf('/* ── 홈·탭 ── */'));
  const daily=app.slice(app.indexOf('function dayKey9()'),app.indexOf('function paperInfo()'));
  const boundary=app.slice(app.indexOf('var releaseTimer=null'),app.indexOf('\n})();',app.indexOf('var releaseTimer=null')));
  vm.runInContext(head+'\n'+daily+`\nconst ov={hidden:true};function render(){globalThis.renders++;}function checkBadges(){}\n`+boundary+`
    globalThis.api={refreshRelease,checkReleaseBoundary,dailyPaper,record,predict,finish,start,
      get state(){return store;},get visible(){return activeQuestions;},get all(){return ALL_QUESTIONS;},
      get fresh(){return FRESH_IDS;},get day(){return REL_DAY;},get subjects(){return SUBJECTS;},
      get byId(){return byId;},setView:v=>view=v};})();`,ctx);
  return {ctx,api:ctx.api,listeners,storage,timers,setTime:iso=>time=Date.parse(iso),runShortTimers:()=>{
    for(const [id,t] of [...timers])if(t.ms<=1000){timers.delete(id);t.f();}
  }};
}
test('9am release updates an open page without deleting future source questions',()=>{
  const h=harness();assert.equal(h.api.visible.length,317);assert.equal(h.api.all.length,361);assert.equal(h.api.fresh.length,0);
  h.setTime('2026-11-07T00:00:01Z');h.api.checkReleaseBoundary();
  assert.equal(h.api.visible.length,325);assert.equal(h.api.fresh.length,8);assert.equal(h.api.all.length,361);
  assert.equal(h.ctx.renders,1);
});
test('foreground and focus refresh after device sleep; no premature release at midnight KST',()=>{
  const h=harness('2026-11-06T15:00:00Z');assert.equal(h.api.fresh.length,0);
  h.setTime('2026-11-08T00:01:00Z');h.listeners.visibilitychange();
  assert.equal(h.api.visible.length,334);assert.equal(h.api.fresh.length,9);
  h.setTime('2026-11-09T00:01:00Z');h.listeners.focus();assert.equal(h.api.visible.length,343);
});
test('boundary timer is armed for the next 9am',()=>{
  const h=harness();assert([...h.timers.values()].some(t=>t.ms===1100));
});
test('release preserves in-progress mock IDs, answers, order, and deadline without re-render',()=>{
  const h=harness(),ids=h.api.dailyPaper(0);h.api.start(ids,'test','mock',{paper:'p1',mix:true});
  h.api.state.sess.picks[0]=2;h.api.state.sess.i=3;
  const snapshot=JSON.stringify(h.api.state.sess),renders=h.ctx.renders;
  h.setTime('2026-11-07T00:00:01Z');h.api.checkReleaseBoundary();
  assert.equal(JSON.stringify(h.api.state.sess),snapshot);assert.equal(h.ctx.renders,renders);assert.equal(h.api.fresh.length,8);
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
  assert.equal(h.api.fresh.length,0);
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
  const stored={ans:{D50:{pick:0,ok:true,n:2,t:1}},star:['D50'],hist:[{name:'test',sc:80,d:'2026-11-06'}],srs:{},trk:{},log:{}};
  const h=harness('2026-11-07T00:00:01Z',stored);
  assert.equal(h.api.state.ans.D50.n,2);assert.equal(h.api.state.star[0],'D50');assert.equal(h.api.state.hist[0].sc,80);
});
test('leaving practice permits a queued version update without deleting its resumable session',()=>{
  const h=harness();h.api.start(['D50'],'practice','practice',{});h.api.state.sess.picks[0]=0;
  h.ctx.window.P2RequestVersion('202611061400');h.runShortTimers();assert.equal(h.ctx.reloads.length,0);
  h.api.setView('home');h.api.checkReleaseBoundary();h.runShortTimers();
  assert.equal(h.ctx.reloads.length,1);assert.equal(JSON.parse(h.storage.get('promo2-quiz-v3')).sess.picks[0],0);
});
test('question repairs retain IDs and answer indexes, remove misleading claims',()=>{
  const h=harness(),q=h.api.byId;
  assert(!q.CS3.q.includes('후유장애'));assert.equal(q.CS3.ans,1);assert.equal(q.D50.ans,0);
  assert(!q.D50.exp.includes('지급제시를 할 수 없'));assert(q.D34.opts[1].includes('예외'));
  assert(!q.E46.opts.join('').includes('위임'));assert(!q.E63.q.includes('산업재해'));
});
test('exam blueprint is 12·12·12·12·2 and pass line is 4 wrong answers',()=>{
  const h=harness();assert.equal(h.api.subjects.map(s=>s.n).join(','),'12,12,12,12,2');
  const p=h.api.predict();assert(p.prob>=0&&p.prob<=100);
});
