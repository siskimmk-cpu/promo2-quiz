// 오프라인 지원: 네트워크 우선, 실패하면 캐시
const C='promo2-202611061330';
self.addEventListener('install',e=>{ self.skipWaiting(); e.waitUntil(caches.open(C).then(c=>c.addAll(['./','index.html','manifest.webmanifest','icon-192.png']).catch(()=>{}))); });
self.addEventListener('activate',e=>{ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET'||new URL(r.url).origin!==location.origin) return;
  if(r.url.includes('version.json')) return;
  const fresh=r.mode==='navigate'||/\.(js|html|json)(\?|$)/.test(r.url);
  e.respondWith((fresh?fetch(r.url,{cache:'no-cache',credentials:'same-origin'}):fetch(r)).then(res=>{ if(res.ok){ const cp=res.clone(); caches.open(C).then(c=>c.put(r,cp)); } return res; })
    .catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||caches.match('index.html'))));
});
