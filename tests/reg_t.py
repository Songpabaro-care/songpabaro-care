import json,re,asyncio
from playwright.async_api import async_playwright
DB={}
def get(path):
    o=DB
    for k in [x for x in path.split('/') if x]:
        if not isinstance(o,dict) or k not in o: return None
        o=o[k]
    return o
def setp(path,v,patch=False):
    ks=[x for x in path.split('/') if x];o=DB
    for k in ks[:-1]: o=o.setdefault(k,{})
    if v is None: o.pop(ks[-1],None)
    elif patch: o.setdefault(ks[-1],{}).update(v)
    else: o[ks[-1]]=v
LOG=[]
async def handle(route):
    r=route.request;u=r.url
    if 'accounts:signUp' in u: return await route.fulfill(json={"localId":"UIDtest99ZZ","idToken":"T","refreshToken":"R","expiresIn":"3600"})
    if 'securetoken' in u: return await route.fulfill(json={"user_id":"UIDtest99ZZ","id_token":"T","refresh_token":"R","expires_in":"3600"})
    m=re.match(r'https://[^/]+firebasedatabase\.app(/.*?)\.json',u)
    if not m: return await route.abort()
    path=m.group(1)
    LOG.append(r.method+' '+path)
    if r.method=='GET':
        if r.headers.get('accept')=='text/event-stream':
            return await route.fulfill(status=200,headers={"Content-Type":"text/event-stream"},body="event: put\ndata: "+json.dumps({"path":"/","data":get(path)})+"\n\n")
        return await route.fulfill(json=get(path))
    body=r.post_data
    if r.method=='POST':
        import random,string
        key='-N'+''.join(random.choice(string.ascii_letters) for _ in range(10))
        _o=json.loads(body)
        if isinstance(_o.get('t'),dict): _o['t']=int(__import__('time').time()*1000)
        setp(path+'/'+key,_o);return await route.fulfill(json={'name':key})
    if path.startswith('/munjinNo/') and r.method=='PUT' and get(path) is not None:
        return await route.fulfill(status=401,json={'error':'Permission denied'})
    v=json.loads(body) if body else None
    setp(path,v if r.method!='DELETE' else None,patch=r.method=='PATCH')
    return await route.fulfill(json=v)
async def main():
    import time
    t=int(time.time()*1000)
    def L(i,mins,txt):return {"id":f"l{t-mins*60000}","time":time.strftime("%H:%M",time.localtime((t-mins*60000)/1000)),"d":time.strftime("%Y-%m-%d"),"text":txt}
    DB.update({"admins":{"UIDtest99ZZ":True},"devices":{"UIDtest99ZZ":{"name":"원장님 폰","ok":True}},
      "rooms":{"songpa-baro-care":{"chat":{
 "-a1":{"t":t-50*60000,"by":"1진료실 PC","uid":"U2","text":"초코 보호자분 2시에 면회 오신대요"},
 "-a2":{"t":t-42*60000,"by":"김간호사 폰","uid":"U3","text":"네 확인했습니다. 면회실 준비해 둘게요"},
 "-a5":{"t":t-3*60000,"by":"원장님 폰","uid":"UIDtest99ZZ","text":"나비 X-ray 먼저 부탁해요 🙏"}},
 "orders":{
 "-o1":{"t":t-30*60000,"by":"원장님 폰","uid":"UIDtest99ZZ","pname":"초코","chart":"20231187","room":"입원 2병실","tests":["CBC","혈청화학","전해질"],"memo":"수액 속도 조절 전 확인","urgent":False,"parts":{"lab":{"s":"ing","by":"김간호사 폰","t":t-25*60000}}},
 "-o2":{"t":t-8*60000,"by":"2진료실 PC","uid":"U4","pname":"나비","chart":"20240312","room":"입원 1병실","tests":["복부 방사선","요스틱"],"memo":"","urgent":True,"parts":{"img":{"s":"new"},"lab":{"s":"new"}}},
 "-o3":{"t":t-20*60000,"by":"1진료실 PC","uid":"U2","pname":"보리","chart":"20220541","room":"검진 1","tests":["복부 초음파","SDMA","T4"],"memo":"건강검진 패키지","urgent":False,"parts":{"img":{"s":"new"},"lab":{"s":"new"}}},
 "-o4":{"t":t-15*60000,"by":"3진료실 PC","uid":"U5","pname":"몽이","chart":"20250077","room":"외래","tests":["흉부 방사선"],"memo":"기침 2주","urgent":False,"parts":{"img":{"s":"new"}}},
 "-o5":{"t":t-12*60000,"by":"원장님 폰","uid":"UIDtest99ZZ","pname":"두부","chart":"20210933","room":"호텔 3","tests":["GLU"],"memo":"","urgent":False,"parts":{"lab":{"s":"new"}}},
 "-o6":{"t":t-70*60000,"by":"1진료실 PC","uid":"U2","pname":"루이","chart":"20230011","room":"외래","tests":["피부·귀 도말"],"memo":"","urgent":False,"parts":{"lab":{"s":"done","by":"박간호사 폰","t":t-60*60000}}}},
 "care_patients":{
        "h1":{"id":"h1","name":"초코","room":"입원 2병실","species":"dog","breed":"토이푸들","category":"입원","dx":"급성 췌장염 의심","adm":"2026-11-24","mjNo":"7054","mjAt":t,"cpAt":t-90*60000,
              "logs":[L(1,10,"BT · 38.6°C / HR · 118 bpm / BP · 135 mmHg (커프 #3) / 식욕 · 식욕 50%"),L(2,45,"메모 · 구토 1회, 노란 거품"),L(3,120,"수액 LRS 15 mL/h 유지")]},
        "h2":{"id":"h2","name":"나비","room":"입원 1병실","species":"cat","breed":"코숏","category":"입원","dx":"FLUTD","adm":"2026-11-25","logs":[L(4,30,"배뇨 · 소량 배뇨 / 메모 · 카테터 유지")]},
        "h3":{"id":"h3","name":"두부","room":"호텔 3","species":"dog","breed":"비숑","category":"호텔","logs":[]}},
        "checkup_patients":{"c1":{"id":"c1","name":"보리","room":"검진 1","species":"dog","breed":"말티즈","soap":{"s":"Decreased appetite (50%)","o":"","a":"Periodontal disease Grade 2","p":"Recheck in 6 months"},"pe":{"ment":"BAR","mm":"pink","crt":"<1.5sec"}}}}}})
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        errs=[]
        ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2)
        pg=await ctx.new_page();pg.on('pageerror',lambda e:errs.append(str(e)));await pg.route(re.compile(r'^https?://'),handle)
        await pg.goto('file:///home/claude/songpabaro-care/index.html',wait_until='domcontentloaded');await pg.wait_for_timeout(2000)
        await pg.evaluate("openP('care')");await pg.wait_for_timeout(300)
        await pg.fill('#fName','콩이');await pg.fill('#fRm','20251234');await pg.screenshot(path='reg1.png')
        await pg.click('[data-act=psave]');await pg.wait_for_timeout(600)
        cp=DB['rooms']['songpa-baro-care']['care_patients'];print([ (v.get('name'),v.get('chartNo'),v.get('room')) for v in (cp.values() if isinstance(cp,dict) else cp) if v and v.get('name')=='콩이'])
        await pg.screenshot(path='reg2.png')
        await pg.evaluate("openP('care')");await pg.fill('#fName','콩이2');await pg.fill('#fRm','20251234');await pg.click('[data-act=psave]');await pg.wait_for_timeout(300)
        print(await pg.evaluate("document.querySelector('.toast,#toast')&&document.querySelector('.toast,#toast').textContent"))
        print('errors',errs);await b.close()
asyncio.run(main())
