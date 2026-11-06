'use client';
import {Button as UiButton,Input as UiInput,Textarea as UiTextarea,Popover,Field} from './ui/controls';

import {MediaPlayer} from './ui/media-player';
import {Sheet,ConfirmDialog} from './ui/dialog';
import {DropdownMenu,MenuItem,Collapsible,ToggleGroup} from './ui/patterns';
import {Ellipsis} from './Tooltip';
import {Select} from './ui/select';
import {useEffect,useRef,useState} from 'react';
import {Archive,FileText,Film,Music,Image as ImageIcon,UploadCloud,SlidersHorizontal,Search,LayoutGrid,List,MoreHorizontal,X,Download,Copy,Pencil,Trash2,FolderOpen,CheckCircle2,AlertCircle} from 'lucide-react';
import type {Asset} from '@/lib/types';
import {assetAccept,assetExtension,assetKind,assetSize,validateAsset} from '@/lib/assets';
import ImageEditor,{type ImageEditorHandle} from './ImageEditor';
import {useKeymap} from './KeymapProvider';
import {CommandKeys,CommandTip} from './Keys';

type Usage={folders:{title:string}[];docs:{title:string}[];comments:{id:string}[];history?:{docId:string}[];uncertain?:boolean};
type Props={purpose?:'cover'|'insert';onPick?:(asset:Asset)=>void;onClose?:()=>void;onChanged?:()=>void};
async function request<T>(url:string,init?:RequestInit):Promise<T>{const r=await fetch(url,{cache:'no-store',...init});const data=await r.json();if(!r.ok)throw Error(data.error||'Không thể thực hiện thao tác.');return data;}
const labels:Record<string,string>={all:'Tất cả',image:'Ảnh',document:'Tài liệu',video:'Video',audio:'Âm thanh',archive:'Tệp nén'};
const sourceLabels={upload:'Tải lên',paste:'Dán',edit:'Đã sửa'} as const;
function sourceOf(asset:Asset){return asset.source==='paste'||asset.source==='edit'?asset.source:'upload';}
const icons={image:ImageIcon,document:FileText,video:Film,audio:Music,archive:Archive};
const url=(a:Asset)=>'/api/media/'+a.id;
function Thumbnail({asset,revision=0}:{asset:Asset;revision?:number}){const kind=assetKind(asset.mimeType),Icon=icons[kind];return <div className={'resource-thumb kind-'+kind}>{kind==='image'?<img loading="lazy" src={url(asset)+'?v='+asset.size+'-'+revision} alt={asset.alt}/>:<><Icon size={40}/><span>{assetExtension(asset.filename).toUpperCase()}</span></>}</div>;}
export default function ResourceLibrary({purpose,onPick,onClose,onChanged}:Props){
 const [revision,setRevision]=useState(0);
 const [filtersOpen,setFiltersOpen]=useState(false);
 const [assets,setAssets]=useState<Asset[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[origin,setOrigin]=useState<'all'|'upload'|'paste'|'edit'|'unused'>('all'),[referenced,setReferenced]=useState<Set<string>|null>(null),[sort,setSort]=useState('newest'),[view,setView]=useState('grid');
 const [selected,setSelected]=useState<Asset|null>(null),[name,setName]=useState(''),[description,setDescription]=useState(''),[editing,setEditing]=useState(false),[menu,setMenu]=useState<string|null>(null),[busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[drag,setDrag]=useState(false),[results,setResults]=useState<{name:string;error?:string}[]>([]),[progress,setProgress]=useState(''),[notice,setNotice]=useState(''),[usage,setUsage]=useState<Usage|null>(null);
 const editorRef=useRef<ImageEditorHandle>(null);
 const fileRef=useRef<HTMLInputElement>(null),rootRef=useRef<HTMLDivElement>(null),detailRef=useRef<HTMLDivElement>(null),searchRef=useRef<HTMLInputElement>(null),uploadLock=useRef(false);
 const km=useKeymap();
 const live=useRef<{menu:string|null;selected:Asset|null;editing:boolean;usage:boolean;busy:boolean;purpose?:'cover'|'insert';onClose?:()=>void;assets:Asset[];copy:(asset:Asset)=>Promise<void>;show:(asset:Asset)=>void;prepareDelete:(asset:Asset)=>Promise<void>;closeDetail:()=>void}>(null!);
 const imagesOnly=purpose==='cover';
 async function refresh(){setError('');setLoading(true);try{setAssets(await request<Asset[]>('/api/media'));if(!purpose){try{const used=await request<{ids:string[];complete?:boolean}>('/api/media/referenced');if(used.complete===false){setReferenced(null);setNotice('Chưa đủ thông tin để xác định tệp không dùng.');}else setReferenced(new Set(used.ids));}catch{setReferenced(null);}}}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
 useEffect(()=>{void refresh();},[]);

 function matchesOrigin(asset:Asset){if(purpose||origin==='all')return true;if(origin==='unused')return !!referenced&&!referenced.has(asset.id);return sourceOf(asset)===origin;}
 const visible=assets.filter(a=>(!imagesOnly||assetKind(a.mimeType)==='image')&&(filter==='all'||assetKind(a.mimeType)===filter)&&matchesOrigin(a)&&`${a.filename} ${a.alt}`.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi'))).sort((a,b)=>sort==='name'?a.filename.localeCompare(b.filename,'vi'):sort==='size'?b.size-a.size:b.createdAt.localeCompare(a.createdAt));
 function show(a:Asset){setSelected(a);setName(a.filename);setDescription(a.alt);setUsage(null);setEditing(false);setMenu(null);setNotice('');}
 function closeDetail(){if(busy)return;if(editing){editorRef.current?.requestCancel();return;}setSelected(null);setEditing(false);setUsage(null);}

 async function upload(files:File[]){if(uploadLock.current||!files.length)return;uploadLock.current=true;setUploading(true);setResults([]);for(const [i,file] of files.entries()){setProgress(`${i+1}/${files.length} · ${file.name}`);try{validateAsset(file,imagesOnly);const body=new FormData();body.set('file',file);body.set('source','upload');const asset=await request<Asset>('/api/media',{method:'POST',body});setAssets(old=>[...old,asset]);setResults(old=>[...old,{name:file.name}]);}catch(e){setResults(old=>[...old,{name:file.name,error:(e as Error).message}]);}}setProgress('');setUploading(false);uploadLock.current=false;onChanged?.();}
 async function copy(a:Asset){try{await navigator.clipboard.writeText(new URL(url(a),location.origin).href);setNotice('Đã sao chép liên kết.');}catch{setNotice('Không thể sao chép. Hãy dùng địa chỉ từ nút tải xuống.');}}
 async function save(){if(!selected||busy)return;setBusy(true);try{const a=await request<Asset>(url(selected),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:name.trim(),alt:description.trim()})});setAssets(old=>old.map(x=>x.id===a.id?a:x));setSelected(a);setNotice('Đã lưu thông tin.');}catch(e){setNotice((e as Error).message);}finally{setBusy(false);}}
 async function prepareDelete(a:Asset){show(a);setBusy(true);try{setUsage(await request<Usage>(url(a)+'/usage'));}catch(e){setNotice((e as Error).message);}finally{setBusy(false);}}
 async function remove(){if(!selected||busy)return;setBusy(true);try{await request(url(selected),{method:'DELETE'});setAssets(old=>old.filter(a=>a.id!==selected.id));setSelected(null);setUsage(null);setNotice('Đã xóa tệp.');onChanged?.();}catch(e){setNotice((e as Error).message);}finally{setBusy(false);}}
 async function saveImage(file:File){
  if(!selected||busy)throw Error('Ảnh đang được xử lý.');
  setBusy(true);
  try{
   const body=new FormData();body.set('file',file);body.set('alt',selected.alt);body.set('source','edit');
   const copy=purpose==='insert';
   const a=await request<Asset>(copy?'/api/media':url(selected),{method:copy?'POST':'PUT',body});
   setAssets(old=>copy?[...old,a]:old.map(x=>x.id===a.id?a:x));
   setSelected(a);setName(a.filename);setDescription(a.alt);setRevision(v=>v+1);setEditing(false);
   onChanged?.();
   if(copy)onPick?.(a);else setNotice('Đã lưu ảnh.');
  }finally{setBusy(false);}
 }
 live.current={menu,selected,editing,usage:!!usage,busy,purpose,onClose,assets,copy,show,prepareDelete,closeDetail};
 useEffect(()=>{
  const current=()=>{const now=live.current;return now.selected||now.assets.find(asset=>asset.id===now.menu)||null;};
  const offs=[
   km.register('resource.find',()=>{searchRef.current?.focus();searchRef.current?.select();}),
   km.register('resource.upload',()=>fileRef.current?.click()),
   km.register('resource.view',()=>setView(mode=>mode==='grid'?'list':'grid')),
   km.register('resource.copy',()=>{const asset=current();if(asset)void live.current.copy(asset);}),
   km.register('resource.download',()=>{const asset=current();if(!asset)return;const link=document.createElement('a');link.href='/api/media/'+asset.id+'?download=1';link.click();}),
   km.register('resource.rename',()=>{const asset=current();if(!asset)return;live.current.show(asset);requestAnimationFrame(()=>detailRef.current?.querySelector('input')?.focus());}),
   km.register('resource.delete',()=>{if(live.current.purpose)return;const asset=current();if(asset)void live.current.prepareDelete(asset);}),
   km.pushLayer('resource',60,()=>{const now=live.current;if(now.editing)return false;if(now.menu){setMenu(null);return true;}if(now.usage){setUsage(null);return true;}if(now.selected){if(!now.busy)now.closeDetail();return true;}if(now.purpose){now.onClose?.();return true;}return false;}),
  ];
  return ()=>offs.forEach(off=>off());
 },[km]);
 const filterCount=Number(!imagesOnly&&filter!=='all')+Number(!purpose&&origin!=='all');
 const originLabels={all:'Tất cả nguồn',upload:'Tải lên',paste:'Dán',edit:'Đã sửa',unused:'Không còn dùng'};
 const clearFilters=()=>{setFilter('all');setOrigin('all');};
 const total=assets.filter(a=>!imagesOnly||assetKind(a.mimeType)==='image');
 return <div className={'resource-library'+(purpose?' resource-picker':'')} ref={rootRef} role={purpose?'dialog':undefined} aria-modal={purpose?true:undefined} aria-label={purpose?'Chọn tài nguyên':undefined} onDragOver={e=>{e.preventDefault();if(e.dataTransfer.types.includes('Files'))setDrag(true);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDrag(false);}} onDrop={e=>{e.preventDefault();setDrag(false);void upload(Array.from(e.dataTransfer.files));}}>
  <div className="resource-header"><div><span className="resource-eyebrow">KHÔNG GIAN TÀI NGUYÊN</span><h1>{imagesOnly?'Chọn ảnh đại diện':purpose?'Chèn tài nguyên':'Thư viện tài nguyên'}</h1><p>Ảnh, tài liệu và mọi thứ bạn cần cho bài viết.</p></div><div className="resource-header-actions"><CommandTip id="resource.upload" label="Tải tệp lên"><UiButton className="btn primary" disabled={uploading} onClick={()=>fileRef.current?.click()}><UploadCloud size={18}/>{uploading?'Đang tải…':'Tải tệp lên'}</UiButton></CommandTip>{purpose&&<UiButton className="resource-icon" aria-label="Đóng thư viện" onClick={onClose}><X size={20}/></UiButton>}</div></div>
  <UiInput hidden type="file" ref={fileRef} multiple accept={assetAccept(imagesOnly)} onChange={e=>{void upload(Array.from(e.target.files||[]));e.currentTarget.value='';}}/>
  <div className="resource-summary"><span><strong>{total.length}</strong> tài nguyên</span><span>{assetSize(total.reduce((sum,a)=>sum+a.size,0))} đã lưu</span><span>Kéo thả để tải lên · tối đa 50 MB/tệp</span></div>
  <div className="resource-toolbar"><CommandTip id="resource.find" label="Tìm tài nguyên"><label className="resource-search"><Search size={18}/><UiInput ref={searchRef} aria-label="Tìm tài nguyên" placeholder="Tìm theo tên hoặc mô tả…" value={query} onChange={e=>setQuery(e.target.value)}/></label></CommandTip>{!imagesOnly&&<Popover label="Bộ lọc tài nguyên" open={filtersOpen} onOpenChange={setFiltersOpen} trigger={<UiButton className="btn ghost resource-filter-trigger" data-active={filterCount>0}><SlidersHorizontal size={17}/>Bộ lọc{filterCount>0&&<span className="resource-filter-count">{filterCount}</span>}</UiButton>}><div className="resource-filter-panel"><div className="resource-filter-heading"><strong>Bộ lọc</strong><UiButton aria-label="Đóng bộ lọc" onClick={()=>setFiltersOpen(false)}><X size={18}/></UiButton></div><Field label="Loại tệp"><Select label="Loại tệp" value={filter} onValueChange={setFilter} options={Object.entries(labels).map(([value,label])=>({value,label:value==='all'?'Tất cả loại tệp':label}))}/></Field>{!purpose&&<Field label="Nguồn / tình trạng"><Select label="Nguồn / tình trạng" value={origin} onValueChange={v=>setOrigin(v as typeof origin)} options={Object.entries(originLabels).map(([value,label])=>({value,label}))}/></Field>}<div className="resource-filter-footer"><UiButton variant="ghost" disabled={!filterCount} onClick={clearFilters}>Xóa bộ lọc</UiButton><UiButton variant="primary" onClick={()=>setFiltersOpen(false)}>Xong</UiButton></div></div></Popover>}<Select label="Sắp xếp tài nguyên" value={sort} onValueChange={setSort} options={[{value:"newest",label:"Mới nhất trước"},{value:"name",label:"Tên A–Z"},{value:"size",label:"Dung lượng giảm dần"}]}/><CommandTip id="resource.view" label="Đổi dạng lưới hoặc danh sách"><ToggleGroup iconOnly className="resource-view" label="Dạng hiển thị" value={view} onValueChange={setView} items={[{value:"grid",name:"Dạng lưới",label:<LayoutGrid size={18}/>},{value:"list",name:"Dạng danh sách",label:<List size={18}/>}]}/></CommandTip></div>
  {filterCount>0&&<div className="resource-active-filters" aria-label="Bộ lọc đang áp dụng">{!imagesOnly&&filter!=='all'&&<UiButton aria-label={'Bỏ lọc loại: '+labels[filter]} onClick={()=>setFilter('all')}>Loại: {labels[filter]}<X size={14}/></UiButton>}{!purpose&&origin!=='all'&&<UiButton aria-label={'Bỏ lọc nguồn: '+originLabels[origin]} onClick={()=>setOrigin('all')}>{origin==='unused'?'Tình trạng':'Nguồn'}: {originLabels[origin]}<X size={14}/></UiButton>}<UiButton className="resource-clear-filters" onClick={clearFilters}>Xóa bộ lọc</UiButton><span role="status">{visible.length} kết quả</span></div>}
  {drag&&<div className="resource-drop"><UploadCloud size={40}/><strong>Thả tệp để tải lên</strong><span>Tối đa 50 MB mỗi tệp</span></div>}
  <div aria-live="polite">{progress&&<p className="resource-notice">Đang tải {progress}</p>}{notice&&<p className="resource-notice">{notice}</p>}</div>
  {!!results.length&&<Collapsible className="resource-results" key={results.length} defaultOpen={results.some(r=>r.error)} summary={<>Kết quả tải: {results.filter(r=>!r.error).length}/{results.length} thành công</>}>{results.map((r,i)=><div key={i}>{r.error?<AlertCircle size={16}/>:<CheckCircle2 size={16}/>}<span>{r.name}{r.error?` — ${r.error}`:' — Đã tải lên'}</span></div>)}</Collapsible>}
  {error?<div className="resource-empty" role="alert"><AlertCircle/><p>{error}</p><UiButton className="btn ghost" onClick={()=>void refresh()}>Thử lại</UiButton></div>:loading?<div className="resource-empty" role="status">Đang tải tài nguyên…</div>:!visible.length?<div className="resource-empty"><FolderOpen size={42}/><h3>{total.length?'Không tìm thấy tài nguyên':'Thư viện đang trống'}</h3><p>{total.length?'Thử đổi từ khóa hoặc bộ lọc.':'Tải tệp đầu tiên hoặc kéo thả vào đây.'}</p></div>:<div className={'resource-items '+view}>{visible.map(a=><article className="resource-card" key={a.id}>
   <UiButton className="resource-open" onClick={()=>show(a)} aria-label={'Xem '+a.filename}><Thumbnail asset={a} revision={revision}/><div className="resource-card-info"><strong><Ellipsis text={a.filename}/></strong><span>{assetExtension(a.filename).toUpperCase()} <i>·</i> {assetSize(a.size)}{!purpose&&<> <i>·</i> {sourceLabels[sourceOf(a)]}</>}</span></div><time dateTime={a.createdAt}>{new Date(a.createdAt).toLocaleDateString('vi-VN')}</time></UiButton>
   <div className="resource-card-menu"><DropdownMenu open={menu===a.id} onOpenChange={v=>setMenu(v?a.id:null)} trigger={<UiButton className="resource-icon" aria-label={'Thao tác với '+a.filename}><MoreHorizontal size={18}/></UiButton>}><MenuItem onSelect={()=>show(a)}>Thông tin / đổi tên <CommandKeys id="resource.rename"/></MenuItem><MenuItem onSelect={()=>void copy(a)}>Sao chép liên kết <CommandKeys id="resource.copy"/></MenuItem><MenuItem onSelect={()=>{const link=document.createElement('a');link.href=url(a)+'?download=1';link.click();}}>Tải xuống <CommandKeys id="resource.download"/></MenuItem>{!purpose&&<MenuItem onSelect={()=>void prepareDelete(a)}>Xóa tệp <CommandKeys id="resource.delete"/></MenuItem>}</DropdownMenu></div>
  </article>)}</div>}
  {selected&&<Sheet title={editing?"Chỉnh sửa ảnh":"Chi tiết tài nguyên"} busy={busy} closeOnOutside onOpenChange={v=>{if(!v)closeDetail();}} onEscape={()=>{if(editing)editorRef.current?.requestCancel();else closeDetail();}}><div className={'resource-detail'+(editing?' resource-sketch-detail':'')} ref={detailRef} role="dialog" aria-modal="true" tabIndex={-1} aria-label={'Chi tiết '+selected.filename}>
   <div className="resource-detail-heading"><h2>{editing?'Chỉnh sửa ảnh':'Chi tiết tài nguyên'}</h2><UiButton className="resource-icon" disabled={busy} aria-label="Đóng chi tiết" onClick={closeDetail}><X size={20}/></UiButton></div>
   {editing?<ImageEditor ref={editorRef} src={url(selected)+'?v='+selected.size+'-'+revision} filename={selected.filename} gif={selected.mimeType==='image/gif'} replace={purpose!=='insert'} saveLabel={purpose==='insert'?'Lưu và chèn':undefined} onCancel={()=>setEditing(false)} onSave={saveImage}/>:<>
    <div className="resource-preview">{assetKind(selected.mimeType)==='image'?<img src={url(selected)+'?v='+selected.size+'-'+revision} alt={selected.alt}/>:selected.mimeType==='application/pdf'?<iframe title={'Xem '+selected.filename} src={url(selected)}/>:assetKind(selected.mimeType)==='video'?<MediaPlayer key={selected.id} kind="video" src={url(selected)} label={selected.filename}/>:assetKind(selected.mimeType)==='audio'?<MediaPlayer key={selected.id} kind="audio" src={url(selected)} label={selected.filename}/>:<Thumbnail asset={selected}/>}</div>
    <div className="resource-file-meta"><span>{assetExtension(selected.filename).toUpperCase()}</span><span>{assetSize(selected.size)}</span><span>{new Date(selected.createdAt).toLocaleDateString('vi-VN')}</span></div>
    <label className="resource-field">Tên tệp<UiInput maxLength={180} value={name} onChange={e=>setName(e.target.value)}/></label><small className="resource-hint">Giữ nguyên đuôi .{assetExtension(selected.filename)}</small>
    <label className="resource-field">Mô tả{assetKind(selected.mimeType)==='image'?' / chữ thay thế':''}<UiTextarea rows={3} maxLength={300} value={description} onChange={e=>setDescription(e.target.value)}/></label>
    <div className="resource-detail-actions"><UiButton className="btn primary" disabled={busy||!name.trim()} onClick={()=>void save()}>Lưu thông tin</UiButton>{onPick&&<UiButton className="btn primary" disabled={busy} onClick={()=>onPick(selected)}>{imagesOnly?'Dùng làm ảnh bìa':assetKind(selected.mimeType)==='image'?'Chèn ảnh gốc':'Chèn vào bài'}</UiButton>}<a className="btn ghost" href={url(selected)+'?download=1'}><Download size={16}/>Tải xuống <CommandKeys id="resource.download"/></a><UiButton className="btn ghost" onClick={()=>void copy(selected)}><Copy size={16}/>Sao chép liên kết <CommandKeys id="resource.copy"/></UiButton>{assetKind(selected.mimeType)==='image'&&purpose!=='cover'&&<UiButton className="btn ghost" onClick={()=>setEditing(true)}><Pencil size={16}/>{purpose==='insert'?'Vẽ / chỉnh sửa':'Sửa ảnh'}</UiButton>}{!purpose&&<UiButton className="btn ghost resource-delete" disabled={busy} onClick={()=>void prepareDelete(selected)}><Trash2 size={16}/>Xóa tệp <CommandKeys id="resource.delete"/></UiButton>}</div>
    {usage&&<ConfirmDialog title="Xóa tệp này?" confirmLabel="Xóa vĩnh viễn" danger busy={busy} onCancel={()=>setUsage(null)} onConfirm={()=>void remove()}><p>{usage.uncertain?'Chưa đủ thông tin để khẳng định tệp không được dùng. ':''}{usage.folders.length||usage.docs.length||usage.comments.length||usage.history?.length?`Đang dùng ở: ${[...usage.folders.map(f=>'ảnh bìa '+f.title),...usage.docs.map(d=>'bài '+d.title),...(usage.comments.length?[usage.comments.length+' bình luận']:[]),...(usage.history?.length?[usage.history.length+' bản lịch sử']:[])].join('; ')}. Ảnh bìa sẽ được gỡ; liên kết trong bài, bình luận và lịch sử sẽ bị hỏng.`:'Tệp sẽ bị xóa khỏi ổ đĩa.'} Không hoàn tác được.</p></ConfirmDialog>}
   </>}{notice&&<p className="resource-notice" role="status">{notice}</p>}
  </div></Sheet>}
 </div>;
}
