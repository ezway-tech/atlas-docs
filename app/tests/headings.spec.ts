import {test,expect,type Page} from '@playwright/test';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {visualSafe} from '../src/components/visual-safe';
import {extractHeadings,headingTree,headingEdit,splitMarkdown} from '../src/lib/headings';

const raw='---\ntitle: Test\n---\n# Tổng quan\n\n'+('Nội dung thử.\n\n'.repeat(15))+'## Cài đặt\n\n### Chi tiết\n\n#### Cấp bốn\n\n##### Cấp năm\n\n###### Cấp sáu\n\n## Cài đặt\n\n# Kết thúc\n\n### Nhảy cấp\n';
async function choose(page:Page,label:string,option:string){const toc=label==='Từ cấp'||label==='Đến cấp';if(toc)await page.getByRole('button',{name:'Cấu hình mục lục',exact:true}).click();await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name:option,exact:true}).click();if(toc)await page.keyboard.press('Escape');}
async function setup(page:Page,source=raw){
 // Keep tests independent of user data, including settings writes.
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),name=url.pathname;
  const id=name.startsWith('/api/docs/')?name.slice('/api/docs/'.length):'test/heading';
  const doc={id,kind:'md',title:'Heading test',description:'',category:'test',updatedAt:'2026-11-03',order:1,raw:source,content:splitMarkdown(source).body,text:'',headings:extractHeadings(source)};
  const body=name==='/api/docs'?[doc]:name.startsWith('/api/docs/')?doc:name==='/api/settings'?{theme:'light',leftWidth:220,rightWidth:280,pinnedFolders:[],hiddenFolders:[],keymap:{}}:name==='/api/dashboard'?{docs:1,folders:0,topics:0,comments:0,assets:0}:name==='/api/links'?{incoming:[],outgoing:[],related:[]}:name==='/api/order'?{}:[];
  await route.fulfill({json:body});
 });
 await page.route('https://cdn.jsdelivr.net/npm/monaco-editor*/**',async route=>{
  const suffix=new URL(route.request().url()).pathname.split('/min/vs/')[1];
  if(!suffix||suffix.includes('..'))return route.abort();
  await route.fulfill({path:path.resolve('node_modules/monaco-editor/min/vs',suffix),headers:{'Access-Control-Allow-Origin':'*'}});
 });
 await page.goto('/docs/test/heading');
 const tabs=page.getByRole('tablist',{name:'Bảng bên',exact:true}).getByRole('tab');
 await expect(tabs).toHaveText(['Mục lục','Bình luận (0)']);
 await expect(page.getByRole('tab',{name:'Mục lục',exact:true})).toHaveAttribute('aria-selected','true');
 if(source===raw)await expect(page.locator('.toc-tree a')).toHaveCount(6);
}
test('Little Café recipe has a real H2–H6 branch and stays Visual-safe',()=>{
 const recipe=readFileSync('../examples/little-cafe/docs/menu/latte.md','utf8');
 expect(visualSafe(recipe)).toBe(true);
 const tree=headingTree(extractHeadings(recipe));
 let branch=tree.find(h=>h.title==='Quality check')!;
 for(const level of [2,3,4,5,6]){
  expect(branch.level).toBe(level);
  if(level<6)branch=branch.children[0];
 }
 expect(branch.title).toBe('Shift handover note');
});

test('parser preserves renderer IDs, source lines and real hierarchy',()=>{
 const input='---\ntitle: Metadata\n---\n# **Tiếng Việt** &amp; [link](https://example.com)\n\n# **Tiếng Việt** &amp; [link](https://example.com)\n\n~~~md\n## Not heading\n~~~\n\n    # Also code\n\nSetext\n======\n\n###### Six\n';
 expect(extractHeadings('---\n---\n# A\n\n---\n# B').map(h=>h.title)).toEqual(['A','B']);
 const headings=extractHeadings(input);
 expect(headings.map(h=>h.level)).toEqual([1,1,1,6]);
 expect(headings.map(h=>h.line)).toEqual([4,6,14,17]);
 expect(headings[0]).toMatchObject({title:'Tiếng Việt & link',id:'tiếng-việt--link'});
 expect(headings[1].id).toBe(headings[0].id+'-1');
 const tree=headingTree(extractHeadings('# A\n## B\n#### C\n# D\n### E'),2,6);
 expect(tree.map(h=>h.title)).toEqual(['B','E']);expect(tree[0].children[0].title).toBe('C');
});
test('source heading edits replace prefixes and protect metadata/code',()=>{
 for(const level of [1,2,3,4,5,6])expect(headingEdit('## Title ##',1,1,level).text).toBe('#'.repeat(level)+' Title');
 expect(headingEdit('### Title',1,1,0).text).toBe('Title');
 expect(headingEdit('Title\n=====',1,1,3)).toEqual({first:1,last:2,text:'### Title'});
 expect(headingEdit('---\ntitle: A\n---\n```\n# Code\n```',1,6,2).text).toBe('---\ntitle: A\n---\n```\n# Code\n```');
});
test('TOC range, keyboard collapse, persistence and narrow themes',async({page})=>{
 await setup(page);
 await page.locator('.toc-tree a[href="#kết-thúc"]').click();await expect(page.locator('.reader [id="kết-thúc"]')).toBeInViewport();
 const root=page.getByRole('button',{name:'Thu gọn Tổng quan',exact:true});await root.focus();await page.keyboard.press('Enter');
 await expect(page.locator('.toc-tree a')).toHaveCount(3);
 await choose(page,'Đến cấp','H6');await expect(page.locator('.toc-tree a')).toHaveCount(3);
 await page.getByRole('button',{name:'Mở tất cả',exact:true}).click();await expect(page.locator('.toc-tree a')).toHaveCount(9);
 await choose(page,'Từ cấp','H2');await expect(page.locator('.toc-tree > ul > li')).toHaveCount(3);
 await page.getByRole('button',{name:'Thu gọn tất cả',exact:true}).click();
 await page.reload();await page.getByRole('tab',{name:'Mục lục',exact:true}).click();
 await page.getByRole('button',{name:'Cấu hình mục lục',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Từ cấp',exact:true})).toHaveText('H2');await page.keyboard.press('Escape');
 await expect(page.locator('.toc-tree a')).toHaveCount(3);
 await page.getByRole('tab',{name:'Bình luận (0)',exact:true}).click();await page.getByRole('tab',{name:'Mục lục',exact:true}).click();await expect(page.locator('.toc-tree a')).toHaveCount(3);
 await page.getByRole('button',{name:'Mở tất cả',exact:true}).click();
 for(const dark of [false,true]){
  await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);
  await page.locator('.right-panel').evaluate(el=>{(el as HTMLElement).style.width='230px';(el as HTMLElement).style.flexBasis='230px';});
  expect(await page.locator('.toc-panel').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:`test-results/headings-${dark?'dark':'light'}.png`});
 }
});
test('source H1–H6, undo and live navigation in Source/Split/Preview',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'Chỉnh sửa',exact:true}).click();await page.getByRole('radio',{name:'Source',exact:true}).click();
 await expect(page.locator('.monaco-editor').first()).toBeVisible();
 await page.locator('.toc-tree a').first().click();
 await expect.poll(()=>page.evaluate(()=>{const w=window as any;return w.monaco?.editor.getEditors()[0]?.getPosition()?.lineNumber;})).toBe(4);
 for(const level of [6,5,4,3,2,1]){
  await choose(page,'Kiểu đoạn văn',`H${level} · Tiêu đề ${level}`);
  await expect.poll(()=>page.evaluate(()=>(window as any).monaco.editor.getEditors()[0].getModel().getLineContent(4))).toBe('#'.repeat(level)+' Tổng quan');
  await expect.poll(()=>page.evaluate(()=>(window as any).monaco.editor.getEditors()[0].hasTextFocus())).toBe(true);
  await expect.poll(()=>page.evaluate(()=>{const ed=(window as any).monaco.editor.getEditors()[0];return ed.getPosition().column===ed.getModel().getLineMaxColumn(4);})).toBe(true);
 }
 await page.screenshot({path:'test-results/headings-source.png'});
 await page.evaluate(()=>(window as any).monaco.editor.getEditors()[0].focus());await page.keyboard.press('Control+z');
 await expect.poll(()=>page.evaluate(()=>(window as any).monaco.editor.getEditors()[0].getModel().getLineContent(4))).toBe('## Tổng quan');
 await choose(page,'Kiểu đoạn văn','Đoạn văn');await expect(page.locator('.toc-tree a').filter({hasText:'Tổng quan'})).toHaveCount(0);
 await page.evaluate(()=>{const ed=(window as any).monaco.editor.getEditors()[0],model=ed.getModel();ed.executeEdits('test',[{range:{startLineNumber:4,startColumn:1,endLineNumber:4,endColumn:model.getLineMaxColumn(4)},text:'# Mới chưa lưu'}]);});
 await expect(page.locator('.toc-tree a').filter({hasText:'Mới chưa lưu'})).toHaveCount(1);
 await choose(page,'Đến cấp','H6');
 for(const mode of ['Split','Preview']){
  await page.getByRole('radio',{name:mode,exact:true}).click();await page.locator('.toc-tree a[href="#cài-đặt-1"]').click();
  await expect(page.locator('.preview [id="cài-đặt-1"]')).toBeInViewport();
  const ids=await page.locator('.preview .markdown-body').locator('h1,h2,h3,h4,h5,h6').evaluateAll(nodes=>nodes.map(n=>n.id));
  expect(await page.locator('.toc-tree a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')?.slice(1)))).toEqual(ids);
 }
 await page.getByRole('radio',{name:'Source',exact:true}).click();
 await expect(page.locator('.monaco-editor').first()).toBeVisible();
 await page.evaluate(()=>{const ed=(window as any).monaco.editor.getEditors()[0];ed.setValue('---\ntitle: Test\n---\nTiêu đề\n======');ed.setPosition({lineNumber:5,column:1});});
 await expect(page.getByRole('combobox',{name:'Kiểu đoạn văn',exact:true})).toHaveText('H1 · Tiêu đề 1');
 await choose(page,'Kiểu đoạn văn','Đoạn văn');await expect(page.getByText('Bài chưa có tiêu đề.',{exact:true})).toBeVisible();
});
test('Visual H1–H6, paragraph, undo and heading navigation',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'Chỉnh sửa',exact:true}).click();await expect(page.locator('.tiptap-content')).toBeVisible();
 for(const level of [6,5,4,3,2,1]){
  await page.locator('.tiptap-content').locator('h1,h2,h3,h4,h5,h6').first().click();
  await choose(page,'Kiểu đoạn văn',`H${level} · Tiêu đề ${level}`);
  await expect(page.locator(`.tiptap-content h${level}`).filter({hasText:'Tổng quan'})).toHaveCount(1);
  await expect(page.locator('.tiptap-content')).toBeFocused();
 }
 await page.screenshot({path:'test-results/headings-visual.png'});
 await page.getByRole('button',{name:'Hoàn tác',exact:true}).click();await expect(page.locator('.tiptap-content h2').first()).toHaveText('Tổng quan');
 await choose(page,'Kiểu đoạn văn','Đoạn văn');await expect(page.locator('.toc-tree a').filter({hasText:'Tổng quan'})).toHaveCount(0);
 await page.locator('.toc-tree a[href="#cài-đặt-1"]').click();
 await expect.poll(()=>page.evaluate(()=>window.getSelection()?.anchorNode?.parentElement?.closest('h2')?.textContent)).toBe('Cài đặt');
 await expect(page.locator('.tiptap-content h2').last()).toBeInViewport();
});

test('empty messages distinguish missing headings from filtering',async({page})=>{
 await setup(page,'###### Sâu');await expect(page.getByText('Không có tiêu đề trong khoảng đã chọn.',{exact:true})).toBeVisible();
 await choose(page,'Đến cấp','H6');await expect(page.locator('.toc-tree a')).toHaveText('Sâu');
 await setup(page,'Nội dung không có tiêu đề.');await expect(page.getByText('Bài chưa có tiêu đề.',{exact:true})).toBeVisible();
});
test('collapse is remembered per document, range shared between documents',async({page})=>{
 await setup(page);await choose(page,'Đến cấp','H6');await page.getByRole('button',{name:'Thu gọn tất cả',exact:true}).click();await expect(page.locator('.toc-tree a')).toHaveCount(2);
 await page.goto('/docs/test/other');await page.getByRole('tab',{name:'Mục lục',exact:true}).click();await expect(page.locator('.toc-tree a')).toHaveCount(9);
 await page.goto('/docs/test/heading');await page.getByRole('tab',{name:'Mục lục',exact:true}).click();await expect(page.locator('.toc-tree a')).toHaveCount(2);
});

 test('compact TOC toolbar, popover keyboard and long headings',async({page})=>{
 await setup(page,'# '+('Tiêu đề dài '.repeat(20))+'\n## Hai\n### Ba\n#### Bốn\n##### Năm\n###### Sáu');
 const settings=page.getByRole('button',{name:'Cấu hình mục lục',exact:true});
 await expect(page.getByRole('combobox',{name:'Từ cấp',exact:true})).toHaveCount(0);
 await settings.focus();await page.keyboard.press('Enter');await expect(page.getByRole('dialog',{name:'Cấu hình mục lục'})).toBeVisible();
 await page.keyboard.press('Escape');await expect(settings).toBeFocused();
 await settings.click();await page.locator('.reader h1').first().click();await expect(page.getByRole('dialog',{name:'Cấu hình mục lục'})).toHaveCount(0);
 await page.locator('.toc-tree a').first().click();
 await expect(page.locator('.toc-tree a').first()).toHaveAttribute('aria-current','location');
 await expect(page.locator('.toc-tree a').first()).toHaveCSS('font-weight','600');
 await expect(page.locator('.toc-tree a').first()).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await choose(page,'Đến cấp','H6');
 for(const dark of [false,true]){
 await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);
 await page.locator('.right-panel').evaluate(el=>{(el as HTMLElement).style.width='215px';(el as HTMLElement).style.flexBasis='215px';});
 const header=page.locator('.ui-sidebar-tabs .ui-tabs-header');
 expect(await header.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 const tabs=await header.getByRole('tablist').boundingBox(),actions=await page.locator('.toc-actions').boundingBox();
 expect(tabs!.x+tabs!.width).toBeLessThanOrEqual(actions!.x+1);
 for(const button of await page.locator('.toc-actions button').all()){const box=await button.boundingBox();expect(box!.width).toBe(36);expect(box!.height).toBe(36);}
 expect(await page.locator('.toc-panel').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.screenshot({path:`test-results/toc-compact-${dark?'dark':'light'}.png`});
 }
 await page.getByRole('tab',{name:'Bình luận (0)',exact:true}).click();await expect(settings).toHaveCount(0);
 });

test('right sidebar tabs default to Mục lục and can be reordered',async({page})=>{
 await setup(page);
 const list=page.getByRole('tablist',{name:'Bảng bên',exact:true});
 const toc=list.getByRole('tab',{name:'Mục lục',exact:true});
 const comments=list.getByRole('tab',{name:'Bình luận (0)',exact:true});
 await toc.dragTo(comments);
 await expect(list.getByRole('tab')).toHaveText(['Bình luận (0)','Mục lục']);
 await page.reload();
 await expect(page.getByRole('tablist',{name:'Bảng bên',exact:true}).getByRole('tab')).toHaveText(['Bình luận (0)','Mục lục']);
 await expect(page.getByRole('tab',{name:'Mục lục',exact:true})).toHaveAttribute('aria-selected','true');
});
