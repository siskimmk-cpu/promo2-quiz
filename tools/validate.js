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
  if(q.rel!==undefined&&!/^\d{4}-\d{2}-\d{2}$/.test(q.rel)) bad('rel은 YYYY-MM-DD');
  if(/§/.test(q.q+q.exp+q.ref+(q.opts||[]).join('')+(q.why||[]).join(''))) bad('§ 금지(제N조 제N항 한글 표기)');
  { const REF={A:/약관/,B:/약관/,C:/약관|자배법|자동차손해배상/,D:/상법|대법|판례|약관|보험계약법/,F:/자배법|자동차손해배상|민법|대법|판례/,E:/손해사정|상법|민법|판례|약관|보험/};
    const r=REF[q.sec]; if(r&&!r.test(q.ref)) bad('ref가 과목 근거와 맞지 않음(시험과목 범위 확인)');
    const FAM=/민법 제100[0-9]조|친권/; if(FAM.test(q.q+(q.case||'')+q.ref)&&!/공제약관 26 지급기준/.test(q.ref)) bad('민법 상속·가족법은 공제약관 지급기준(사망 위자료 청구권자) 문항에서만');
    const OUT=/보험업법|개인정보 보호법|여객자동차|공제규정|형사소송|행정소송|세법|소득세|부가가치세|역사|문학|스포츠|연예|드라마|영화/; if(OUT.test(q.q+(q.case||'')+q.ref)) bad('시험과목 밖 소재'); }
  if(q.why!==undefined&&(!Array.isArray(q.why)||q.why.length!==q.opts.length)) bad('why(보기별 해설) 개수 불일치');
  else if(q.why) { const mk=q.why.map(w=>(String(w).trim().match(/^[○×]/)||[''])[0]);
    if(mk.some(m=>!m)) bad('why는 보기마다 ○ 또는 ×로 시작해야 함');
    else { const a=mk[q.ans]; if(mk.filter(m=>m===a).length!==1) bad('정답 보기만 ○/× 표시가 달라야 함(why와 ans 불일치)'); } }
  if(/다음 사례|사례에서|다음 사안/.test(q.q)&&!q.case&&!q.box) bad('발문이 사례를 가리키는데 case(사례 본문)가 없음');
  if(q.verifiedAt!==undefined&&!/^\d{4}-\d{2}-\d{2}$/.test(q.verifiedAt)) bad('verifiedAt은 YYYY-MM-DD');
}
const cnt={};QUESTIONS.forEach(q=>cnt[q.sec]=(cnt[q.sec]||0)+1);
const pos=[0,0,0,0,0];QUESTIONS.forEach(q=>pos[q.ans]++);console.log('정답 위치 분포',pos.slice(0,4).join('/'),'· 5번',pos[4],'(5지선다 '+QUESTIONS.filter(q=>q.opts.length===5).length+'문항 중)');
const rel={};QUESTIONS.forEach(q=>{if(q.rel)rel[q.rel]=(rel[q.rel]||0)+1;});if(Object.keys(rel).length)console.log('예약 공개',JSON.stringify(rel));
console.log('총',QUESTIONS.length,'문항',cnt,err?`오류 ${err}건`:'OK');process.exit(err?1:0);
