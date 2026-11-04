import {chromium} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const base=process.env.AUDIT_URL||'http://127.0.0.1:3001';
const out=path.resolve('test-results/responsive');
fs.mkdirSync(out,{recursive:true});

const sizes=[
 {name:'mobile-320',w:320,h:568},
 {name:'mobile-390',w:390,h:844},
 {name:'mobile-360',w:360,h:800},
 {name:'mobile-430',w:430,h:932},
 {name:'landscape',w:844,h:390},
 {name:'tablet-768',w:768,h:1024},
 {name:'near-700',w:699,h:900},
 {name:'after-700',w:701,h:900},
 {name:'near-1000',w:999,h:900},
 {name:'after-1000',w:1001,h:900},
 {name:'desktop-1280',w:1280,h:800},
 {name:'desktop-1440',w:1440,h:900},
];

const routes=[
 {id:'home',path:'/'},
 {id:'folder',path:'/folders/start'},
 {id:'doc',path:'/docs/start/welcome'},
 {id:'doc-mermaid',path:'/docs/start/explore'},
 {id:'doc-long',path:'/docs/menu/latte'},
 {id:'media',path:'/media'},
];

function overflow(page){
 return page.evaluate(()=>{
  const doc=document.documentElement;
  const body=document.body;
  const shell=document.querySelector('.app-shell');
  const dx=Math.max(doc.scrollWidth-doc.clientWidth,body.scrollWidth-body.clientWidth,shell?(shell.scrollWidth-shell.clientWidth):0);
  const offenders=[];
  for(const el of document.querySelectorAll('body *')){
   if(!(el instanceof HTMLElement))continue;
   const r=el.getBoundingClientRect();
   if(r.width<2||r.height<2)continue;
   if(r.right>window.innerWidth+1||r.left<-1){
    const cs=getComputedStyle(el);
    if(cs.position==='fixed'||cs.position==='absolute')continue;
    if(el.closest('.sidebar')||el.closest('.right-panel')||el.closest('[data-ui-dialog]')||el.closest('.ui-dialog-overlay')||el.closest('.zoom-layer')||el.closest('.ui-toast-viewport')||el.closest('.diagram-scroll')||el.closest('.table-scroll')||el.closest('.format-bar')||el.closest('.spec-source')||el.closest('pre'))continue;
    offenders.push({tag:el.tagName.toLowerCase(),cls:(el.className||'').toString().slice(0,80),left:Math.round(r.left),right:Math.round(r.right)});
    if(offenders.length>=8)break;
   }
  }
  return {dx,offenders,vw:window.innerWidth,vh:window.innerHeight};
 });
}

const bugs=[];
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage();

for(const size of sizes){
 await page.setViewportSize({width:size.w,height:size.h});
 for(const route of routes){
  await page.goto(base+route.path,{waitUntil:'networkidle',timeout:60000});
  await page.waitForTimeout(400);
  const o=await overflow(page);
  const shot=`${size.name}__${route.id}.png`;
  await page.screenshot({path:path.join(out,shot),fullPage:false});
  if(o.dx>1||o.offenders.length){
   bugs.push({code:`OVF-${size.name}-${route.id}`,screen:route.id,size:`${size.w}x${size.h}`,dx:o.dx,offenders:o.offenders,shot});
  }
 }
 // interactions on mobile-ish
 if(size.w<=700){
  await page.goto(base+'/docs/start/welcome',{waitUntil:'networkidle'});
  await page.waitForTimeout(300);
  const menu=page.getByRole('button',{name:'Đóng hoặc mở thư viện'});
  const searchVisible=await page.locator('.top-search').isVisible().catch(()=>false);
  if(!searchVisible){
   const alt=await page.getByRole('button',{name:/Tìm/i}).count();
   if(!alt)bugs.push({code:`NAV-SEARCH-${size.name}`,screen:'doc',size:`${size.w}x${size.h}`,note:'top-search hidden and no alternate search control'});
  }
  await menu.click();
  await page.waitForTimeout(200);
  const sidebarOpen=await page.locator('.sidebar.mobile-show').isVisible().catch(()=>false);
  const mask=await page.locator('.mobile-mask').isVisible().catch(()=>false);
  if(!sidebarOpen)bugs.push({code:`NAV-SIDEBAR-OPEN-${size.name}`,screen:'doc',size:`${size.w}x${size.h}`,note:'sidebar did not open'});
  if(!mask)bugs.push({code:`NAV-MASK-${size.name}`,screen:'doc',size:`${size.w}x${size.h}`,note:'mobile mask missing'});
  if(mask){await page.locator('.mobile-mask').click({force:true});await page.waitForTimeout(150);}
  // right panel
  const rightBtn=page.getByRole('button',{name:/Hiện bình luận|Ẩn bình luận/});
  if(await rightBtn.count()){
   const label=await rightBtn.first().getAttribute('aria-label');
   if(label?.includes('Hiện'))await rightBtn.first().click();
   await page.waitForTimeout(200);
   const panel=page.locator('.right-panel');
   const panelVisible=await panel.isVisible().catch(()=>false);
   if(!panelVisible)bugs.push({code:`NAV-RIGHT-${size.name}`,screen:'doc',size:`${size.w}x${size.h}`,note:'right panel not visible'});
   else{
    const close=panel.getByRole('button',{name:'Đóng bảng bên'});
    if(await close.count())await close.click();
   }
  }
 }
 if(size.w>700&&size.w<=1000){
  await page.goto(base+'/docs/start/welcome',{waitUntil:'networkidle'});
  await page.waitForTimeout(300);
  const main=await page.locator('.main').boundingBox();
  if(main&&main.width<200)bugs.push({code:`LAY-MAIN-NARROW-${size.name}`,screen:'doc',size:`${size.w}x${size.h}`,note:`main width ${Math.round(main.width)}`});
 }
}

// edit mode format bar
await page.setViewportSize({width:390,height:844});
await page.goto(base+'/docs/start/welcome',{waitUntil:'networkidle'});
await page.getByRole('button',{name:'Chỉnh sửa'}).click();
await page.waitForTimeout(500);
const saveVisible=await page.getByRole('button',{name:'Lưu'}).isVisible();
const formatBar=page.locator('.format-bar').first();
const formatBox=await formatBar.boundingBox().catch(()=>null);
const oEdit=await overflow(page);
await page.screenshot({path:path.join(out,'edit-390.png')});
if(!saveVisible)bugs.push({code:'EDIT-SAVE-390',screen:'edit',size:'390x844',note:'Save not visible'});
if(oEdit.dx>1)bugs.push({code:'EDIT-OVF-390',screen:'edit',size:'390x844',dx:oEdit.dx,offenders:oEdit.offenders});
if(formatBox&&formatBox.width>390)bugs.push({code:'EDIT-FORMAT-WIDE',screen:'edit',size:'390x844',note:`format-bar width ${formatBox.width}`});

// history dialog
await page.keyboard.press('Escape').catch(()=>{});
await page.getByRole('button',{name:'Đóng'}).click().catch(()=>{});
await page.goto(base+'/docs/ops/stock',{waitUntil:'networkidle'}).catch(()=>page.goto(base+'/docs/menu/latte',{waitUntil:'networkidle'}));
await page.waitForTimeout(300);
const hist=page.getByRole('button',{name:'Lịch sử'});
if(await hist.count()){
 await hist.click();
 await page.waitForTimeout(400);
 await page.screenshot({path:path.join(out,'history-390.png')});
 const oH=await overflow(page);
 if(oH.dx>1)bugs.push({code:'HIST-OVF-390',screen:'history',size:'390x844',dx:oH.dx});
 const restore=page.getByRole('button',{name:/Khôi phục/});
 const restoreBox=await restore.boundingBox().catch(()=>null);
 if(restoreBox&&(restoreBox.y+restoreBox.height>844||restoreBox.y<0))bugs.push({code:'HIST-RESTORE-CLIP',screen:'history',size:'390x844',note:JSON.stringify(restoreBox)});
}

fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify({bugs,count:bugs.length},null,2));
console.log(JSON.stringify({bugs:bugs.length,out},null,2));
for(const b of bugs)console.log('-',b.code,b.note||b.dx||'');
await browser.close();
