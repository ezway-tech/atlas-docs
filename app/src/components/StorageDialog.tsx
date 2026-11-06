'use client';
import {useEffect,useRef,useState} from 'react';
import {RefreshCw,X} from 'lucide-react';
import {formatBytes} from '@/lib/backup-policy';
import {HISTORY_CEILING} from '@/lib/history-policy';
import type {HistoryPolicy} from '@/lib/types';
import {Tooltip} from './Tooltip';
import {Button,IconButton,Input} from './ui/controls';
import {ConfirmDialog,Dialog} from './ui/dialog';
import {Collapsible,Tabs} from './ui/patterns';
import {mibText,parseMib,parsePositiveInt} from './limit-fields';

type Group={bytes:number;files:number};
type Stats={scannedAt:string;totalBytes:number;totalFiles:number;complete:boolean;documents:Group;history:Group;historyMeta:Group;observed:Group;attachments:Group;database:Group;unusual:{path:string;bytes:number}[];errors:{path:string;message:string}[];warnings:{level:'warn'|'block';text:string}[]};
type Candidate={id:string;kind:'asset'|'temp';group:'history'|'unreferenced'|'temp';size:number;reason:string;filename?:string;recent?:boolean};
type Scan={scannedAt:string;uncertain:boolean;candidates:Candidate[];orphans:{name:string;bytes:number}[];missing:{id:string;filename:string}[]};
type Usage={folders:{title:string}[];docs:{title:string}[];comments:{docId:string}[];history:{docId:string;version:string}[];uncertain:boolean};
type HistoryRow={remove:number;removeBytes:number;overBytes:number};
type CleanupResult={deleted:string[];skipped:{id:string;reason:string}[];failed:{id:string;error:string}[];freedBytes:number};
type PreviewNote={key:string;main:string;sub?:string;error?:boolean};

const pageSize=20;
function kindLabel(kind:Candidate['kind']){return kind==='temp'?'Tệp tạm':'Tệp đính kèm';}
function groupLabel(group:Candidate['group']){return group==='history'?'Trong lịch sử':group==='temp'?'Tệp tạm':'Chưa thấy nơi sử dụng';}
function fileName(item:Candidate){return item.filename||item.id;}
async function api<T>(url:string,init?:RequestInit):Promise<T>{const resp=await fetch(url,{cache:'no-store',...init});const data=await resp.json();if(!resp.ok)throw Error(data.error||resp.statusText);return data as T;}
function previewMessage(rows:{docs:HistoryRow[]}){
 const versions=rows.docs.reduce((sum,row)=>sum+row.remove,0);
 const affected=rows.docs.reduce((sum,row)=>sum+row.removeBytes,0);
 const over=rows.docs.reduce((sum,row)=>sum+row.overBytes,0);
 const sub='Chưa xóa dữ liệu. Áp dụng khi lưu thay đổi tài liệu.';
 if(!versions)return {main:'Không có phiên bản vượt giới hạn.',sub};
 return {main:`${versions} phiên bản, ${rows.docs.length} tài liệu, khoảng ${formatBytes(affected)} dự kiến bị loại.${over?` Còn ${formatBytes(over)} được giữ vì bản được bảo vệ.`:''}`,sub};
}

export default function StorageDialog({onClose}:{onClose:()=>void}){
 const [stats,setStats]=useState<Stats|null>(null);
 const [statsError,setStatsError]=useState('');
 const [statsLoading,setStatsLoading]=useState(true);
 const [settingsError,setSettingsError]=useState('');
 const [settingsLoading,setSettingsLoading]=useState(true);
 const [tab,setTab]=useState('files');
 const [detailsOpen,setDetailsOpen]=useState(false);
 const [scanState,setScanState]=useState<'idle'|'scanning'|'done'|'error'>('idle');
 const [scanError,setScanError]=useState('');
 const [scan,setScan]=useState<Scan|null>(null);
 const [page,setPage]=useState(0);
 const [picked,setPicked]=useState<string[]>([]);
 const [confirm,setConfirm]=useState(false);
 const [deleting,setDeleting]=useState(false);
 const [result,setResult]=useState<CleanupResult|null>(null);
 const [usage,setUsage]=useState<{id:string;text:string}|null>(null);
 const [saved,setSaved]=useState<HistoryPolicy|null>(null);
 const [historyCount,setHistoryCount]=useState('');
 const [historyMib,setHistoryMib]=useState('');
 const [previewNote,setPreviewNote]=useState<PreviewNote|null>(null);
 const [savedNote,setSavedNote]=useState('');
 const [discard,setDiscard]=useState(false);
 const deleteLock=useRef(false);
 const taskRef=useRef('');
 const [task,setTask]=useState('');
 const statsGen=useRef(0);
 const settingsGen=useRef(0);
 const scanGen=useRef(0);
 const previewGen=useRef(0);
 const appliedRef=useRef({count:'',mib:''});
 const historyCountRef=useRef('');
 const historyMibRef=useRef('');
 const count=parsePositiveInt(historyCount,HISTORY_CEILING.maxCount,'Số phiên bản');
 const bytes=parseMib(historyMib,HISTORY_CEILING.maxBytes,'Dung lượng lịch sử');
 const dirty=!!saved&&count.value!==undefined&&bytes.value!==undefined&&(count.value!==saved.maxCount||bytes.value!==saved.maxBytes);
 const invalid=(historyCount!==''&&count.value===undefined)||(historyMib!==''&&bytes.value===undefined);
 const unsaved=!!saved&&(historyCount!==String(saved.maxCount)||historyMib!==mibText(saved.maxBytes));
 const valueKey=count.value!==undefined&&bytes.value!==undefined?`${count.value}|${bytes.value}`:'';
 const previewStale=!!previewNote&&previewNote.key!==valueKey;
 const busy=task!==''||deleting;
 const selectable=(scan?.candidates||[]).filter(item=>item.group!=='history');
 const protectedRows=(scan?.candidates||[]).filter(item=>item.group==='history');
 const selectableBytes=selectable.reduce((sum,item)=>sum+item.size,0);
 const pages=Math.max(1,Math.ceil(selectable.length/pageSize));
 const safePage=Math.min(page,pages-1);
 const pageItems=selectable.slice(safePage*pageSize,(safePage+1)*pageSize);
 const pageIds=pageItems.map(item=>item.id);
 const pageAll=pageIds.length>0&&pageIds.every(id=>picked.includes(id));
 const selectedBytes=selectable.filter(item=>picked.includes(item.id)).reduce((sum,item)=>sum+item.size,0);
 useEffect(()=>{void loadStats();void loadSettings();return ()=>{document.querySelector<HTMLElement>('.tools-trigger')?.focus();};},[]);
 function begin(name:string){if(taskRef.current||deleteLock.current)return false;taskRef.current=name;setTask(name);return true;}
 function finish(name:string,gen:number,current:number){if(gen!==current||taskRef.current!==name)return;taskRef.current='';setTask('');}
 function writeCount(value:string){historyCountRef.current=value;setHistoryCount(value);setSavedNote('');}
 function writeMib(value:string){historyMibRef.current=value;setHistoryMib(value);setSavedNote('');}
 function applyHistory(policy:HistoryPolicy){
  const nextCount=String(policy.maxCount),nextMib=mibText(policy.maxBytes);
  setSaved(policy);
  if(historyCountRef.current===appliedRef.current.count){historyCountRef.current=nextCount;setHistoryCount(nextCount);}
  if(historyMibRef.current===appliedRef.current.mib){historyMibRef.current=nextMib;setHistoryMib(nextMib);}
  appliedRef.current={count:nextCount,mib:nextMib};
 }
 async function loadStats(refresh=false){
  const gen=++statsGen.current;setStatsError('');setStatsLoading(true);
  try{const next=await api<Stats>('/api/storage'+(refresh?'?refresh=1':''));if(gen!==statsGen.current)return;setStats(next);}
  catch(e){if(gen!==statsGen.current)return;setStatsError((e as Error).message);}
  finally{if(gen===statsGen.current)setStatsLoading(false);}
 }
 async function loadSettings(){
  const gen=++settingsGen.current;setSettingsError('');setSettingsLoading(true);
  try{const settings=await api<{history?:HistoryPolicy}>('/api/settings');if(gen!==settingsGen.current)return;if(settings.history)applyHistory(settings.history);}
  catch(e){if(gen!==settingsGen.current)return;setSettingsError((e as Error).message);}
  finally{if(gen===settingsGen.current)setSettingsLoading(false);}
 }
 function requestClose(){if(busy)return;if(unsaved)setDiscard(true);else onClose();}
 async function runScan(){
  if(!begin('scan'))return;const gen=++scanGen.current;setScanState('scanning');setScanError('');setResult(null);setPicked([]);setPage(0);setUsage(null);
  try{const next=await api<Scan>('/api/storage/scan',{method:'POST'});if(gen!==scanGen.current)return;setScan(next);setScanState('done');}
  catch(e){if(gen!==scanGen.current)return;setScan(null);setScanState('error');setScanError((e as Error).message);}
  finally{finish('scan',gen,scanGen.current);}
 }
 async function showUsage(id:string){
  setUsage({id,text:'Đang xem nơi dùng…'});
  try{const data=await api<Usage>('/api/media/'+encodeURIComponent(id)+'/usage');const places=[...data.docs.map(item=>'Tài liệu: '+item.title),...data.folders.map(item=>'Bìa: '+item.title),...data.comments.map(item=>'Bình luận trong '+item.docId),...data.history.map(item=>'Lịch sử: '+item.docId)];setUsage({id,text:places.length?places.join(' · '):(data.uncertain?'Chưa đủ thông tin để khẳng định nơi dùng.':'Không thấy nơi dùng trong tài liệu, lịch sử, bìa hoặc bình luận.')});}
  catch(e){setUsage({id,text:(e as Error).message});}
 }
 async function remove(){
  if(!scan||deleteLock.current)return;deleteLock.current=true;setConfirm(false);setDeleting(true);
  try{const done=await api<CleanupResult>('/api/storage/cleanup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scannedAt:scan.scannedAt,ids:picked})});setResult(done);setScan(null);setScanState('idle');setPicked([]);await loadStats(true);}
  catch(e){setScanError((e as Error).message);setScanState('error');}
  finally{deleteLock.current=false;setDeleting(false);}
 }
 async function previewHistory(){
  if(count.value===undefined||bytes.value===undefined||!begin('preview'))return;
  const sent={maxCount:count.value,maxBytes:bytes.value},sentKey=`${sent.maxCount}|${sent.maxBytes}`,gen=++previewGen.current;
  setPreviewNote(null);
  try{const rows=await api<{docs:HistoryRow[]}>('/api/history?preview=1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sent)});if(gen!==previewGen.current)return;setPreviewNote({key:sentKey,...previewMessage(rows)});}
  catch(e){if(gen!==previewGen.current)return;setPreviewNote({key:sentKey,main:(e as Error).message,error:true});}
  finally{finish('preview',gen,previewGen.current);}
 }
 async function saveHistory(){
  if(count.value===undefined||bytes.value===undefined||!begin('save'))return;
  const sentCount=historyCountRef.current,sentMib=historyMibRef.current;
  setSettingsError('');
  try{
   const history={maxCount:count.value,maxBytes:bytes.value};
   const next=await api<{history?:HistoryPolicy}>('/api/settings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({history})});
   const policy=next.history||history;
   const nextCount=String(policy.maxCount),nextMib=mibText(policy.maxBytes);
   const countKept=historyCountRef.current===sentCount,mibKept=historyMibRef.current===sentMib;
   setSaved(policy);
   if(countKept){historyCountRef.current=nextCount;setHistoryCount(nextCount);}
   if(mibKept){historyMibRef.current=nextMib;setHistoryMib(nextMib);}
   appliedRef.current={count:nextCount,mib:nextMib};
   setPreviewNote(null);
   if(countKept&&mibKept)setSavedNote('Đã lưu. Áp dụng khi lưu thay đổi tài liệu.');
  }catch(e){setSettingsError((e as Error).message);}
  finally{finish('save',1,1);}
 }
 const historyBytes=stats?stats.history.bytes+stats.historyMeta.bytes+stats.observed.bytes:0;
 const systemBytes=stats?stats.totalBytes-(stats.documents.bytes+historyBytes+stats.attachments.bytes):0;
 const shares=stats&&stats.totalBytes?[{key:'doc',bytes:stats.documents.bytes},{key:'history',bytes:historyBytes},{key:'files',bytes:stats.attachments.bytes},{key:'system',bytes:Math.max(0,systemBytes)}]:[];
 const groups=stats?[{label:'Tài liệu',bytes:stats.documents.bytes},{label:'Tệp đính kèm',bytes:stats.attachments.bytes},{label:'Lịch sử',bytes:historyBytes},...(systemBytes>0?[{label:'Khác',bytes:systemBytes}]:[])]:[];
 const scanLabel=scanState==='scanning'?'Đang kiểm tra…':scanState==='error'?'Kiểm tra lại':'Kiểm tra tệp';
 const fileFooter=scanState==='done'
  ?<div className="storage-footer"><Button variant="secondary" disabled={busy} onClick={()=>void runScan()}>Kiểm tra lại</Button>{!!selectable.length&&<div className="storage-footer-end"><span>Đã chọn {picked.length} tệp · {formatBytes(selectedBytes)}</span><Button variant="danger" disabled={busy||!picked.length} onClick={()=>setConfirm(true)}>Xóa {picked.length} tệp</Button></div>}</div>
  :<div className="storage-footer"><div className="storage-footer-end"><Button variant="primary" disabled={busy} onClick={()=>void runScan()}>{scanLabel}</Button></div></div>;
 const historyFooter=<div className="storage-footer"><div className="storage-footer-end"><Button variant="ghost" disabled={busy||count.value===undefined||bytes.value===undefined} onClick={()=>void previewHistory()}>Xem trước</Button><Button variant="primary" disabled={busy||!dirty||invalid} onClick={()=>void saveHistory()}>Lưu cài đặt</Button></div></div>;
 return <Dialog title="Dung lượng & dọn dẹp" busy={busy} overlayClassName="storage-backdrop" onEscape={requestClose} onOpenChange={v=>{if(!v)requestClose();}}><div className="modal storage-modal"><div className="modal-heading"><h2>Dung lượng & dọn dẹp</h2><Button className="storage-close" aria-label="Đóng" disabled={busy} onClick={requestClose}><X size={16}/></Button></div>
  <Tabs className="storage-tabs" label="Dọn dẹp" value={tab} onValueChange={setTab} items={[
   {value:'files',label:'Dọn tệp',content:<div className="storage-pane">
  {statsError&&<p className="storage-block" role="alert">{statsError} <Button variant="ghost" onClick={()=>void loadStats(true)}>Thử lại</Button></p>}
  {statsLoading&&!stats&&!statsError&&<p role="status">Đang đọc dung lượng…</p>}
  {stats&&<div className="usage-block"><div className="usage-overview"><div className="usage-line"><span>Đang dùng</span><strong>{formatBytes(stats.totalBytes)}</strong><Button className="storage-details-link" onClick={()=>setDetailsOpen(true)}>Xem chi tiết</Button></div><IconButton label="Cập nhật dung lượng" variant="ghost" disabled={statsLoading||busy} onClick={()=>void loadStats(true)}><RefreshCw size={16}/></IconButton></div>
   <div className="usage-bar" aria-hidden="true">{shares.map(item=>item.bytes>0&&<i key={item.key} className={'usage-'+item.key} style={{width:(item.bytes/stats.totalBytes*100)+'%'}}/>)}</div>
   <ul className="storage-groups">{groups.map(item=><li key={item.label}><span>{item.label}</span><strong>{formatBytes(item.bytes)}</strong></li>)}</ul>
   {!stats.complete&&<p className="storage-block">Quét dung lượng chưa đầy đủ vì có mục không đọc được. Những mục đó không được tính là 0.</p>}
   {!!stats.errors.length&&<p className="storage-block" role="alert">Có {stats.errors.length} mục không đọc được.</p>}
   {!!stats.warnings.length&&<div className="storage-limits"><p className="storage-meta">Giới hạn sao lưu</p>{stats.warnings.map(item=><p key={item.text} className={item.level==='block'?'storage-block':'storage-warn'}>{item.text}</p>)}</div>}
  </div>}

    <p>Tìm tệp có thể xóa để giải phóng dung lượng. Bạn chọn trước khi xóa.</p>
    {scanState==='scanning'&&<p role="status">Đang kiểm tra…</p>}
    {scanState==='error'&&<p className="storage-block" role="alert">{scanError}</p>}
    {deleting&&<p role="status">Đang xóa…</p>}
    {result&&<div role="status"><p>Đã xóa {result.deleted.length}. Đã giải phóng {formatBytes(result.freedBytes)}.</p>{!!result.skipped.length&&<p>Đã bỏ qua {result.skipped.length}.</p>}{!!result.failed.length&&<p>Không xóa được {result.failed.length}.</p>}{(!!result.skipped.length||!!result.failed.length)&&<Collapsible summary="Chi tiết kết quả"><ul className="storage-list">{result.skipped.map(item=><li key={item.id}>{item.id}: {item.reason}</li>)}{result.failed.map(item=><li key={item.id}>{item.id}: {item.error}</li>)}</ul></Collapsible>}</div>}
    {scanState==='done'&&scan&&<>
     {scan.uncertain&&<p className="storage-warn" role="alert">Việc kiểm tra chưa đầy đủ. Kết quả không khẳng định tệp nào chắc chắn không cần nữa.</p>}
     {!selectable.length&&<p>Không tìm thấy tệp phù hợp để dọn.</p>}
     {!!selectable.length&&<p className="cleanup-summary">{selectable.length} tệp có thể chọn · {formatBytes(selectableBytes)}</p>}
     {!!protectedRows.length&&<Collapsible className="history-used" summary={`Đang dùng trong lịch sử (${protectedRows.length})`}><ul className="storage-list">{protectedRows.map(item=><li key={item.id}><FileName name={fileName(item)}/><span className="storage-meta">{formatBytes(item.size)} · {kindLabel(item.kind)}</span></li>)}</ul></Collapsible>}
     {!!selectable.length&&<>
      <div className="cleanup-select"><label className="cleanup-page"><input type="checkbox" checked={pageAll} onChange={e=>setPicked(list=>e.target.checked?[...new Set([...list,...pageIds])]:list.filter(id=>!pageIds.includes(id)))}/> Chọn trang này</label><Button variant="ghost" onClick={()=>setPicked(selectable.map(item=>item.id))}>Chọn tất cả {selectable.length} tệp</Button><Button variant="ghost" disabled={!picked.length} onClick={()=>setPicked([])}>Bỏ chọn tất cả</Button></div>
      <ul className="storage-list">{pageItems.map(item=>{const name=fileName(item);const typeText=kindLabel(item.kind);const short=groupLabel(item.group);return <li key={item.id} className="cleanup-row"><label><input type="checkbox" checked={picked.includes(item.id)} onChange={e=>setPicked(list=>e.target.checked?[...list,item.id]:list.filter(id=>id!==item.id))}/><FileName name={name}/></label><strong className="cleanup-size">{formatBytes(item.size)}</strong>{item.kind==='asset'&&<Button variant="ghost" onClick={()=>void showUsage(item.id)}>Xem nơi dùng</Button>}<span className="cleanup-meta"><span className="storage-meta">{typeText}{short!==typeText?` · ${short}`:''}{item.recent?' · Vừa tải lên':''}</span><details className="cleanup-reason"><summary>Thông tin thêm</summary><p>{item.reason}</p></details></span>{usage?.id===item.id&&<p className="cleanup-usage">{usage.text}</p>}</li>;})}</ul>
      {pages>1&&<div className="cleanup-pager"><Button variant="ghost" disabled={safePage===0} onClick={()=>setPage(safePage-1)}>Trang trước</Button><span>Trang {safePage+1} / {pages}</span><Button variant="ghost" disabled={safePage+1>=pages} onClick={()=>setPage(safePage+1)}>Trang sau</Button></div>}
     </>}
     {(!!scan.missing.length||!!scan.orphans.length)&&<Collapsible summary="Chẩn đoán"><ul className="storage-list">{scan.missing.map(item=><li key={item.id}>Thiếu tệp: {item.filename}</li>)}{scan.orphans.map(item=><li key={item.name}>Có trên đĩa nhưng thiếu bản ghi: {item.name} · {formatBytes(item.bytes)}</li>)}</ul></Collapsible>}
    </>}
   </div>},
   {value:'history',label:'Lịch sử',content:<div className="storage-pane storage-history-form">
    {settingsError&&<p className="storage-block" role="alert">{settingsError} <Button variant="ghost" onClick={()=>void loadSettings()}>Thử lại</Button></p>}
    {settingsLoading&&!saved&&!settingsError&&<p role="status">Đang đọc cài đặt…</p>}
    {saved&&<>
     <div className="limit-row"><span className="limit-label">Giữ tối đa</span><Input className="limit-input" disabled={task==='save'} aria-label="Số phiên bản tối đa mỗi tài liệu" value={historyCount} inputMode="numeric" aria-invalid={!!count.error} aria-describedby={count.error?'history-count-error':undefined} onChange={e=>writeCount(e.target.value)}/><span className="limit-unit">phiên bản/tài liệu</span></div>
     {count.error&&<p id="history-count-error" className="storage-block" role="alert">{count.error}</p>}
     <p>Áp dụng khi lưu thay đổi tài liệu; không xóa ngay.</p>
     <Collapsible summary="Nâng cao"><div className="limit-row"><span className="limit-label">Dung lượng tối đa</span><Input className="limit-input" disabled={task==='save'} aria-label="Dung lượng lịch sử tối đa mỗi tài liệu (MiB)" value={historyMib} inputMode="decimal" aria-invalid={!!bytes.error} aria-describedby={bytes.error?'history-bytes-error':undefined} onChange={e=>writeMib(e.target.value)}/><span className="limit-unit">MiB/tài liệu</span></div>{bytes.error&&<p id="history-bytes-error" className="storage-block" role="alert">{bytes.error}</p>}<p className="storage-meta">Có thể giữ ít phiên bản hơn nếu vượt dung lượng.</p></Collapsible>
     {previewStale&&<p>Giá trị đã đổi. Hãy xem trước lại.</p>}
     {!previewStale&&previewNote&&<div role={previewNote.error?'alert':'status'}><p>{previewNote.main}</p>{previewNote.sub&&<p className="storage-meta">{previewNote.sub}</p>}</div>}
     {savedNote&&<p role="status">{savedNote}</p>}
    </>}
   </div>},
  ]}/>
  {tab==='files'?fileFooter:historyFooter}
  {detailsOpen&&stats&&<Dialog title="Chi tiết dung lượng" overlayClassName="storage-detail-backdrop" onOpenChange={v=>{if(!v)setDetailsOpen(false);}}><div className="modal storage-detail"><div className="modal-heading"><h2>Chi tiết dung lượng</h2><Button className="storage-close" aria-label="Đóng" onClick={()=>setDetailsOpen(false)}><X size={16}/></Button></div><div className="storage-detail-body"><dl className="storage-facts"><div><dt>Cập nhật</dt><dd>{new Date(stats.scannedAt).toLocaleString('vi-VN')}</dd></div><div><dt>Số tệp đã kiểm tra</dt><dd>{stats.totalFiles}</dd></div><div><dt>Nội dung các bản cũ</dt><dd>{formatBytes(stats.history.bytes)} · {stats.history.files} tệp</dd></div><div><dt>Thông tin kèm theo các bản cũ</dt><dd>{formatBytes(stats.historyMeta.bytes)} · {stats.historyMeta.files} tệp</dd></div><div><dt>Bản sao theo dõi thay đổi</dt><dd>{formatBytes(stats.observed.bytes)} · {stats.observed.files} tệp</dd></div><div><dt>Dữ liệu quản lý thư viện</dt><dd>{formatBytes(stats.database.bytes)}</dd></div></dl>{(!!stats.unusual.length||!!stats.errors.length)&&<Collapsible summary="Thông tin kỹ thuật"><ul className="storage-list">{stats.unusual.map(item=><li key={item.path}>{item.path}: {formatBytes(item.bytes)}</li>)}{stats.errors.map(item=><li key={item.path}>{item.path}: {item.message}</li>)}</ul></Collapsible>}</div></div></Dialog>}
  {confirm&&<ConfirmDialog title="Xóa các tệp đã chọn?" confirmLabel={`Xóa ${picked.length} tệp`} danger onCancel={()=>setConfirm(false)} onConfirm={()=>void remove()}><p>Xóa {picked.length} tệp, khoảng {formatBytes(selectedBytes)}. Không thể hoàn tác. Tệp có thể còn được dùng trong bản nháp chưa lưu.</p></ConfirmDialog>}
  {discard&&<ConfirmDialog title="Bỏ thay đổi chưa lưu?" confirmLabel="Bỏ thay đổi" danger onCancel={()=>setDiscard(false)} onConfirm={onClose}><p>Cài đặt lịch sử vừa sửa chưa được lưu.</p></ConfirmDialog>}
 </div></Dialog>;
}

function FileName({name}:{name:string}){
 return <Tooltip content={name} onlyOverflow><span className="cleanup-name" tabIndex={0} title={name}>{name}</span></Tooltip>;
}
