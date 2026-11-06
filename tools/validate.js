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
  if((q.tags||[]).includes('계산')) bad('계산 문제 금지');
  if(q.rel!==undefined&&!/^\d{4}-\d{2}-\d{2}$/.test(q.rel)) bad('rel은 YYYY-MM-DD');
  if(/§/.test(q.q+q.exp+q.ref+(q.opts||[]).join('')+(q.why||[]).join(''))) bad('§ 금지(제N조 제N항 한글 표기)');
  { const REF={A:/약관/,B:/약관/,C:/약관|자배법|자동차손해배상/,D:/상법|대법|판례|약관|보험계약법/,F:/자배법|자동차손해배상|민법|대법|판례/,E:/손해사정|상법|민법|판례|약관|보험/};
    const r=REF[q.sec]; if(r&&!r.test(q.ref)) bad('ref가 과목 근거와 맞지 않음(시험과목 범위 확인)');
    const OUT=/형사소송|행정소송|세법|소득세|부가가치세|역사|문학|스포츠|연예|드라마|영화/; if(OUT.test(q.q+(q.case||'')+q.ref)) bad('시험과목 밖 소재'); }
  if(!Array.isArray(q.why)||q.why.length!==q.opts.length) bad('why(보기별 해설) 누락 또는 개수 불일치');
}
const cnt={};QUESTIONS.forEach(q=>cnt[q.sec]=(cnt[q.sec]||0)+1);
const pos=[0,0,0,0,0];QUESTIONS.forEach(q=>pos[q.ans]++);console.log('정답 위치 분포',pos.slice(0,4).join('/'),'· 5번',pos[4],'(5지선다 '+QUESTIONS.filter(q=>q.opts.length===5).length+'문항 중)');
const rel={};QUESTIONS.forEach(q=>{if(q.rel)rel[q.rel]=(rel[q.rel]||0)+1;});if(Object.keys(rel).length)console.log('예약 공개',JSON.stringify(rel));
console.log('총',QUESTIONS.length,'문항',cnt,err?`오류 ${err}건`:'OK');process.exit(err?1:0);
