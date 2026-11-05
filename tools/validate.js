// 사용법: node tools/validate.js  — questions.js 구조·정답 인덱스·ID 중복 검사
const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','questions.js'),'utf8')+';module.exports={QUESTIONS,SECTIONS,SUBJECTS};';
const tmp=path.join(require('os').tmpdir(),'q_validate.js');fs.writeFileSync(tmp,src);
const {QUESTIONS,SECTIONS,SUBJECTS}=require(tmp);
const secs=new Set(SECTIONS.map(s=>s.id));const ids=new Set();let err=0;
for(const q of QUESTIONS){
  const bad=m=>{console.error(q.id||'(no id)',m);err++;};
  if(!q.id) bad('id 없음'); if(ids.has(q.id)) bad('ID 중복'); ids.add(q.id);
  if(!secs.has(q.sec)) bad('sec 오류');
  if(!q.q||!q.exp||!q.ref) bad('q/exp/ref 누락');
  if(!Array.isArray(q.opts)||q.opts.length<4||q.opts.length>5) bad('opts는 4~5개');
  if(!(Number.isInteger(q.ans)&&q.ans>=0&&q.ans<q.opts.length)) bad('ans 범위 오류');
  if(q.type) bad('type 필드 금지(전부 객관식)');
}
const cnt={};QUESTIONS.forEach(q=>cnt[q.sec]=(cnt[q.sec]||0)+1);
console.log('총',QUESTIONS.length,'문항',cnt,err?`오류 ${err}건`:'OK');process.exit(err?1:0);
