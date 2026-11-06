// node tools/dupcheck.js [--since YYYY-MM-DD]
// 새 문항이 기존 문항과 거의 같은지 검사(발문+보기 글자 2-gram 유사도). 0.6 이상(자카드)이면 실패.
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','questions.js'),'utf8');
const Q=new Function(src+';return QUESTIONS')();
const i=process.argv.indexOf('--since'), since=i>0?process.argv[i+1]:null;
const norm=s=>s.replace(/[\s.,·()「」"'?<>\-–—:;]/g,'');
const grams=s=>{const t=norm(s),g=new Set();for(let k=0;k<t.length-1;k++)g.add(t.slice(k,k+2));return g;};
const sim=(a,b)=>{let n=0;for(const x of a)if(b.has(x))n++;return n/Math.max(1,a.size+b.size-n);};
const body=q=>[q.q,q.case||'',(q.box||[]).join(' '),q.opts.filter(o=>o.length>8).join(' ')].join(' ');
const G=Q.map(q=>({id:q.id,rel:q.rel||'',g:grams(body(q))}));
const targets=since?G.filter(x=>x.rel>=since):G;
let bad=[];
for(const a of targets) for(const b of G){ if(a.id===b.id) continue; if(!since&&a.id>b.id) continue;
  const s=sim(a.g,b.g); if(s>=0.6) bad.push(`${a.id} ≈ ${b.id} (${s.toFixed(2)})`); }
bad=[...new Set(bad)];
if(bad.length){ console.log('중복 의심',bad.length+'건\n'+bad.join('\n')); process.exit(since?1:0); }
console.log('중복 의심 없음'+(since?` (rel ≥ ${since})`:''));
