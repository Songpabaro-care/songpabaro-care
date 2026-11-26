# 같은 환축에 두 기기가 동시에 기록해도 사라지지 않는지 (ETag 지원/미지원 둘 다)
import json,re,asyncio,hashlib,sys
from playwright.async_api import async_playwright
ETAG = '--noetag' not in sys.argv
DB={}
def get(path):
    o=DB
    for k in [x for x in path.split('/') if x]:
        if isinstance(o,list):
            k=int(k)
            if k>=len(o): return None
            o=o[k];continue
        if not isinstance(o,dict) or k not in o: return None
        o=o[k]
    return o
def setp(path,v,patch=False):
    ks=[x for x in path.split('/') if x];o=DB
    for k in ks[:-1]: o=o.setdefault(k,{})
    if v is None: o.pop(ks[-1],None)
    elif patch: o.setdefault(ks[-1],{}).update(v)
    else: o[ks[-1]]=v
def et(v): return hashlib.md5(json.dumps(v,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
H={"Access-Control-Allow-Origin":"*","Access-Control-Expose-Headers":"ETag"}
async def handle(route):
    r=route.request;u=r.url
    if 'accounts:signUp' in u: return await route.fulfill(json={"localId":"UIDtest99ZZ","idToken":"T","refreshToken":"R","expiresIn":"3600"})
    if 'securetoken' in u: return await route.fulfill(json={"user_id":"UIDtest99ZZ","id_token":"T","refresh_token":"R","expires_in":"3600"})
    m=re.match(r'https://[^/]+firebasedatabase\.app(/.*?)\.json',u)
    if not m: return await route.abort()
    path=m.group(1); hd=r.headers
    await asyncio.sleep(0.15)
    if r.method=='GET':
        if hd.get('accept')=='text/event-stream':
            return await route.fulfill(status=200,headers={"Content-Type":"text/event-stream"},body="event: put\ndata: "+json.dumps({"path":"/","data":get(path)})+"\n\n")
        v=get(path);h=dict(H)
        if ETAG and hd.get('x-firebase-etag')=='true': h['ETag']=et(v)
        return await route.fulfill(status=200,headers=h,content_type='application/json',body=json.dumps(v))
    body=r.post_data
    if ETAG and r.method=='PUT' and hd.get('if-match') and hd.get('if-match')!=et(get(path)):
        return await route.fulfill(status=412,headers=H,json=get(path))
    v=json.loads(body) if body else None
    setp(path,v if r.method!='DELETE' else None,patch=r.method=='PATCH')
    return await route.fulfill(headers=H,json=v)
async def main():
    DB.update({"admins":{"UIDtest99ZZ":True},"devices":{"UIDtest99ZZ":{"name":"원장님 폰","ok":True}},
      "rooms":{"songpa-baro-care":{"care_patients":{"h1":{"id":"h1","name":"초코","room":"1","chartNo":"1","species":"dog","category":"입원","logs":[{"id":"l1000","time":"01:00","text":"기존"}]}}}}})
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome');errs=[];pgs=[]
        for _ in range(2):
            ctx=await b.new_context();pg=await ctx.new_page();pg.on('pageerror',lambda e:errs.append(str(e)))
            await pg.route(re.compile(r'^https://'),handle)
            await pg.goto('http://localhost:8123/index.html',wait_until='domcontentloaded');await pg.wait_for_timeout(2500);pgs.append(pg)
        add="""(t)=>{const p=S.p.care.find(x=>x.id==='h1');p.logs=p.logs||[];p.logs.unshift({id:'l'+Date.now()+t,time:'02:00',text:t});save('care')}"""
        for i in range(10):
            await asyncio.gather(pgs[0].evaluate(add,'A'+str(i)),pgs[1].evaluate(add,'B'+str(i)))
            await pgs[0].wait_for_timeout(250)
        await pgs[0].wait_for_timeout(6000)
        L=get('/rooms/songpa-baro-care/care_patients/h1/logs') or []
        txt=sorted(x['text'] for x in L)
        print('ETag' if ETAG else 'noETag','server logs',len(L),'/ 21', 'missing',[t for t in ['A'+str(i) for i in range(10)]+['B'+str(i) for i in range(10)]+['기존'] if t not in txt])
        # 삭제도 반영되는지
        await pgs[0].evaluate("deleteLog('h1','l1000')");await pgs[0].wait_for_timeout(2500)
        L=get('/rooms/songpa-baro-care/care_patients/h1/logs') or []
        print('after delete',len(L),'기존 남음' if any(x['text']=='기존' for x in L) else '기존 삭제됨')
        print('errors',errs);await b.close()
asyncio.run(main())
