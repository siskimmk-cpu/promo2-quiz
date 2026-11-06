// 공개일별 신규 문항 수 확인 — 예약 작업이 매 실행 처음과 끝에 돌린다.
// node tools/schedule.js            → 표 출력
// node tools/schedule.js --json     → {now, eligible:[{date,have,target,need}], totalNeed}
// 신규 문항 = rel이 그 날짜인 문항(검토일 reviewedAt·근거 sourceUrl 있는 것만 셈). 오전 9시(KST) 공개 2시간 전까지만 채울 수 있는 날짜로 본다.
const fs=require('fs'),path=require('path');
const Q=new Function(fs.readFileSync(path.join(__dirname,'..','questions.js'),'utf8')+';return QUESTIONS')();
const EXAM='2026-12-18';
const target=d=>d>='2026-11-07'&&d<EXAM?30:0;
const kst=new Date(Date.now()+9*36e5), today=kst.toISOString().slice(0,10), hour=kst.getUTCHours();
const add=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
const first=hour<7?today:add(today,1); // 오늘 9시 공개분은 07시 전 실행까지만 보충
const rows=[];for(let i=0;i<8;i++){const d=add(first,i);const have=Q.filter(q=>q.rel===d&&q.reviewedAt&&(q.sourceUrl||q.ref)).length;rows.push({date:d,have,target:target(d),need:Math.max(0,target(d)-have)});}
const all={};Q.forEach(q=>{if(q.rel&&q.rel>=today)all[q.rel]=(all[q.rel]||0)+1;});
if(process.argv.includes('--json')) console.log(JSON.stringify({now:kst.toISOString().replace('Z','+09:00'),eligible:rows,totalNeed:rows.reduce((s,r)=>s+r.need,0),futureByDate:all}));
else{console.log('KST',kst.toISOString().slice(0,16).replace('T',' '),'| 보충 가능 첫 날짜',first);rows.forEach(r=>console.log(r.date,'보유',String(r.have).padStart(2),'/ 목표',r.target,r.need?'→ 부족 '+r.need:''));console.log('오늘 이후 예약 전체:',JSON.stringify(all));}
