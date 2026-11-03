import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.goto('/');});
test('dropdown Escape and nested dialog preserve parent and restore focus',async({page})=>{
 await page.getByRole('button',{name:'Mở hộp thoại',exact:true}).click();const parent=page.getByRole('dialog',{name:'Hộp thử'});
 await page.getByRole('combobox',{name:'Trạng thái thử'}).click();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await expect(parent).toBeVisible();
 await page.getByRole('combobox',{name:'Trạng thái thử'}).click();await page.keyboard.press('Escape');await expect(page.getByRole('listbox')).toHaveCount(0);await expect(parent).toBeVisible();
 await page.getByRole('button',{name:'Xác nhận thử'}).click();await expect(page.getByRole('dialog',{name:'Xác nhận lồng'})).toBeVisible();await page.keyboard.press('Escape');await expect(parent).toBeVisible();await expect(page.getByRole('button',{name:'Xác nhận thử'})).toBeFocused();
 await page.getByRole('button',{name:'Đóng hộp'}).focus();await page.keyboard.press('Tab');await expect(page.getByRole('combobox',{name:'Trạng thái thử'})).toBeFocused();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Mở hộp thoại',exact:true})).toBeFocused();
});
test('number draft commits on Enter and blur with bounds and arrows',async({page})=>{const n=page.getByRole('spinbutton',{name:'Cỡ chữ thử'});await n.fill('');await expect(page.getByTestId('number')).toHaveText('24');await n.press('Enter');await expect(n).toHaveValue('24');await n.fill('99');await n.press('Tab');await expect(n).toHaveValue('72');await n.fill('1');await n.press('Enter');await expect(n).toHaveValue('12');await n.press('ArrowUp');await expect(n).toHaveValue('13');await n.fill('oops');await n.press('Tab');await expect(n).toHaveValue('13');});
test('link add, edit, cancel and remove keep editor selection',async({page})=>{const editor=page.getByRole('textbox',{name:'Bình luận'});await page.locator('.comment-surface').click();await page.keyboard.press('Control+a');await page.getByRole('button',{name:'Liên kết',exact:true}).click();await page.getByRole('textbox',{name:'URL',exact:true}).fill('https://example.com');await page.getByRole('button',{name:'Lưu',exact:true}).click();await expect(page.locator('.comment-surface a')).toHaveAttribute('href','https://example.com');await page.locator('.comment-surface a').click();await page.getByRole('button',{name:'Liên kết',exact:true}).click();await expect(page.getByRole('textbox',{name:'URL',exact:true})).toHaveValue('https://example.com');await page.getByRole('textbox',{name:'URL',exact:true}).fill('https://example.org');await page.getByRole('button',{name:'Hủy',exact:true}).click();await expect(page.locator('.comment-surface a')).toHaveAttribute('href','https://example.com');await page.getByRole('button',{name:'Liên kết',exact:true}).click();await page.getByRole('button',{name:'Gỡ liên kết'}).click();await expect(page.locator('.comment-surface a')).toHaveCount(0);});
test('media loads, plays, mutes, seeks and changes speed',async({page})=>{await expect(page.getByRole('slider',{name:'Vị trí phát'})).toHaveAttribute('aria-valuemax','3');await page.getByRole('button',{name:'Phát',exact:true}).click();await expect(page.getByRole('button',{name:'Tạm dừng'})).toBeVisible();await page.getByRole('button',{name:'Tạm dừng'}).click();await page.getByRole('button',{name:'Tắt tiếng'}).click();await expect(page.locator('audio')).toHaveJSProperty('muted',true);await page.getByRole('combobox',{name:'Tốc độ phát'}).click();await page.getByRole('option',{name:'1.5×',exact:true}).click();await expect(page.locator('audio')).toHaveJSProperty('playbackRate',1.5);await page.getByRole('slider',{name:'Vị trí phát'}).focus();await page.keyboard.press('End');await expect(page.locator('audio')).toHaveJSProperty('currentTime',3);});
test('color hex and popup keyboard',async({page})=>{await page.getByRole('button',{name:'Màu',exact:true}).click();await page.getByRole('textbox',{name:'Mã màu HEX'}).fill('#123456');await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Màu',exact:true})).toContainText('#123456');});
test('key recording Escape cancels capture before closing dialog',async({page})=>{await page.getByRole('button',{name:'Phím tắt',exact:true}).click();await page.getByRole('button',{name:/Đổi phím tắt:/}).first().click();await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Phím tắt'})).toBeVisible();await expect(page.locator('.keymap-listen')).toHaveCount(0);await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);});
for(const dark of [false,true])test(`mobile popup bounds and theme ${dark}`,async({page})=>{await page.setViewportSize({width:390,height:844});if(dark)await page.getByRole('button',{name:'Đổi giao diện'}).click();await page.getByRole('button',{name:'Mở hộp thoại',exact:true}).click();await page.getByRole('combobox',{name:'Trạng thái thử'}).click();const box=await page.getByRole('listbox').boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(390);await page.screenshot({path:`test-results/ui-mobile-${dark?'dark':'light'}.png`});});

test('resource upload, image undo and discard, nested delete confirmation',async({page})=>{
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=320;c.height=200;const ctx=c.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,320,200);return c.toDataURL().split(',')[1];});
 const asset={id:'ui-test.png',filename:'ui-test.png',mimeType:'image/png',size:1000,alt:'',createdAt:'2026-01-01T00:00:00Z',source:'upload'};
 await page.route('**/api/media',async route=>{await route.fulfill({json:route.request().method()==='POST'?asset:[]});});
 await page.route('**/api/media/ui-test.png/usage',route=>route.fulfill({json:{folders:[],docs:[],comments:[]}}));
 await page.route(/\/api\/media\/ui-test\.png(?:\?.*)?$/,route=>route.request().method()==='DELETE'?route.fulfill({json:{ok:true}}):route.fulfill({contentType:'image/png',body:Buffer.from(png,'base64')}));
 await page.locator('input[type=file]').setInputFiles({name:'ui-test.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await page.getByRole('button',{name:'Xem ui-test.png',exact:true}).click();await page.getByRole('button',{name:'Sửa ảnh',exact:true}).click();
 const canvas=page.getByLabel('Vùng vẽ trên ảnh');await expect(page.getByRole('button',{name:'Lưu đè ảnh này'})).toBeEnabled();const rect=(await canvas.boundingBox())!;
 await page.mouse.move(rect.x+40,rect.y+40);await page.mouse.down();await page.mouse.move(rect.x+100,rect.y+100,{steps:5});await page.mouse.up();await expect(page.getByRole('button',{name:'Hoàn tác',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Hoàn tác',exact:true}).click();await expect(page.getByRole('button',{name:'Làm lại',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Làm lại',exact:true}).click();
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Bỏ thay đổi ảnh?'})).toBeVisible();await page.keyboard.press('Escape');await expect(canvas).toBeVisible();await page.keyboard.press('Escape');await page.getByRole('button',{name:'Bỏ thay đổi',exact:true}).click();await page.getByRole('button',{name:'Xóa tệp',exact:true}).click();await expect(page.getByRole('dialog',{name:'Xóa tệp này?'})).toBeVisible();await page.getByRole('button',{name:'Hủy',exact:true}).click();await expect(page.getByRole('dialog',{name:'Chi tiết tài nguyên'})).toBeVisible();
});

test('busy dialog blocks dismissal and tabs work with arrows',async({page})=>{await page.getByRole('tab',{name:'Tab một'}).focus();await page.keyboard.press('ArrowRight');await expect(page.getByRole('tabpanel')).toHaveText('Nội dung hai');await page.getByRole('button',{name:'Mở hộp thoại',exact:true}).click();await page.getByRole('button',{name:'Đổi bận'}).click();await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Hộp thử'})).toBeVisible();await expect(page.getByRole('button',{name:'Đóng hộp'})).toBeDisabled();await page.getByRole('button',{name:'Đổi bận'}).click();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);});
test('media load failure is visible and retry is available',async({page})=>{await page.route('**/tone.wav',route=>route.abort());await page.reload();await expect(page.getByRole('alert')).toContainText('Không thể tải');await expect(page.getByRole('button',{name:'Thử lại',exact:true})).toBeVisible();});
test('video uses custom playback and fullscreen',async({page})=>{
 const bytes=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=160;c.height=90;const stream=c.captureStream(10);const rec=new MediaRecorder(stream,{mimeType:'video/webm'});const chunks:BlobPart[]=[];return await new Promise<number[]>(resolve=>{rec.ondataavailable=e=>chunks.push(e.data);rec.onstop=async()=>{resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));stream.getTracks().forEach(t=>t.stop());};rec.start();const ctx=c.getContext('2d')!;ctx.fillStyle='blue';ctx.fillRect(0,0,160,90);setTimeout(()=>{ctx.fillStyle='red';ctx.fillRect(0,0,160,90);},200);setTimeout(()=>rec.stop(),600);});});
 await page.route('**/clip.webm',route=>route.fulfill({contentType:'video/webm',body:Buffer.from(bytes)}));await page.goto('/?video');await expect(page.locator('video')).not.toHaveAttribute('controls');await page.getByRole('button',{name:'Phát',exact:true}).click();await expect(page.getByRole('button',{name:'Tạm dừng'})).toBeVisible();await page.getByRole('button',{name:'Toàn màn hình'}).click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);await page.getByRole('button',{name:'Toàn màn hình'}).click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
});

test('icons keep their intended size in compact controls on desktop and mobile',async({page})=>{
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  for(const name of ['Dạng lưới','Dạng danh sách']){
   const button=page.getByRole('radio',{name,exact:true});
   const icon=button.locator('svg');const bounds=await icon.boundingBox();
   expect(bounds?.width).toBe(18);expect(bounds?.height).toBe(18);
   expect((await button.boundingBox())!.width).toBeGreaterThanOrEqual(32);
  }
  for(const selector of ['.comment-tools button svg','.resource-header-actions button svg','.ui-media-controls button svg']){
   for(const icon of await page.locator(selector).all()){
    const box=await icon.boundingBox();const declared=Number(await icon.getAttribute('width'));
    expect(box!.width).toBe(declared);expect(box!.height).toBe(declared);
   }
  }
 }
});

test('resource filters are grouped, removable and fit mobile toolbar',async({page})=>{
 const assets=[{id:'a.png',filename:'a.png',mimeType:'image/png',source:'upload',size:20,createdAt:'2026-01-01',alt:''},{id:'b.png',filename:'b.png',mimeType:'image/png',source:'paste',size:10,createdAt:'2026-01-02',alt:''},{id:'c.pdf',filename:'c.pdf',mimeType:'application/pdf',source:'upload',size:30,createdAt:'2026-01-03',alt:''}];
 await page.route('**/api/media',r=>r.fulfill({json:assets}));await page.reload();
 await expect(page.locator('.resource-active-filters')).toHaveCount(0);
 await page.getByRole('button',{name:'Bộ lọc',exact:true}).click();
 await page.getByRole('combobox',{name:'Loại tệp',exact:true}).click();await page.getByRole('option',{name:'Ảnh',exact:true}).click();
 await page.getByRole('combobox',{name:'Nguồn / tình trạng',exact:true}).click();await page.getByRole('option',{name:'Tải lên',exact:true}).click();await page.getByRole('button',{name:'Xong',exact:true}).click();
 await expect(page.locator('.resource-card')).toHaveCount(1);await expect(page.locator('.resource-filter-count')).toHaveText('2');
 await page.getByRole('button',{name:'Bỏ lọc nguồn: Tải lên'}).click();await expect(page.locator('.resource-card')).toHaveCount(2);
 await page.getByRole('button',{name:'Xóa bộ lọc',exact:true}).click();await expect(page.locator('.resource-card')).toHaveCount(3);await expect(page.locator('.resource-active-filters')).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});const bar=page.locator('.resource-toolbar');await bar.scrollIntoViewIfNeeded();
 for(const el of await bar.locator('button').all()){const b=await el.boundingBox();expect(b!.x).toBeGreaterThanOrEqual(0);expect(b!.x+b!.width).toBeLessThanOrEqual(390);}
 await page.screenshot({path:'test-results/resource-toolbar-mobile.png'});
 await page.getByRole('button',{name:'Bộ lọc',exact:true}).click();await page.getByRole('combobox',{name:'Loại tệp',exact:true}).click();await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Bộ lọc tài nguyên'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Bộ lọc tài nguyên'})).toHaveCount(0);
});
