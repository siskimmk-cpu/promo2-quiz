// 검증할 문항 고르기 — 검증 예약 작업이 매 실행 처음에 돌린다.
// node tools/verify-pick.js [--n 25] [--json]
// 우선순위: ① 앞으로 3일 안에 공개될 문항 중 미검증  ② 이미 공개된 문항 중 미검증(근거 URL 없는 것 먼저)
//          ③ 아직 공개 전인 나머지 미검증 비축 문항(공개일 가까운 순)  ④ 검증한 지 14일 넘은 문항(오래된 순)
// 검증을 마친 문항에는 verifiedAt(YYYY-MM-DD, KST)을 적는다.
const fs=require('fs'),path=require('path');
const Q=new Function(fs.readFileSync(path.join(__dirname,'..','questions.js'),'utf8')+';return QUESTIONS')();
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i>0?process.argv[i+1]:d;};
const N=+arg('--n',25);
const kst=new Date(Date.now()+9*36e5), today=kst.toISOString().slice(0,10);
const add=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
const soon=add(today,3), stale=add(today,-14);
const released=q=>!q.rel||q.rel<=today;
const g1=Q.filter(q=>q.rel&&q.rel>today&&q.rel<=soon&&!q.verifiedAt).sort((a,b)=>a.rel.localeCompare(b.rel));
const g2=Q.filter(q=>released(q)&&!q.verifiedAt).sort((a,b)=>(!!a.sourceUrl-!!b.sourceUrl)||((a.rel||'')<(b.rel||'')?1:-1));
const g2b=Q.filter(q=>q.rel&&q.rel>soon&&!q.verifiedAt).sort((a,b)=>a.rel.localeCompare(b.rel));
const g3=Q.filter(q=>q.verifiedAt&&q.verifiedAt<stale).sort((a,b)=>a.verifiedAt.localeCompare(b.verifiedAt));
const pick=[...g1,...g2,...g2b,...g3].slice(0,N);
const stat={today,total:Q.length,verified:Q.filter(q=>q.verifiedAt).length,upcomingUnverified:g1.length,releasedUnverified:g2.length,stockUnverified:g2b.length,staleVerified:g3.length};
if(process.argv.includes('--json')) console.log(JSON.stringify({stat,ids:pick.map(q=>q.id)}));
else{console.log(JSON.stringify(stat));pick.forEach(q=>console.log(q.id,q.sec,q.rel||'-',q.sourceUrl?'src':'nosrc',q.q.slice(0,60)));}
