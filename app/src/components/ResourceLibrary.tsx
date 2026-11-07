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
import {useApiError,useLocale} from './LocaleProvider';

type Usage={folders:{title:string}[];docs:{title:string}[];comments:{id:string}[];history?:{docId:string}[];uncertain?:boolean};
type Props={purpose?:'cover'|'insert';onPick?:(asset:Asset)=>void;onClose?:()=>void;onChanged?:()=>void};
async function request<T>(url:string,init?:RequestInit):Promise<T>{const r=await fetch(url,{cache:'no-store',...init});const data=await r.json();if(!r.ok)throw Error(data.error||'errors.request.failed');return data;}
function sourceOf(asset:Asset){return asset.source==='paste'||asset.source==='edit'?asset.source:'upload';}
const icons={image:ImageIcon,document:FileText,video:Film,audio:Music,archive:Archive};
const url=(a:Asset)=>'/api/media/'+a.id;
function Thumbnail({asset,revision=0}:{asset:Asset;revision?:number}){const kind=assetKind(asset.mimeType),Icon=icons[kind];return <div className={'resource-thumb kind-'+kind}>{kind==='image'?<img loading="lazy" src={url(asset)+'?v='+asset.size+'-'+revision} alt={asset.alt}/>:<><Icon size={40}/><span>{assetExtension(asset.filename).toUpperCase()}</span></>}</div>;}
export default function ResourceLibrary({purpose,onPick,onClose,onChanged}:Props){
 const {t,formatDate,compareText,lowerText}=useLocale();
 const apiError=useApiError();
 const typeKey=(k:string)=>t(('resources.type.'+k) as 'resources.type.all');
 const originKey=(k:'all'|'upload'|'paste'|'edit'|'unused')=>k==='all'?t('resources.filter.originAll'):t(('resources.source.'+k) as 'resources.source.upload');
 const usagePlaces=(u:Usage)=>[...u.folders.map(f=>t('resources.delete.placeCover',{title:f.title})),...u.docs.map(d=>t('resources.delete.placeDoc',{title:d.title})),...(u.comments.length?[t('resources.delete.placeComments',{count:u.comments.length})]:[]),...(u.history?.length?[t('resources.delete.placeHistory',{count:u.history.length})]:[])].join('; ');
 const [revision,setRevision]=useState(0);
 const [filtersOpen,setFiltersOpen]=useState(false);
 const [assets,setAssets]=useState<Asset[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[origin,setOrigin]=useState<'all'|'upload'|'paste'|'edit'|'unused'>('all'),[referenced,setReferenced]=useState<Set<string>|null>(null),[sort,setSort]=useState('newest'),[view,setView]=useState('grid');
 const [selected,setSelected]=useState<Asset|null>(null),[name,setName]=useState(''),[description,setDescription]=useState(''),[editing,setEditing]=useState(false),[menu,setMenu]=useState<string|null>(null),[busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[drag,setDrag]=useState(false),[results,setResults]=useState<{name:string;error?:string}[]>([]),[progress,setProgress]=useState(''),[notice,setNotice]=useState(''),[usage,setUsage]=useState<Usage|null>(null);
 const editorRef=useRef<ImageEditorHandle>(null);
 const fileRef=useRef<HTMLInputElement>(null),rootRef=useRef<HTMLDivElement>(null),detailRef=useRef<HTMLDivElement>(null),searchRef=useRef<HTMLInputElement>(null),uploadLock=useRef(false);
 const km=useKeymap();
 const live=useRef<{menu:string|null;selected:Asset|null;editing:boolean;usage:boolean;busy:boolean;purpose?:'cover'|'insert';onClose?:()=>void;assets:Asset[];copy:(asset:Asset)=>Promise<void>;show:(asset:Asset)=>void;prepareDelete:(asset:Asset)=>Promise<void>;closeDetail:()=>void}>(null!);
 const imagesOnly=purpose==='cover';
 async function refresh(){setError('');setLoading(true);try{setAssets(await request<Asset[]>('/api/media'));if(!purpose){try{const used=await request<{ids:string[];complete?:boolean}>('/api/media/referenced');if(used.complete===false){setReferenced(null);setNotice(t('resources.toast.unreferencedIncomplete'));}else setReferenced(new Set(used.ids));}catch{setReferenced(null);}}}catch(e){setError(apiError(e));}finally{setLoading(false);}}
 useEffect(()=>{void refresh();},[]);

 function matchesOrigin(asset:Asset){if(purpose||origin==='all')return true;if(origin==='unused')return !!referenced&&!referenced.has(asset.id);return sourceOf(asset)===origin;}
 const visible=assets.filter(a=>(!imagesOnly||assetKind(a.mimeType)==='image')&&(filter==='all'||assetKind(a.mimeType)===filter)&&matchesOrigin(a)&&lowerText(`${a.filename} ${a.alt}`).includes(lowerText(query.trim()))).sort((a,b)=>sort==='name'?compareText(a.filename,b.filename):sort==='size'?b.size-a.size:compareText(b.createdAt,a.createdAt));
 function show(a:Asset){setSelected(a);setName(a.filename);setDescription(a.alt);setUsage(null);setEditing(false);setMenu(null);setNotice('');}
 function closeDetail(){if(busy)return;if(editing){editorRef.current?.requestCancel();return;}setSelected(null);setEditing(false);setUsage(null);}

 async function upload(files:File[]){if(uploadLock.current||!files.length)return;uploadLock.current=true;setUploading(true);setResults([]);for(const [i,file] of files.entries()){setProgress(`${i+1}/${files.length} · ${file.name}`);try{validateAsset(file,imagesOnly);const body=new FormData();body.set('file',file);body.set('source','upload');const asset=await request<Asset>('/api/media',{method:'POST',body});setAssets(old=>[...old,asset]);setResults(old=>[...old,{name:file.name}]);}catch(e){setResults(old=>[...old,{name:file.name,error:apiError(e)}]);}}setProgress('');setUploading(false);uploadLock.current=false;onChanged?.();}
 async function copy(a:Asset){try{await navigator.clipboard.writeText(new URL(url(a),location.origin).href);setNotice(t('resources.toast.linkCopied'));}catch{setNotice(t('resources.toast.copyFailed'));}}
 async function save(){if(!selected||busy)return;setBusy(true);try{const a=await request<Asset>(url(selected),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:name.trim(),alt:description.trim()})});setAssets(old=>old.map(x=>x.id===a.id?a:x));setSelected(a);setNotice(t('resources.toast.savedMeta'));}catch(e){setNotice(apiError(e));}finally{setBusy(false);}}
 async function prepareDelete(a:Asset){show(a);setBusy(true);try{setUsage(await request<Usage>(url(a)+'/usage'));}catch(e){setNotice(apiError(e));}finally{setBusy(false);}}
 async function remove(){if(!selected||busy)return;setBusy(true);try{await request(url(selected),{method:'DELETE'});setAssets(old=>old.filter(a=>a.id!==selected.id));setSelected(null);setUsage(null);setNotice(t('resources.toast.deleted'));onChanged?.();}catch(e){setNotice(apiError(e));}finally{setBusy(false);}}
 async function saveImage(file:File){
  if(!selected||busy)throw Error('errors.asset.busyProcessing');
  setBusy(true);
  try{
   const body=new FormData();body.set('file',file);body.set('alt',selected.alt);body.set('source','edit');
   const copy=purpose==='insert';
   const a=await request<Asset>(copy?'/api/media':url(selected),{method:copy?'POST':'PUT',body});
   setAssets(old=>copy?[...old,a]:old.map(x=>x.id===a.id?a:x));
   setSelected(a);setName(a.filename);setDescription(a.alt);setRevision(v=>v+1);setEditing(false);
   onChanged?.();
   if(copy)onPick?.(a);else setNotice(t('resources.toast.savedImage'));
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
 const clearFilters=()=>{setFilter('all');setOrigin('all');};
 const typeOptions=['all','image','document','video','audio','archive'] as const;
 const originOptions=['all','upload','paste','edit','unused'] as const;
 const total=assets.filter(a=>!imagesOnly||assetKind(a.mimeType)==='image');
 return <div className={'resource-library'+(purpose?' resource-picker':'')} ref={rootRef} role={purpose?'dialog':undefined} aria-modal={purpose?true:undefined} aria-label={purpose?t('resources.titlePick'):undefined} onDragOver={e=>{e.preventDefault();if(e.dataTransfer.types.includes('Files'))setDrag(true);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDrag(false);}} onDrop={e=>{e.preventDefault();setDrag(false);void upload(Array.from(e.dataTransfer.files));}}>
  <div className="resource-header"><div><span className="resource-eyebrow">{t('resources.eyebrow')}</span><h1>{imagesOnly?t('resources.titleCover'):purpose?t('resources.titlePick'):t('resources.title')}</h1><p>{t('resources.blurb')}</p></div><div className="resource-header-actions"><CommandTip id="resource.upload" label={t('resources.upload')}><UiButton className="btn primary" disabled={uploading} onClick={()=>fileRef.current?.click()}><UploadCloud size={18}/>{uploading?t('resources.uploading'):t('resources.upload')}</UiButton></CommandTip>{purpose&&<UiButton className="resource-icon" aria-label={t('resources.closeLibrary')} onClick={onClose}><X size={20}/></UiButton>}</div></div>
  <UiInput hidden type="file" ref={fileRef} multiple accept={assetAccept(imagesOnly)} onChange={e=>{void upload(Array.from(e.target.files||[]));e.currentTarget.value='';}}/>
  <div className="resource-summary"><span>{t('resources.summary.count',{count:total.length})}</span><span>{t('resources.summary.size',{size:assetSize(total.reduce((sum,a)=>sum+a.size,0))})}</span><span>{t('resources.summary.hint')}</span></div>
  <div className="resource-toolbar"><CommandTip id="resource.find" label={t('resources.search.label')}><label className="resource-search"><Search size={18}/><UiInput ref={searchRef} aria-label={t('resources.search.label')} placeholder={t('resources.search.placeholder')} value={query} onChange={e=>setQuery(e.target.value)}/></label></CommandTip>{!imagesOnly&&<Popover label={t('resources.filter.panel')} open={filtersOpen} onOpenChange={setFiltersOpen} trigger={<UiButton className="btn ghost resource-filter-trigger" data-active={filterCount>0}><SlidersHorizontal size={17}/>{t('resources.filter.title')}{filterCount>0&&<span className="resource-filter-count">{filterCount}</span>}</UiButton>}><div className="resource-filter-panel"><div className="resource-filter-heading"><strong>{t('resources.filter.title')}</strong><UiButton aria-label={t('resources.filter.close')} onClick={()=>setFiltersOpen(false)}><X size={18}/></UiButton></div><Field label={t('resources.filter.type')}><Select label={t('resources.filter.type')} value={filter} onValueChange={setFilter} options={typeOptions.map(value=>({value,label:value==='all'?t('resources.filter.typeAll'):typeKey(value)}))}/></Field>{!purpose&&<Field label={t('resources.filter.origin')}><Select label={t('resources.filter.origin')} value={origin} onValueChange={v=>setOrigin(v as typeof origin)} options={originOptions.map(value=>({value,label:originKey(value)}))}/></Field>}<div className="resource-filter-footer"><UiButton variant="ghost" disabled={!filterCount} onClick={clearFilters}>{t('resources.filter.clear')}</UiButton><UiButton variant="primary" onClick={()=>setFiltersOpen(false)}>{t('common.done')}</UiButton></div></div></Popover>}<Select label={t('resources.search.label')} value={sort} onValueChange={setSort} options={[{value:'newest',label:t('resources.sort.newest')},{value:'name',label:t('resources.sort.name')},{value:'size',label:t('resources.sort.size')}]}/><CommandTip id="resource.view" label={t('resources.view.grid')}><ToggleGroup iconOnly className="resource-view" label={t('resources.view.grid')} value={view} onValueChange={setView} items={[{value:'grid',name:t('resources.view.grid'),label:<LayoutGrid size={18}/>},{value:'list',name:t('resources.view.list'),label:<List size={18}/>}]}/></CommandTip></div>
  {filterCount>0&&<div className="resource-active-filters" aria-label={t('resources.filter.title')}>{!imagesOnly&&filter!=='all'&&<UiButton aria-label={t('resources.filter.chipType',{type:typeKey(filter)})} onClick={()=>setFilter('all')}>{t('resources.filter.chipType',{type:typeKey(filter)})}<X size={14}/></UiButton>}{!purpose&&origin!=='all'&&<UiButton aria-label={(origin==='unused'?t('resources.filter.chipStatus',{origin:originKey(origin)}):t('resources.filter.chipOrigin',{origin:originKey(origin)}))} onClick={()=>setOrigin('all')}>{origin==='unused'?t('resources.filter.chipStatus',{origin:originKey(origin)}):t('resources.filter.chipOrigin',{origin:originKey(origin)})}<X size={14}/></UiButton>}<UiButton className="resource-clear-filters" onClick={clearFilters}>{t('resources.filter.clear')}</UiButton><span role="status">{t('resources.filter.resultsCount',{count:visible.length})}</span></div>}
  {drag&&<div className="resource-drop"><UploadCloud size={40}/><strong>{t('resources.drop.title')}</strong><span>{t('resources.drop.limit')}</span></div>}
  <div aria-live="polite">{progress&&<p className="resource-notice">{t('resources.upload.progress',{progress})}</p>}{notice&&<p className="resource-notice">{notice}</p>}</div>
  {!!results.length&&<Collapsible className="resource-results" key={results.length} defaultOpen={results.some(r=>r.error)} summary={<>{t('resources.upload.resultsTitle',{ok:results.filter(r=>!r.error).length,total:results.length})}</>}>{results.map((r,i)=><div key={i}>{r.error?<AlertCircle size={16}/>:<CheckCircle2 size={16}/>}<span>{r.name}{r.error?` — ${r.error}`:t('resources.upload.itemUploaded')}</span></div>)}</Collapsible>}
  {error?<div className="resource-empty" role="alert"><AlertCircle/><p>{error}</p><UiButton className="btn ghost" onClick={()=>void refresh()}>{t('common.retry')}</UiButton></div>:loading?<div className="resource-empty" role="status">{t('resources.empty.loading')}</div>:!visible.length?<div className="resource-empty"><FolderOpen size={42}/><h3>{total.length?t('resources.empty.noMatch'):t('resources.empty.none')}</h3><p>{total.length?t('resources.empty.noMatchHint'):t('resources.empty.noneHint')}</p></div>:<div className={'resource-items '+view}>{visible.map(a=><article className="resource-card" key={a.id}>
   <UiButton className="resource-open" onClick={()=>show(a)} aria-label={t('resources.viewFile',{name:a.filename})}><Thumbnail asset={a} revision={revision}/><div className="resource-card-info"><strong><Ellipsis text={a.filename}/></strong><span>{assetExtension(a.filename).toUpperCase()} <i>·</i> {assetSize(a.size)}{!purpose&&<> <i>·</i> {originKey(sourceOf(a))}</>}</span></div><time dateTime={a.createdAt}>{formatDate(a.createdAt)}</time></UiButton>
   <div className="resource-card-menu"><DropdownMenu open={menu===a.id} onOpenChange={v=>setMenu(v?a.id:null)} trigger={<UiButton className="resource-icon" aria-label={t('resources.openMenu')}><MoreHorizontal size={18}/></UiButton>}><MenuItem onSelect={()=>show(a)}>{t('resources.menu.info')} <CommandKeys id="resource.rename"/></MenuItem><MenuItem onSelect={()=>void copy(a)}>{t('resources.menu.copyLink')} <CommandKeys id="resource.copy"/></MenuItem><MenuItem onSelect={()=>{const link=document.createElement('a');link.href=url(a)+'?download=1';link.click();}}>{t('resources.menu.download')} <CommandKeys id="resource.download"/></MenuItem>{!purpose&&<MenuItem onSelect={()=>void prepareDelete(a)}>{t('resources.detail.delete')} <CommandKeys id="resource.delete"/></MenuItem>}</DropdownMenu></div>
  </article>)}</div>}
  {selected&&<Sheet title={editing?t('resources.detail.editImage'):t('resources.detail.title')} busy={busy} closeOnOutside onOpenChange={v=>{if(!v)closeDetail();}} onEscape={()=>{if(editing)editorRef.current?.requestCancel();else closeDetail();}}><div className={'resource-detail'+(editing?' resource-sketch-detail':'')} ref={detailRef} role="dialog" aria-modal="true" tabIndex={-1} aria-label={t('resources.detail.title')+' '+selected.filename}>
   <div className="resource-detail-heading"><h2>{editing?t('resources.detail.editImage'):t('resources.detail.title')}</h2><UiButton className="resource-icon" disabled={busy} aria-label={t('common.close')} onClick={closeDetail}><X size={20}/></UiButton></div>
   {editing?<ImageEditor ref={editorRef} src={url(selected)+'?v='+selected.size+'-'+revision} filename={selected.filename} gif={selected.mimeType==='image/gif'} replace={purpose!=='insert'} saveLabel={purpose==='insert'?t('resources.detail.saveAndInsert'):undefined} onCancel={()=>setEditing(false)} onSave={saveImage}/>:<>
    <div className="resource-preview">{assetKind(selected.mimeType)==='image'?<img src={url(selected)+'?v='+selected.size+'-'+revision} alt={selected.alt}/>:selected.mimeType==='application/pdf'?<iframe title={t('resources.viewFile',{name:selected.filename})} src={url(selected)}/>:assetKind(selected.mimeType)==='video'?<MediaPlayer key={selected.id} kind="video" src={url(selected)} label={selected.filename}/>:assetKind(selected.mimeType)==='audio'?<MediaPlayer key={selected.id} kind="audio" src={url(selected)} label={selected.filename}/>:<Thumbnail asset={selected}/>}</div>
    <div className="resource-file-meta"><span>{assetExtension(selected.filename).toUpperCase()}</span><span>{assetSize(selected.size)}</span><span>{formatDate(selected.createdAt)}</span></div>
    <label className="resource-field">{t('resources.detail.filename')}<UiInput maxLength={180} value={name} onChange={e=>setName(e.target.value)}/></label><small className="resource-hint">{t('resources.detail.keepExtension',{ext:assetExtension(selected.filename)})}</small>
    <label className="resource-field">{assetKind(selected.mimeType)==='image'?t('resources.detail.descriptionAlt'):t('resources.detail.description')}<UiTextarea rows={3} maxLength={300} value={description} onChange={e=>setDescription(e.target.value)}/></label>
    <div className="resource-detail-actions"><UiButton className="btn primary" disabled={busy||!name.trim()} onClick={()=>void save()}>{t('resources.detail.save')}</UiButton>{onPick&&<UiButton className="btn primary" disabled={busy} onClick={()=>onPick(selected)}>{imagesOnly?t('resources.detail.useCover'):assetKind(selected.mimeType)==='image'?t('resources.detail.insertOriginal'):t('resources.detail.insertFile')}</UiButton>}<a className="btn ghost" href={url(selected)+'?download=1'}><Download size={16}/>{t('resources.menu.download')} <CommandKeys id="resource.download"/></a><UiButton className="btn ghost" onClick={()=>void copy(selected)}><Copy size={16}/>{t('resources.menu.copyLink')} <CommandKeys id="resource.copy"/></UiButton>{assetKind(selected.mimeType)==='image'&&purpose!=='cover'&&<UiButton className="btn ghost" onClick={()=>setEditing(true)}><Pencil size={16}/>{purpose==='insert'?t('resources.detail.drawEdit'):t('resources.detail.editImageBtn')}</UiButton>}{!purpose&&<UiButton className="btn ghost resource-delete" disabled={busy} onClick={()=>void prepareDelete(selected)}><Trash2 size={16}/>{t('resources.detail.delete')} <CommandKeys id="resource.delete"/></UiButton>}</div>
    {usage&&<ConfirmDialog title={t('resources.delete.title')} confirmLabel={t('resources.delete.confirm')} danger busy={busy} onCancel={()=>setUsage(null)} onConfirm={()=>void remove()}><p>{usage.uncertain?t('resources.delete.uncertainPrefix')+' ':''}{usage.folders.length||usage.docs.length||usage.comments.length||usage.history?.length?t('resources.delete.inUse',{places:usagePlaces(usage)}):t('resources.delete.onDiskOnly')} {t('common.noUndo')}</p></ConfirmDialog>}
   </>}{notice&&<p className="resource-notice" role="status">{notice}</p>}
  </div></Sheet>}
 </div>;
}
