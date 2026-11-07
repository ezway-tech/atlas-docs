'use client';
import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {X,RefreshCw,PanelLeft,PanelLeftClose} from 'lucide-react';
import {Button as UiButton} from './ui/controls';
import {Dialog} from './ui/dialog';
import {Tabs} from './ui/patterns';
import {CommandTip} from './Keys';
import {Tooltip} from './Tooltip';
import Diff,{type DiffMode} from './Diff';
import Markdown from './Markdown';
import {splitMarkdown} from '@/lib/headings';
import type {DocInfo} from '@/lib/types';
import {useApiError,useLocale} from './LocaleProvider';

type HistoryItem={id:string;capturedAt:string;reason:'edit'|'restore'|null;sizeBytes:number};
type Detail={items:HistoryItem[];totalCount:number;totalBytes:number;limits:{maxCount:number;maxBytes:number};nextCursor:string|null};
type ListStatus='loading'|'ready'|'empty'|'error';
type VersionStatus='idle'|'loading'|'ready'|'error';

const esc=(s:string)=>encodeURIComponent(s);
async function sha256(text:string){const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');}
function formatStamp(iso:string,formatDate:(v:string|number|Date)=>string,formatTime:(v:string|number|Date,opts?:Intl.DateTimeFormatOptions)=>string){const d=new Date(iso);if(Number.isNaN(d.getTime()))return iso;return formatDate(d)+' · '+formatTime(d,{hour:'2-digit',minute:'2-digit'});}
function formatDay(iso:string,t:(k:string)=>string,formatDate:(v:string|number|Date)=>string){const d=new Date(iso);if(Number.isNaN(d.getTime()))return '';const today=new Date();const yday=new Date();yday.setDate(today.getDate()-1);const same=(a:Date,b:Date)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();if(same(d,today))return t('history.day.today');if(same(d,yday))return t('history.day.yesterday');return formatDate(d);}
function formatBytes(n:number){if(n<1024)return n+' B';if(n<1024*1024)return Math.round(n/1024)+' KiB';return(Math.round(n/1024/1024*10)/10)+' MiB';}
function groupItems(items:HistoryItem[],t:(k:string)=>string,formatDate:(v:string|number|Date)=>string){const groups: {label:string;items:HistoryItem[]}[]=[];for(const item of items){const label=formatDay(item.capturedAt,t,formatDate);const last=groups[groups.length-1];if(last&&last.label===label)last.items.push(item);else groups.push({label,items:[item]});}return groups;}
function frontField(meta:string,key:string){const m=new RegExp('(?:^|\\n)'+key+':\\s*(?:"([^"]*)"|\'([^\']*)\'|(.+))','m').exec(meta);return(m?.[1]??m?.[2]??m?.[3]??'').trim();}
function parseVersionMd(raw:string){const {meta,body}=splitMarkdown(raw);return{title:frontField(meta,'title'),description:frontField(meta,'description'),body};}

export default function HistoryDialog({doc,dirty,dark,ask,onClose,onRestored,onNotify,restoreRef}:{doc:DocInfo;dirty:boolean;dark:boolean;ask:(opts:{title:string;body:string;ok:string;danger?:boolean})=>Promise<boolean>;onClose:()=>void;onRestored:(next:DocInfo)=>void;onNotify:(msg:string)=>void;restoreRef?:React.MutableRefObject<(()=>void)|null>}){
 const {t,formatDate,formatTime}=useLocale();
 const apiError=useApiError();
 const reasonLabel=(reason:HistoryItem['reason'])=>reason==='edit'?t('history.reason.edit'):reason==='restore'?t('history.reason.restore'):t('history.reason.save');
 const [versionGone,setVersionGone]=useState(false);
 const [listStatus,setListStatus]=useState<ListStatus>('loading');
 const [listError,setListError]=useState('');
 const [detail,setDetail]=useState<Detail|null>(null);
 const [selected,setSelected]=useState('');
 const [versionStatus,setVersionStatus]=useState<VersionStatus>('idle');
 const [versionError,setVersionError]=useState('');
 const [versionRaw,setVersionRaw]=useState('');
 const [tab,setTab]=useState<'content'|'diff'>('content');
 const [mobileList,setMobileList]=useState(false);
 const [listOpen,setListOpen]=useState(true);
 const [wide,setWide]=useState(true);
 const [prefer,setPrefer]=useState<DiffMode|null>(null);
 const diffMode:DiffMode=wide?(prefer??'split'):'unified';
 const [busy,setBusy]=useState(false);
 const [stale,setStale]=useState(false);
 const baseHash=useRef('');
 const listReq=useRef(0);
 const versionReq=useRef(0);
 const openRef=useRef(true);

 const loadList=useCallback(async(cursor?:string|null)=>{
  const id=++listReq.current;
  if(!cursor){setListStatus('loading');setListError('');setStale(false);}
  try{
   const url='/api/history?id='+esc(doc.id)+'&detail=1'+(cursor?'&cursor='+esc(cursor):'');
   const resp=await fetch(url,{cache:'no-store'});
   const data=await resp.json();
   if(!resp.ok)throw Error(data.error||resp.statusText);
   if(id!==listReq.current||!openRef.current)return;
   const page=data as Detail;
   setDetail(prev=>{
    if(!cursor||!prev)return page;
    return{...page,items:[...prev.items,...page.items]};
   });
   if(!cursor){
    if(!page.items.length){setListStatus('empty');setSelected('');setVersionStatus('idle');setVersionRaw('');}
    else{setListStatus('ready');setSelected(page.items[0].id);}
   }
  }catch(e){
   if(id!==listReq.current||!openRef.current)return;
   if(!cursor){setListStatus('error');setListError((e as Error).message);}
   else onNotify((e as Error).message);
  }
 },[doc.id,onNotify]);

 useEffect(()=>{openRef.current=true;void sha256(doc.raw||'').then(h=>{baseHash.current=h;});void loadList();return()=>{openRef.current=false;};},[doc.id]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{const mq=window.matchMedia('(min-width:900px)');const apply=()=>setWide(mq.matches);apply();mq.addEventListener('change',apply);return()=>mq.removeEventListener('change',apply);},[]);

 useEffect(()=>{
  if(!selected||listStatus!=='ready')return;
  const id=++versionReq.current;
  setVersionStatus('loading');setVersionError('');setVersionRaw('');
  fetch('/api/history?id='+esc(doc.id)+'&revision='+esc(selected),{cache:'no-store'}).then(async resp=>{
   const data=await resp.json();
   if(id!==versionReq.current||!openRef.current)return;
   if(resp.status===404){setVersionGone(true);setVersionStatus('error');setVersionError(t('history.versionGone'));return;}
   if(!resp.ok)throw Error(data.error||resp.statusText);
   setVersionRaw(String(data.raw??''));setVersionStatus('ready');
  }).catch(e=>{if(id!==versionReq.current||!openRef.current)return;setVersionStatus('error');setVersionError((e as Error).message);});
 },[selected,doc.id,listStatus]);

 const selectedItem=detail?.items.find(x=>x.id===selected);
 const identical=versionStatus==='ready'&&versionRaw===(doc.raw||'');
 const canRestore=listStatus==='ready'&&versionStatus==='ready'&&!!selected&&!identical&&!dirty&&!busy&&!stale;

 const restore=useCallback(async()=>{
  if(!canRestore||!selectedItem)return;
  const when=formatStamp(selectedItem.capturedAt,formatDate,formatTime);
  if(!await ask({title:t('history.restore.confirmTitle'),body:t('history.restore.confirmBody',{when}),ok:t('history.restore')}))return;
  setBusy(true);
  try{
   const resp=await fetch('/api/history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:doc.id,version:selected,baseHash:baseHash.current})});
   const data=await resp.json();
   if(resp.status===409){setStale(true);onNotify(t('history.conflict409'));return;}
   if(resp.status===404){onNotify(apiError(data,t('history.versionMissing')));void loadList();return;}
   if(!resp.ok)throw Error(data.error||resp.statusText);
   onRestored(data as DocInfo);onClose();onNotify(t('history.toast.restored'));
  }catch(e){onNotify(apiError(e));}
  finally{setBusy(false);}
 },[ask,apiError,canRestore,doc.id,formatDate,formatTime,loadList,onClose,onNotify,onRestored,selected,selectedItem,t]);

 useEffect(()=>{if(restoreRef)restoreRef.current=()=>{void restore();};return()=>{if(restoreRef)restoreRef.current=null;};},[restore,restoreRef]);

 const groups=useMemo(()=>groupItems(detail?.items||[],t,formatDate),[detail,t,formatDate]);
 const kind=doc.kind||'md';
 const parsed=useMemo(()=>kind==='md'?parseVersionMd(versionRaw):null,[kind,versionRaw]);

 const versionList=<div className="history-versions" role="listbox" aria-label={t('history.versionsAria')}>
  {groups.map(g=><div key={g.label} className="history-day"><div className="history-day-label">{g.label}</div>{g.items.map(item=>{
   const active=item.id===selected;
   const time=formatTime(item.capturedAt,{hour:'2-digit',minute:'2-digit'});
   return <UiButton type="button" role="option" aria-selected={active} className={active?'active':''} key={item.id} onClick={()=>{setSelected(item.id);setMobileList(false);}}>
    <span className="history-dot" aria-hidden>{active?'●':'○'}</span>
    <span className="history-ver-text"><strong>{time}</strong><small>{reasonLabel(item.reason)}</small></span>
   </UiButton>;
  })}</div>)}
  {detail?.nextCursor&&<UiButton type="button" className="btn ghost history-more" onClick={()=>void loadList(detail.nextCursor)}>{t('history.loadMore')}</UiButton>}
 </div>;

 const contentPane=(()=>{
  if(versionStatus==='loading')return <div className="history-empty">{t('history.loading.version')}</div>;
  if(versionStatus==='error')return <div className="history-empty">{versionError}<div className="history-diff-actions"><UiButton className="btn ghost" type="button" onClick={()=>{if(versionGone)void loadList();else{const cur=selected;setSelected('');queueMicrotask(()=>setSelected(cur));}}}>{versionGone?t('history.reloadList'):t('common.retry')}</UiButton></div></div>;
  if(versionStatus!=='ready')return null;
  if(!versionRaw)return <div className="history-empty">{t('history.empty.version')}</div>;
  if(kind==='md')return <div className="history-read"><div className="doc-meta">{doc.category}</div><h1>{parsed?.title||doc.title}</h1>{parsed?.description?<p className="doc-lead">{parsed.description}</p>:null}<hr/><Markdown content={parsed?.body||versionRaw} docId={doc.id} dark={dark}/></div>;
  return <div className="history-read history-code-wrap"><pre className="history-code">{versionRaw||' '}</pre></div>;
 })();
 const stamp=(iso:string)=>formatStamp(iso,formatDate,formatTime);
 const reading=versionStatus==='ready'&&selectedItem?<div className="history-reading"><strong>{t('history.readingBanner',{stamp:stamp(selectedItem.capturedAt)})}</strong><span>{reasonLabel(selectedItem.reason)}</span></div>:null;

 const restoreHint=dirty?t('history.hint.saveFirst'):stale?t('history.hint.stale'):identical?t('history.hint.identical'):versionStatus==='loading'?t('history.loading.version'):versionStatus==='error'?versionError:busy?t('history.hint.restoring'):'';

 return <Dialog title={t('history.dialog.title')} overlayClassName="history-backdrop" onOpenChange={v=>{if(!v)onClose();}}>
  <div className={'modal wide history-modal'+(listOpen?'':' is-collapsed')}>
   <div className="modal-heading">{listStatus==='ready'&&<Tooltip content={listOpen?t('history.toggleListHide'):t('history.toggleListShow')}><UiButton type="button" className="history-list-toggle" aria-label={listOpen?t('history.toggleListHide'):t('history.toggleListShow')} aria-pressed={listOpen} onClick={()=>setListOpen(v=>!v)}>{listOpen?<PanelLeftClose size={16}/>:<PanelLeft size={16}/>}</UiButton></Tooltip>}<div className="history-heading-copy"><h2>{t('history.dialog.title')}</h2><span className="history-doc-sep" aria-hidden>·</span><span className="history-doc-title" title={doc.title}>{doc.title}</span></div><UiButton aria-label={t('common.close')} onClick={onClose}><X/></UiButton></div>
   {listStatus==='loading'&&<div className="history-empty">{t('history.loading.list')}</div>}
   {listStatus==='error'&&<div className="history-empty">{listError}<div className="history-diff-actions"><UiButton className="btn ghost" type="button" onClick={()=>void loadList()}>{t('common.retry')}</UiButton></div></div>}
   {listStatus==='empty'&&<div className="history-empty">{t('history.empty.list')}</div>}
   {listStatus==='ready'&&detail&&<>
    <div className="history-mobile-pick"><UiButton type="button" className="btn ghost" aria-expanded={mobileList} onClick={()=>setMobileList(v=>!v)}>{selectedItem?`${stamp(selectedItem.capturedAt)} · ${reasonLabel(selectedItem.reason)}`:t('history.pickVersion')}</UiButton>{mobileList&&versionList}</div>
    <div className="history-grid">
     <div className="history-col-list"><div className="history-col-title"><span>{t('history.pickVersion')}</span></div>{versionList}</div>
     <div className="history-col-main">
      <Tabs className="history-tabs" label={t('history.pickVersion')} actions={reading} value={tab} onValueChange={v=>setTab(v as 'content'|'diff')} items={[
       {value:'content',label:t('history.tab.content'),content:<div className="history-pane" key={selected}><div className="history-pane-body">{contentPane}</div></div>},
       {value:'diff',label:t('history.tab.diff'),content:<div className="history-pane history-pane-diff" key={selected}>{versionStatus==='ready'?<Diff before={versionRaw} after={doc.raw||''} mode={diffMode} canSplit={wide} onMode={setPrefer} onShowContent={()=>setTab('content')}/>:contentPane}</div>}
      ]}/>
     </div>
    </div>
   </>}
   <div className="modal-actions history-footer">
    <span className="history-quota">{detail?t('history.quota',{count:detail.totalCount,maxCount:detail.limits.maxCount,bytes:formatBytes(detail.totalBytes),maxBytes:formatBytes(detail.limits.maxBytes)}):''}{restoreHint&&<em> · {restoreHint}</em>}</span>
    <div className="history-footer-btns">
     {stale&&<UiButton className="btn ghost" type="button" onClick={()=>void loadList()}>{t('history.reloadList')}</UiButton>}
     <UiButton className="btn ghost" type="button" onClick={onClose}>{t('common.close')}</UiButton>
     {listStatus!=='empty'&&<CommandTip id="history.restore" label={selectedItem?t('history.restoreVersion',{stamp:stamp(selectedItem.capturedAt)}):t('history.restore')}><UiButton className="btn primary" type="button" disabled={!canRestore} onClick={()=>void restore()}><RefreshCw size={15}/> {selectedItem?t('history.restoreVersion',{stamp:stamp(selectedItem.capturedAt)}):t('history.restore')}</UiButton></CommandTip>}
    </div>
   </div>
  </div>
 </Dialog>;
}
