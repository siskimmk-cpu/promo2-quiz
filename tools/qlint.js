// 문항 품질 점검(경고만, 실패 아님): node tools/qlint.js — 유사 문항 쌍, 정답만 길거나 짧은 보기, 절대어 보기, 같은 보기 반복
const fs=require('fs');const Q=new Function(fs.readFileSync(require('path').join(__dirname,'..','questions.js'),'utf8')+';return QUESTIONS')();
const norm=s=>s.replace(/[\s.,·()「」"'?<>\-–—:;]/g,'');
const grams=s=>{const t=norm(s),g=new Set();for(let k=0;k<t.length-1;k++)g.add(t.slice(k,k+2));return g;};
const sim=(a,b)=>{let n=0;for(const x of a)if(b.has(x))n++;return n/Math.max(1,a.size+b.size-n);};
const out={dup:[],len:[],abs:[],same:[],stem:[]};
const G=Q.map(q=>({q,g:grams(q.q+' '+q.opts.join(' '))}));
for(let i=0;i<G.length;i++)for(let j=i+1;j<G.length;j++){const s=sim(G[i].g,G[j].g);if(s>=0.42)out.dup.push(`${G[i].q.id}~${G[j].q.id} ${s.toFixed(2)}`);}
const ABS=/어떤 경우에도|아무것도|아무런|재원이 없|전혀 없|무조건|모든 경우|언제나|절대/;
for(const q of Q){const L=q.opts.map(o=>o.length);const a=L[q.ans];const others=L.filter((_,i)=>i!==q.ans);const mx=Math.max(...others),mn=Math.min(...others);
 if(a>mx*1.3&&a-mx>12)out.len.push(`${q.id} 정답만 김 ${a} vs ${mx}`);
 if(a<mn*0.5&&mn-a>15)out.len.push(`${q.id} 정답만 짧음 ${a} vs ${mn}`);
 const absIdx=q.opts.map((o,i)=>ABS.test(o)?i:-1).filter(i=>i>=0);if(absIdx.length)out.abs.push(`${q.id} [${absIdx}] ans${q.ans}: `+absIdx.map(i=>q.opts[i]).join(' | '));
 if(new Set(q.opts).size<q.opts.length)out.same.push(q.id);
 if(/옳지 않은|틀린/.test(q.q)&&/옳은 것은\?$/.test(q.q))out.stem.push(q.id);
 if(!/[?？]$/.test(q.q.trim().replace(/\)$/,'?')))out.stem.push(q.id+' 물음표없음: '+q.q.slice(-25));
}
for(const k in out){console.log('== '+k+' '+out[k].length);out[k].forEach(x=>console.log(x));}
