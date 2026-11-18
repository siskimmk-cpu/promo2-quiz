// 기출 형식 검사(2026. 11. 18. 사용자 지시: 사이트 문항을 전부 실제 시험처럼 간결한 기출 형식으로)
// 규칙: 발문 60자 이하 한 줄, 보기 평균 40자 이하·각 55자 이하, case(사례 지문)·box(<보기>) 없음, 발문에 판례 번호 없음.
// 이 규칙에 걸리는 문항은 앱(app.js isHidden)에서 숨겨지고, 고쳐 쓰면 다시 나온다. off:1 은 영구 숨김(지엽·범위 밖).
// 사용: node tools/fmtcheck.js           → 형식 위반 문항 목록(공개일 순)
//       node tools/fmtcheck.js --json    → {count, ids:[...]} 
const CASE_NO=/\d{2,4}(다|두|도|나|가합|가단)\d{2,}/;
const offFormat=q=>!!(q.case||q.box||q.q.length>60||(q.opts||[]).join('').length/4>40||(q.opts||[]).some(o=>o.length>55)||CASE_NO.test(q.q));
module.exports={offFormat,CASE_NO};
if(require.main===module){
  const fs=require('fs'),path=require('path');
  const Q=new Function(fs.readFileSync(path.join(__dirname,'..','questions.js'),'utf8')+';return QUESTIONS;')();
  const HIDE=/해상|운송보험|운송인|선박|적하|공동해손|선하증권/;
  const bad=Q.filter(q=>!q.drill&&!q.past&&!q.off&&!(q.tags||[]).includes('계산')&&!HIDE.test(q.q+q.opts.join(''))&&offFormat(q))
    .sort((a,b)=>(a.rel||'').localeCompare(b.rel||''));
  const why=q=>[q.case&&'사례',q.box&&'보기형',q.q.length>60&&`발문${q.q.length}자`,(q.opts.join('').length/4>40||q.opts.some(o=>o.length>55))&&'보기 김',CASE_NO.test(q.q)&&'판례번호'].filter(Boolean).join(',');
  if(process.argv.includes('--json')) console.log(JSON.stringify({count:bad.length,ids:bad.map(q=>q.id)}));
  else { bad.forEach(q=>console.log(q.id,q.rel||'-',why(q))); console.log('형식 위반',bad.length,'문항 (숨김 중)'); }
}
