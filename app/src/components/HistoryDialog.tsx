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

type HistoryItem={id:string;capturedAt:string;reason:'edit'|'restore'|null;sizeBytes:number};
type Detail={items:HistoryItem[];totalCount:number;totalBytes:number;limits:{maxCount:number;maxBytes:number};nextCursor:string|null};
type ListStatus='loading'|'ready'|'empty'|'error';
type VersionStatus='idle'|'loading'|'ready'|'error';

const esc=(s:string)=>encodeURIComponent(s);
async function sha256(text:string){const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');}
function reasonLabel(reason:HistoryItem['reason']){return reason==='edit'?'Trước khi chỉnh sửa':reason==='restore'?'Trước khi khôi phục':'Bản đã lưu';}
function formatStamp(iso:string){const d=new Date(iso);if(Number.isNaN(d.getTime()))return iso;const p=(n:number)=>String(n).padStart(2,'0');return p(d.getDate())+'/'+p(d.getMonth()+1)+' · '+p(d.getHours())+':'+p(d.getMinutes());}
function formatDay(iso:string){const d=new Date(iso);if(Number.isNaN(d.getTime()))return '';const today=new Date();const yday=new Date();yday.setDate(today.getDate()-1);const same=(a:Date,b:Date)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();if(same(d,today))return 'Hôm nay';if(same(d,yday))return 'Hôm qua';return d.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'});}
function formatBytes(n:number){if(n<1024)return n+' B';if(n<1024*1024)return Math.round(n/1024)+' KiB';return(Math.round(n/1024/1024*10)/10)+' MiB';}
function groupItems(items:HistoryItem[]){const groups: {label:string;items:HistoryItem[]}[]=[];for(const item of items){const label=formatDay(item.capturedAt);const last=groups[groups.length-1];if(last&&last.label===label)last.items.push(item);else groups.push({label,items:[item]});}return groups;}
function frontField(meta:string,key:string){const m=new RegExp('(?:^|\\n)'+key+':\\s*(?:"([^"]*)"|\'([^\']*)\'|(.+))','m').exec(meta);return(m?.[1]??m?.[2]??m?.[3]??'').trim();}
function parseVersionMd(raw:string){const {meta,body}=splitMarkdown(raw);return{title:frontField(meta,'title'),description:frontField(meta,'description'),body};}

export default function HistoryDialog({doc,dirty,dark,ask,onClose,onRestored,onNotify,restoreRef}:{doc:DocInfo;dirty:boolean;dark:boolean;ask:(opts:{title:string;body:string;ok:string;danger?:boolean})=>Promise<boolean>;onClose:()=>void;onRestored:(next:DocInfo)=>void;onNotify:(msg:string)=>void;restoreRef?:React.MutableRefObject<(()=>void)|null>}){
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
   if(resp.status===404){setVersionStatus('error');setVersionError('Bản này không còn. Tải lại danh sách.');return;}
   if(!resp.ok)throw Error(data.error||resp.statusText);
   setVersionRaw(String(data.raw??''));setVersionStatus('ready');
  }).catch(e=>{if(id!==versionReq.current||!openRef.current)return;setVersionStatus('error');setVersionError((e as Error).message);});
 },[selected,doc.id,listStatus]);

 const selectedItem=detail?.items.find(x=>x.id===selected);
 const identical=versionStatus==='ready'&&versionRaw===(doc.raw||'');
 const canRestore=listStatus==='ready'&&versionStatus==='ready'&&!!selected&&!identical&&!dirty&&!busy&&!stale;

 const restore=useCallback(async()=>{
  if(!canRestore||!selectedItem)return;
  const when=formatStamp(selectedItem.capturedAt);
  if(!await ask({title:'Khôi phục phiên bản',body:`Khôi phục bản ngày ${when}? Bản hiện tại sẽ được giữ trong lịch sử.`,ok:'Khôi phục'}))return;
  setBusy(true);
  try{
   const resp=await fetch('/api/history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:doc.id,version:selected,baseHash:baseHash.current})});
   const data=await resp.json();
   if(resp.status===409){setStale(true);onNotify('Tài liệu đã đổi ở nơi khác. Hãy tải lại lịch sử trước khi khôi phục.');return;}
   if(resp.status===404){onNotify(data.error||'Bản không còn');void loadList();return;}
   if(!resp.ok)throw Error(data.error||resp.statusText);
   onRestored(data as DocInfo);onClose();onNotify('Đã khôi phục');
  }catch(e){onNotify((e as Error).message);}
  finally{setBusy(false);}
 },[ask,canRestore,doc.id,loadList,onClose,onNotify,onRestored,selected,selectedItem]);

 useEffect(()=>{if(restoreRef)restoreRef.current=()=>{void restore();};return()=>{if(restoreRef)restoreRef.current=null;};},[restore,restoreRef]);

 const groups=useMemo(()=>groupItems(detail?.items||[]),[detail]);
 const kind=doc.kind||'md';
 const parsed=useMemo(()=>kind==='md'?parseVersionMd(versionRaw):null,[kind,versionRaw]);

 const versionList=<div className="history-versions" role="listbox" aria-label="Phiên bản đã lưu">
  {groups.map(g=><div key={g.label} className="history-day"><div className="history-day-label">{g.label}</div>{g.items.map(item=>{
   const active=item.id===selected;
   const time=new Date(item.capturedAt).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'});
   return <UiButton type="button" role="option" aria-selected={active} className={active?'active':''} key={item.id} onClick={()=>{setSelected(item.id);setMobileList(false);}}>
    <span className="history-dot" aria-hidden>{active?'●':'○'}</span>
    <span className="history-ver-text"><strong>{time}</strong><small>{reasonLabel(item.reason)}</small></span>
   </UiButton>;
  })}</div>)}
  {detail?.nextCursor&&<UiButton type="button" className="btn ghost history-more" onClick={()=>void loadList(detail.nextCursor)}>Xem thêm</UiButton>}
 </div>;

 const contentPane=(()=>{
  if(versionStatus==='loading')return <div className="history-empty">Đang tải phiên bản…</div>;
  if(versionStatus==='error')return <div className="history-empty">{versionError}<div className="history-diff-actions"><UiButton className="btn ghost" type="button" onClick={()=>{if(versionError.includes('không còn'))void loadList();else{const cur=selected;setSelected('');queueMicrotask(()=>setSelected(cur));}}}>{versionError.includes('không còn')?'Tải lại danh sách':'Thử lại'}</UiButton></div></div>;
  if(versionStatus!=='ready')return null;
  if(!versionRaw)return <div className="history-empty">Phiên bản này không có nội dung</div>;
  if(kind==='md')return <div className="history-read"><div className="doc-meta">{doc.category}</div><h1>{parsed?.title||doc.title}</h1>{parsed?.description?<p className="doc-lead">{parsed.description}</p>:null}<hr/><Markdown content={parsed?.body||versionRaw} docId={doc.id} dark={dark}/></div>;
  return <div className="history-read history-code-wrap"><pre className="history-code">{versionRaw||' '}</pre></div>;
 })();
 const reading=versionStatus==='ready'&&selectedItem?<div className="history-reading"><strong>Bản lịch sử · {formatStamp(selectedItem.capturedAt)}</strong><span>{reasonLabel(selectedItem.reason)}</span></div>:null;

 const restoreHint=dirty?'Hãy lưu hoặc bỏ thay đổi trong trình sửa trước khi khôi phục.':stale?'Tài liệu đã đổi. Tải lại lịch sử rồi thử lại.':identical?'Nội dung giống bản hiện tại':versionStatus==='loading'?'Đang tải phiên bản.':versionStatus==='error'?versionError:busy?'Đang khôi phục.':'';

 return <Dialog title="Lịch sử tài liệu" overlayClassName="history-backdrop" onOpenChange={v=>{if(!v)onClose();}}>
  <div className={'modal wide history-modal'+(listOpen?'':' is-collapsed')}>
   <div className="modal-heading">{listStatus==='ready'&&<Tooltip content={listOpen?'Ẩn danh sách':'Hiện danh sách'}><UiButton type="button" className="history-list-toggle" aria-label={listOpen?'Ẩn danh sách':'Hiện danh sách'} aria-pressed={listOpen} onClick={()=>setListOpen(v=>!v)}>{listOpen?<PanelLeftClose size={16}/>:<PanelLeft size={16}/>}</UiButton></Tooltip>}<div className="history-heading-copy"><h2>Lịch sử tài liệu</h2><span className="history-doc-sep" aria-hidden>·</span><span className="history-doc-title" title={doc.title}>{doc.title}</span></div><UiButton aria-label="Đóng" onClick={onClose}><X/></UiButton></div>
   {listStatus==='loading'&&<div className="history-empty">Đang tải lịch sử…</div>}
   {listStatus==='error'&&<div className="history-empty">{listError}<div className="history-diff-actions"><UiButton className="btn ghost" type="button" onClick={()=>void loadList()}>Thử lại</UiButton></div></div>}
   {listStatus==='empty'&&<div className="history-empty">Chưa có phiên bản trước. Khi bạn lưu thay đổi, bản hiện tại sẽ xuất hiện ở đây.</div>}
   {listStatus==='ready'&&detail&&<>
    <div className="history-mobile-pick"><UiButton type="button" className="btn ghost" aria-expanded={mobileList} onClick={()=>setMobileList(v=>!v)}>{selectedItem?`${formatStamp(selectedItem.capturedAt)} · ${reasonLabel(selectedItem.reason)}`:'Chọn phiên bản'}</UiButton>{mobileList&&versionList}</div>
    <div className="history-grid">
     <div className="history-col-list"><div className="history-col-title"><span>Phiên bản</span></div>{versionList}</div>
     <div className="history-col-main">
      <Tabs className="history-tabs" label="Xem phiên bản" actions={reading} value={tab} onValueChange={v=>setTab(v as 'content'|'diff')} items={[
       {value:'content',label:'Nội dung',content:<div className="history-pane" key={selected}><div className="history-pane-body">{contentPane}</div></div>},
       {value:'diff',label:'Thay đổi',content:<div className="history-pane history-pane-diff" key={selected}>{versionStatus==='ready'?<Diff before={versionRaw} after={doc.raw||''} mode={diffMode} canSplit={wide} onMode={setPrefer} onShowContent={()=>setTab('content')}/>:contentPane}</div>}
      ]}/>
     </div>
    </div>
   </>}
   <div className="modal-actions history-footer">
    <span className="history-quota">{detail?`${detail.totalCount}/${detail.limits.maxCount} bản · ${formatBytes(detail.totalBytes)}/${formatBytes(detail.limits.maxBytes)}`:''}{restoreHint&&<em> · {restoreHint}</em>}</span>
    <div className="history-footer-btns">
     {stale&&<UiButton className="btn ghost" type="button" onClick={()=>void loadList()}>Tải lại</UiButton>}
     <UiButton className="btn ghost" type="button" onClick={onClose}>Đóng</UiButton>
     {listStatus!=='empty'&&<CommandTip id="history.restore" label={selectedItem?'Khôi phục bản '+formatStamp(selectedItem.capturedAt):'Khôi phục'}><UiButton className="btn primary" type="button" disabled={!canRestore} onClick={()=>void restore()}><RefreshCw size={15}/> {selectedItem?'Khôi phục bản '+formatStamp(selectedItem.capturedAt):'Khôi phục'}</UiButton></CommandTip>}
    </div>
   </div>
  </div>
 </Dialog>;
}
