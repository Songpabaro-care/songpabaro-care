/* 케어 노트 서비스 워커: 항상 인터넷에서 최신 화면을 먼저 받고, 끊겼을 때만 저장해 둔 화면을 보여 줍니다.
   환축 기록(DB)은 여기서 저장하지 않습니다. */
const C="carenote-shell-v1";
self.addEventListener("install",e=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k!==C)await caches.delete(k);await self.clients.claim()})()));
self.addEventListener("fetch",e=>{const r=e.request,u=new URL(r.url);
 if(r.method!=="GET"||u.origin!==location.origin)return;
 e.respondWith((async()=>{try{const res=await fetch(r,{cache:"no-store"});if(res.ok&&r.mode==="navigate"){const c=await caches.open(C);c.put(u.pathname,res.clone())}return res}
  catch(x){const hit=await caches.match(u.pathname)||await caches.match(r);if(hit)return hit;throw x}})())});
