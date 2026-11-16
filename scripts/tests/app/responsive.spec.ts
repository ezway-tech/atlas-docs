import {test,expect,type Page,type Locator} from '../../../app/node_modules/@playwright/test';
import path from 'node:path';
import {extractHeadings,splitMarkdown} from '../../../app/src/lib/headings';

const source=`---
title: Responsive demo bài viết rất dài để kiểm tra xuống dòng tiêu đề tiếng Việt
description: Mô tả dài không khoảngcách:abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ
---
# Mục lớn

Đoạn mở đầu.

## Bảng rộng

| Cột A | Cột B | Cột C | Cột D | Cột E | Cột F |
| --- | --- | --- | --- | --- | --- |
| giá trị dài 1 | giá trị dài 2 | giá trị dài 3 | giá trị dài 4 | giá trị dài 5 | giá trị dài 6 |

## Code

\`\`\`js
const veryLongIdentifierWithoutSpaces=12345678901234567890123456789012345678901234567890;
\`\`\`

## Sơ đồ

\`\`\`mermaid
flowchart LR
  A[Start] --> B[Middle step with a long label]
  B --> C[End]
\`\`\`
`;

async function mockApi(page:Page){
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),name=url.pathname,method=route.request().method();
  const doc={id:'start/welcome',kind:'md' as const,title:'Responsive demo bài viết rất dài để kiểm tra xuống dòng tiêu đề tiếng Việt',description:'Mô tả dài',category:'start',updatedAt:'2026-11-04',order:1,raw:source,content:splitMarkdown(source).body,text:'',headings:extractHeadings(source)};
  const folder={path:'start',title:'Start here',imageId:null,icon:'book',depth:1};
  const settings={theme:'light',leftWidth:260,rightWidth:320,pinnedFolders:[],hiddenFolders:[],keymap:{}};
  if(name==='/api/libraries/session')return route.fulfill({json:{runtimeId:'responsive-runtime',libraryId:'responsive-library',libraryRoot:'C:/tmp/atlas-responsive',mode:'library',displayName:'Responsive demo'}});
  if(name.startsWith('/api/libraries/'))return route.fulfill({json:{}});
  if(name==='/api/docs'&&method==='GET')return route.fulfill({json:[doc]});
  if(name.startsWith('/api/docs/')&&method==='GET')return route.fulfill({json:doc});
  if(name.startsWith('/api/docs/')&&(method==='PUT'||method==='PATCH'||method==='POST'))return route.fulfill({json:{...doc,raw:source,updatedAt:new Date().toISOString()}});
  if(name==='/api/folders')return route.fulfill({json:[folder]});
  if(name==='/api/settings')return route.fulfill({json:settings});
  if(name==='/api/dashboard')return route.fulfill({json:{docs:1,folders:1,topics:1,comments:0,assets:0}});
  if(name==='/api/order')return route.fulfill({json:{}});
  if(name==='/api/links')return route.fulfill({json:{incoming:[],outgoing:[],related:[]}});
  if(name.startsWith('/api/comments'))return route.fulfill({json:[]});
  if(name.startsWith('/api/history')){
   const url=new URL(route.request().url());
   if(url.searchParams.get('detail')==='1')return route.fulfill({json:{items:[],totalCount:0,totalBytes:0,limits:{maxCount:50,maxBytes:10*1024*1024},nextCursor:null}});
   if(url.searchParams.has('revision'))return route.fulfill({json:{raw:''}});
   return route.fulfill({json:{versions:[]}});
  }
  if(name==='/api/media'||name.startsWith('/api/media'))return route.fulfill({json:[]});
  return route.fulfill({json:{}});
 });
 await page.route('https://cdn.jsdelivr.net/npm/monaco-editor*/**',async route=>{
  const suffix=new URL(route.request().url()).pathname.split('/min/vs/')[1];
  if(!suffix||suffix.includes('..'))return route.abort();
  await route.fulfill({path:path.resolve('node_modules/monaco-editor/min/vs',suffix),headers:{'Access-Control-Allow-Origin':'*'}});
 });
}

async function pageOverflow(page:Page){
 return page.evaluate(()=>{
  const root=document.documentElement;
  const shell=document.querySelector('.app-shell') as HTMLElement|null;
  const dx=Math.max(root.scrollWidth-root.clientWidth,document.body.scrollWidth-document.body.clientWidth,shell?shell.scrollWidth-shell.clientWidth:0);
  return dx;
 });
}
async function closeRightIfOpen(page:Page){
 const hide=page.getByRole('button',{name:'Ẩn bình luận'});
 if(await hide.count())await hide.click();
 await expect(page.locator('.right-panel')).toHaveCount(0);
}
async function dismissRightMask(page:Page){
 await page.locator('.right-mask').click({position:{x:8,y:120}});
}
async function dismissMobileMask(page:Page){
 const box=await page.locator('.mobile-mask').boundingBox();
 expect(box).toBeTruthy();
 await page.mouse.click(box!.x+Math.max(8,box!.width-8),box!.y+120);
}

function overlaps(a:{x:number;y:number;width:number;height:number},b:{x:number;y:number;width:number;height:number}){
 return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
}
async function box(locator:Locator){
 const b=await locator.boundingBox();
 expect(b).toBeTruthy();
 return b!;
}

test.beforeEach(async({page})=>{
 await mockApi(page);
});

test('mobile shell: search, sidebar, right panel, no page overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/docs/start/welcome');
 await expect(page.getByRole('heading',{level:1,name:/Responsive demo/})).toBeVisible();
 await expect(page.getByRole('button',{name:'Tìm kiếm tài liệu'})).toBeVisible();
 await closeRightIfOpen(page);
 expect(await pageOverflow(page)).toBeLessThanOrEqual(1);

 await page.getByRole('button',{name:'Đóng hoặc mở thư viện'}).click();
 await expect(page.locator('.sidebar.mobile-show')).toBeVisible();
 await expect(page.locator('.mobile-mask')).toBeVisible();
 await dismissMobileMask(page);
 await expect(page.locator('.sidebar.mobile-show')).toHaveCount(0);
 await expect(page.locator('.mobile-mask')).toHaveCount(0);

 await page.getByRole('button',{name:'Hiện bình luận'}).click();
 await expect(page.locator('.right-panel')).toBeVisible();
 await expect(page.locator('.right-mask')).toBeVisible();
 await page.locator('.right-panel').getByRole('button',{name:'Đóng bảng bên'}).click();
 await expect(page.locator('.right-panel')).toHaveCount(0);

 await page.getByRole('button',{name:'Hiện bình luận'}).click();
 await expect(page.locator('.right-panel')).toBeVisible();
 await page.getByRole('button',{name:'Đóng hoặc mở thư viện'}).click();
 await expect(page.locator('.sidebar.mobile-show')).toBeVisible();
 await expect(page.locator('.right-panel')).toHaveCount(0);
 await dismissMobileMask(page);
 await expect(page.locator('.mobile-mask')).toHaveCount(0);
});

test('mobile navigation folder to document and dialogs',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/folders/start');
 await expect(page.getByRole('heading',{level:1,name:'Start here'})).toBeVisible();
 await page.locator('main .list-doc').filter({hasText:/Responsive demo/}).click();
 await expect(page).toHaveURL(/\/docs\/start\/welcome/);
 await expect(page.getByRole('heading',{level:1,name:/Responsive demo/})).toBeVisible();
 await closeRightIfOpen(page);

 await page.getByRole('button',{name:'Tìm kiếm tài liệu'}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.keyboard.press('Escape');

 await page.getByRole('button',{name:'Hiện bình luận'}).click();
 await page.getByRole('tab',{name:'Mục lục'}).click();
 await expect(page.locator('.toc-tree a').first()).toBeVisible();
 await page.getByRole('tab',{name:/Bình luận/}).click();
 await expect(page.getByRole('button',{name:'Viết bình luận'})).toBeVisible();
});

test('mobile edit keeps save reachable and format bar contained',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/docs/start/welcome');
 await closeRightIfOpen(page);
 await page.getByRole('button',{name:'Sửa'}).click();
 await expect(page.getByRole('button',{name:'Lưu'})).toBeVisible();
 const save=page.getByRole('button',{name:'Lưu'});
 await expect(save).toBeInViewport();
 const format=page.locator('.format-bar').first();
 await expect(format).toBeVisible();
 const formatBox=await format.boundingBox();
 expect(formatBox).toBeTruthy();
 expect(formatBox!.width).toBeLessThanOrEqual(390);
 expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
});

test('resize while overlays open stays usable',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/docs/start/welcome');
 await closeRightIfOpen(page);
 await page.getByRole('button',{name:'Đóng hoặc mở thư viện'}).click();
 await expect(page.locator('.sidebar.mobile-show')).toBeVisible();
 await page.setViewportSize({width:1440,height:900});
 await expect(page.locator('.mobile-menu')).toBeHidden({timeout:8000});
 await expect(page.locator('.panel-left-toggle')).toBeVisible();
 expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
 await page.setViewportSize({width:360,height:800});
 await page.getByRole('button',{name:'Hiện bình luận'}).click();
 await expect(page.locator('.right-panel')).toBeVisible();
 await dismissRightMask(page);
 await expect(page.locator('.right-panel')).toHaveCount(0);
});

test('tiny phone and landscape do not overflow shell',async({page})=>{
 for(const size of [{width:320,height:568},{width:844,height:390}]){
  await page.setViewportSize(size);
  await page.goto('/docs/start/welcome');
  await expect(page.getByRole('heading',{level:1,name:/Responsive demo/})).toBeVisible();
  expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
 }
});

test('viewport sweep has no page overflow and mid header does not overlap',async({page})=>{
 const widths=[320,375,390,467,768,834,899,901,999,1001,1024,1280,1440];
 for(const width of widths){
  await page.setViewportSize({width,height:844});
  await page.goto('/docs/start/welcome');
  await expect(page.getByRole('heading',{level:1,name:/Responsive demo/})).toBeVisible();
  await closeRightIfOpen(page);
  expect(await pageOverflow(page),`overflow at ${width}`).toBeLessThanOrEqual(1);
 }

 for(const width of [768,834,901,1024]){
  await page.setViewportSize({width,height:844});
  await page.goto('/docs/start/welcome');
  await closeRightIfOpen(page);
  const lead=await box(page.locator('.topbar-lead'));
  const center=await box(page.locator('.topbar-center'));
  const actions=await box(page.locator('.top-actions'));
  expect(overlaps(lead,center),`lead/center overlap at ${width}`).toBeFalsy();
  expect(overlaps(center,actions),`center/actions overlap at ${width}`).toBeFalsy();
  expect(overlaps(lead,actions),`lead/actions overlap at ${width}`).toBeFalsy();
  const crumbTitle=page.locator('.breadcrumbs > span').first();
  const editBtn=page.getByRole('button',{name:'Sửa'});
  if(await editBtn.count()){
   const titleBox=await box(crumbTitle);
   const editBox=await box(editBtn);
   expect(overlaps(titleBox,editBox),`breadcrumb overlap at ${width}`).toBeFalsy();
  }
 }
});

test('mid band uses overlay nav and restores desktop panels',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/docs/start/welcome');
 await closeRightIfOpen(page);
 await expect(page.locator('.mobile-menu')).toBeHidden();
 await expect(page.locator('.sidebar')).toBeVisible();

 await page.setViewportSize({width:900,height:844});
 await page.waitForTimeout(150);
 await expect(page.locator('.mobile-menu')).toBeVisible();
 await expect(page.locator('.sidebar.mobile-show')).toHaveCount(0);
 await page.getByRole('button',{name:'Đóng hoặc mở thư viện'}).click();
 await expect(page.locator('.sidebar.mobile-show')).toBeVisible();
 await expect(page.locator('.mobile-mask')).toBeVisible();
 await dismissMobileMask(page);

 await page.setViewportSize({width:1280,height:900});
 await expect(page.locator('.mobile-menu')).toBeHidden({timeout:8000});
 await expect(page.locator('.sidebar')).toBeVisible();
 expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
});

test('wide tables and code scroll locally without page overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/docs/start/welcome',{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('heading',{level:1,name:/Responsive demo/})).toBeVisible({timeout:15000});
 await closeRightIfOpen(page);
 expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
 const table=page.locator('.markdown-body table').first();
 await expect(table).toBeVisible();
 const canScrollOrFits=await table.evaluate(el=>{
  const style=getComputedStyle(el);
  const scrollable=style.overflowX==='auto'||style.overflowX==='scroll'||style.overflow==='auto'||style.overflow==='scroll';
  return scrollable||el.scrollWidth<=el.clientWidth+2;
 });
 expect(canScrollOrFits).toBeTruthy();
});

test('compact header keeps utilities reachable',async({page})=>{
 await page.setViewportSize({width:834,height:844});
 await page.goto('/docs/start/welcome');
 await expect(page.getByRole('heading',{level:1,name:/Responsive demo/})).toBeVisible();
 await closeRightIfOpen(page);
 await expect(page.getByRole('button',{name:'Trợ giúp'})).toHaveCount(0);
 await page.getByRole('button',{name:'Tiện ích'}).click();
 await expect(page.getByText('Ngôn ngữ',{exact:true})).toBeVisible();
 await expect(page.getByText('Hướng dẫn',{exact:true})).toBeVisible();
 await page.keyboard.press('Escape');
 expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
});

test('representative layout screenshots',async({page})=>{
 const shots=[
  {name:'narrow-390',width:390,height:844},
  {name:'mid-834',width:834,height:844},
  {name:'wide-1280',width:1280,height:900},
 ];
 for(const shot of shots){
  await page.setViewportSize({width:shot.width,height:shot.height});
  await page.goto('/docs/start/welcome');
  await expect(page.getByRole('heading',{level:1,name:/Responsive demo/})).toBeVisible();
  await closeRightIfOpen(page);
  await page.screenshot({path:`test-results/responsive/${shot.name}.png`,fullPage:false});
 }
});
