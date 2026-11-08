// 오프라인 지원: 네트워크 우선, 실패하면 캐시
const C='promo2-202611081258';
self.addEventListener('install',e=>{ self.skipWaiting(); e.waitUntil(caches.open(C).then(c=>c.addAll(['./','index.html','manifest.webmanifest','icon-192.png']).catch(()=>{}))); });
// 로그인 도입(2026-11-06 12:53) 이전 화면을 캐시로 쓰던 기기: 옛 캐시를 지우고 열린 창을 새로 불러와 로그인 화면으로 보낸다.
// 로그인 이후 버전끼리 업데이트할 때는 풀이 중 화면을 강제로 새로고침하지 않는다(앱이 안전한 시점에 반영).
const GATE='promo2-202611061253';
self.addEventListener('activate',e=>{ e.waitUntil((async()=>{
  const keys=await caches.keys(); const OWN=/^promo2-(v\d+|\d{12})$/; const old=keys.filter(k=>k!==C&&OWN.test(k)); // 이 앱(promo2-…) 캐시만 정리, 같은 도메인의 다른 앱 캐시는 건드리지 않음
  const preLogin=old.some(k=>k==='promo2-v1'||(/^promo2-\d{12}$/.test(k)&&k<GATE));
  await Promise.all(old.map(k=>caches.delete(k)));
  await self.clients.claim();
  if(preLogin){ const cs=await self.clients.matchAll({type:'window'}); cs.forEach(c=>{ try{ c.navigate(c.url.split('?')[0]); }catch(_){} }); }
})()); });
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET'||new URL(r.url).origin!==location.origin) return;
  if(r.url.includes('version.json')) return;
  const fresh=r.mode==='navigate'||/\.(js|html|json)(\?|$)/.test(r.url);
  e.respondWith((fresh?fetch(r.url,{cache:'no-cache',credentials:'same-origin'}):fetch(r)).then(res=>{ if(res.ok){ const cp=res.clone(); caches.open(C).then(c=>c.put(r,cp)); } return res; })
    .catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||caches.match('index.html'))));
});
