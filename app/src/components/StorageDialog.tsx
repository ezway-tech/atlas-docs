'use client';
import {useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {formatBytes} from '@/lib/backup-policy';
import {HISTORY_CEILING} from '@/lib/history-policy';
import type {HistoryPolicy} from '@/lib/types';
import {Ellipsis} from './Tooltip';
import {Button,Field,Input} from './ui/controls';
import {ConfirmDialog,Dialog} from './ui/dialog';
import {Collapsible} from './ui/patterns';
import {mibText,parseMib,parsePositiveInt} from './limit-fields';

type Group={bytes:number;files:number};
type Stats={scannedAt:string;totalBytes:number;totalFiles:number;complete:boolean;documents:Group;history:Group;historyMeta:Group;observed:Group;attachments:Group;database:Group;unusual:{path:string;bytes:number}[];errors:{path:string;message:string}[];warnings:{level:'warn'|'block';text:string}[]};
type Candidate={id:string;kind:'asset'|'temp';group:'history'|'unreferenced'|'temp';size:number;reason:string;filename?:string;recent?:boolean};
type Scan={scannedAt:string;uncertain:boolean;candidates:Candidate[];orphans:{name:string;bytes:number}[];missing:{id:string;filename:string}[]};
type Usage={folders:{title:string}[];docs:{title:string}[];comments:{docId:string}[];history:{docId:string;version:string}[];uncertain:boolean};
type HistoryRow={remove:number;removeBytes:number;overBytes:number};
type CleanupResult={deleted:string[];skipped:{id:string;reason:string}[];failed:{id:string;error:string}[];freedBytes:number};

const pageSize=20;
function kindLabel(kind:Candidate['kind']){return kind==='temp'?'Tệp tạm':'Tệp đính kèm';}
async function api<T>(url:string,init?:RequestInit):Promise<T>{const resp=await fetch(url,{cache:'no-store',...init});const data=await resp.json();if(!resp.ok)throw Error(data.error||resp.statusText);return data as T;}

export default function StorageDialog({onClose}:{onClose:()=>void}){
 const [stats,setStats]=useState<Stats|null>(null);
 const [error,setError]=useState('');
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
 const [previewKey,setPreviewKey]=useState('');
 const [previewText,setPreviewText]=useState('');
 const [discard,setDiscard]=useState(false);
 const deleteLock=useRef(false);
 const [task,setTask]=useState('');
 const count=parsePositiveInt(historyCount,HISTORY_CEILING.maxCount,'Số phiên bản');
 const bytes=parseMib(historyMib,HISTORY_CEILING.maxBytes,'Dung lượng lịch sử');
 const dirty=!!saved&&count.value!==undefined&&bytes.value!==undefined&&(count.value!==saved.maxCount||bytes.value!==saved.maxBytes);
 const invalid=(historyCount!==''&&count.value===undefined)||(historyMib!==''&&bytes.value===undefined);
 const formKey=`${historyCount}|${historyMib}`;
 const previewStale=previewKey!==''&&previewKey!==formKey;
 const busy=task!==''||deleting;
 const selectable=(scan?.candidates||[]).filter(item=>item.group!=='history');
 const protectedRows=(scan?.candidates||[]).filter(item=>item.group==='history');
 const pages=Math.max(1,Math.ceil(selectable.length/pageSize));
 const pageItems=selectable.slice(page*pageSize,(page+1)*pageSize);
 const pageIds=pageItems.map(item=>item.id);
 const pageAll=pageIds.length>0&&pageIds.every(id=>picked.includes(id));
 const selectedBytes=selectable.filter(item=>picked.includes(item.id)).reduce((sum,item)=>sum+item.size,0);
 useEffect(()=>{void load();return ()=>{document.querySelector<HTMLElement>('.tools-trigger')?.focus();};},[]);
 async function load(refresh=false){setError('');try{const [next,settings]=await Promise.all([api<Stats>('/api/storage'+(refresh?'?refresh=1':'')),api<{history?:HistoryPolicy}>('/api/settings')]);setStats(next);if(settings.history){setSaved(settings.history);setHistoryCount(String(settings.history.maxCount));setHistoryMib(mibText(settings.history.maxBytes));setPreviewKey('');setPreviewText('');}}catch(e){setError((e as Error).message);}}
 function requestClose(){if(busy)return;if(dirty)setDiscard(true);else onClose();}
 async function runScan(){setTask('scan');setScanState('scanning');setScanError('');setResult(null);setPicked([]);setPage(0);setUsage(null);try{setScan(await api<Scan>('/api/storage/scan',{method:'POST'}));setScanState('done');}catch(e){setScan(null);setScanState('error');setScanError((e as Error).message);}finally{setTask('');}}
 async function showUsage(id:string){setUsage({id,text:'Đang xem nơi dùng…'});try{const data=await api<Usage>('/api/media/'+encodeURIComponent(id)+'/usage');const places=[...data.docs.map(item=>'Tài liệu: '+item.title),...data.folders.map(item=>'Bìa: '+item.title),...data.comments.map(item=>'Bình luận trong '+item.docId),...data.history.map(item=>'Lịch sử: '+item.docId)];setUsage({id,text:places.length?places.join(' · '):(data.uncertain?'Chưa đủ thông tin để khẳng định nơi dùng.':'Không thấy nơi dùng trong tài liệu, lịch sử, bìa hoặc bình luận.')});}catch(e){setUsage({id,text:(e as Error).message});}}
 async function remove(){if(!scan||deleteLock.current)return;deleteLock.current=true;setConfirm(false);setDeleting(true);try{const done=await api<CleanupResult>('/api/storage/cleanup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scannedAt:scan.scannedAt,ids:picked})});setResult(done);setScan(null);setScanState('idle');setPicked([]);await load(true);}catch(e){setScanError((e as Error).message);setScanState('error');}finally{deleteLock.current=false;setDeleting(false);}}
 async function previewHistory(){if(count.value===undefined||bytes.value===undefined)return;setTask('preview');setPreviewText('');try{const rows=await api<{docs:HistoryRow[]}>('/api/history?preview=1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({maxCount:count.value,maxBytes:bytes.value})});const versions=rows.docs.reduce((sum,row)=>sum+row.remove,0);const affected=rows.docs.reduce((sum,row)=>sum+row.removeBytes,0);const over=rows.docs.reduce((sum,row)=>sum+row.overBytes,0);setPreviewKey(formKey);setPreviewText(versions?`${rows.docs.length} tài liệu, ${versions} phiên bản, khoảng ${formatBytes(affected)} có thể bị loại ở lần lưu tài liệu sau.${over?` Còn ${formatBytes(over)} không bị xóa vì bản được bảo vệ.`:''} Xem trước không lưu và không xóa.`:'Đã kiểm tra, không có bản vượt giới hạn.');}catch(e){setPreviewKey('');setPreviewText((e as Error).message);}finally{setTask('');}}
 async function saveHistory(){if(count.value===undefined||bytes.value===undefined)return;setTask('save');setError('');try{const history={maxCount:count.value,maxBytes:bytes.value};const next=await api<{history?:HistoryPolicy}>('/api/settings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({history})});if(next.history)setSaved(next.history);setPreviewKey('');setPreviewText('Đã lưu cài đặt lịch sử. Thư viện không bị dọn ngay. Hạn mức có hiệu lực từ lần lưu tài liệu sau.');}catch(e){setError((e as Error).message);}finally{setTask('');}}
 const historyBytes=stats?stats.history.bytes+stats.historyMeta.bytes+stats.observed.bytes:0;
 const historyFiles=stats?stats.history.files+stats.historyMeta.files+stats.observed.files:0;
 const systemBytes=stats?stats.totalBytes-(stats.documents.bytes+historyBytes+stats.attachments.bytes):0;
 const shares=stats&&stats.totalBytes?[{key:'doc',bytes:stats.documents.bytes},{key:'history',bytes:historyBytes},{key:'files',bytes:stats.attachments.bytes},{key:'system',bytes:Math.max(0,systemBytes)}]:[];
 return <Dialog title="Dung lượng & dọn dẹp" busy={busy} onEscape={requestClose} onOpenChange={v=>{if(!v)requestClose();}}><div className="modal library-modal"><div className="modal-heading"><h2>Dung lượng & dọn dẹp</h2><Button aria-label="Đóng" disabled={busy} onClick={requestClose}><X size={16}/></Button></div>
  {error&&<p className="storage-block" role="alert">{error}</p>}
  {!stats?<p>Đang đọc dung lượng…</p>:<>
   <section className="usage-overview"><div><p className="usage-total">{formatBytes(stats.totalBytes)}</p><p className="storage-meta">Dung lượng thư viện đang dùng. Cập nhật lúc {new Date(stats.scannedAt).toLocaleString('vi-VN')}.</p></div><Button variant="ghost" disabled={busy} onClick={()=>void load(true)}>Làm mới</Button></section>
   {!stats.complete&&<p className="storage-block">Quét dung lượng chưa đầy đủ vì có mục không đọc được. Những mục đó không được tính là 0.</p>}
   {stats.warnings.map(item=><p key={item.text} className={item.level==='block'?'storage-block':'storage-warn'}>{item.text}</p>)}
   <section><h3>Phân bố dung lượng</h3><div className="usage-bar" aria-hidden="true">{shares.map(item=>item.bytes>0&&<i key={item.key} className={'usage-'+item.key} style={{width:(item.bytes/stats.totalBytes*100)+'%'}}/>)}</div>
    <ul className="storage-groups"><li><span>Tài liệu</span><strong>{formatBytes(stats.documents.bytes)} · {stats.documents.files} tệp</strong></li><li><span>Lịch sử<strong className="storage-meta"> {historyFiles} tệp, không phải số phiên bản</strong></span><strong>{formatBytes(historyBytes)}</strong></li><li><span>Tệp đính kèm</span><strong>{formatBytes(stats.attachments.bytes)} · {stats.attachments.files} tệp</strong></li>{systemBytes>0&&<li><span>Dữ liệu hệ thống</span><strong>{formatBytes(systemBytes)}</strong></li>}</ul>
   </section>
   <section><h3>Dọn tệp</h3><p>Kiểm tra tệp không được tham chiếu. Bạn xem và chọn trước khi xóa. Tệp không có tham chiếu vẫn có thể là tệp bạn muốn giữ. Bản nháp chưa lưu trên trình duyệt không được server biết.</p>
    {scanState==='idle'&&<p className="storage-meta">Chưa kiểm tra. Bấm nút bên dưới để xem tệp có thể dọn.</p>}
    {scanState==='scanning'&&<p role="status">Đang kiểm tra…</p>}
    {scanState==='error'&&<p className="storage-block" role="alert">{scanError}</p>}
    {scanState==='done'&&scan&&<>
     {scan.uncertain&&<p className="storage-warn">Quét chưa đủ thông tin ở một số nguồn. Những tệp đó không được đề xuất xóa.</p>}
     {!selectable.length&&<p>{scan.uncertain?'Không tìm thấy tệp phù hợp để dọn. Quét chưa đủ thông tin để kết luận mọi tệp đều đang được dùng.':'Không tìm thấy tệp phù hợp để dọn.'}</p>}
     {!!protectedRows.length&&<div><p>Được dùng trong lịch sử</p><ul className="storage-list">{protectedRows.map(item=><li key={item.id}><Ellipsis text={item.filename||item.id}/> <span className="storage-meta">{kindLabel(item.kind)} · {formatBytes(item.size)} · {item.reason}</span></li>)}</ul></div>}
     {!!selectable.length&&<>
      <label className="cleanup-page"><input type="checkbox" checked={pageAll} onChange={e=>setPicked(list=>e.target.checked?[...new Set([...list,...pageIds])]:list.filter(id=>!pageIds.includes(id)))}/> Chọn trang này</label>
      <ul className="storage-list">{pageItems.map(item=><li key={item.id} className="cleanup-row"><label><input type="checkbox" checked={picked.includes(item.id)} onChange={e=>setPicked(list=>e.target.checked?[...list,item.id]:list.filter(id=>id!==item.id))}/><span className="cleanup-copy"><span className="cleanup-name"><Ellipsis text={item.filename||item.id}/></span><span className="storage-meta">{kindLabel(item.kind)} · {formatBytes(item.size)}{item.recent?' · vừa tải lên':''}</span><span className="storage-meta">{item.reason}</span></span></label>{item.kind==='asset'&&<Button variant="ghost" onClick={()=>void showUsage(item.id)}>Xem nơi dùng</Button>}{usage?.id===item.id&&<p className="cleanup-usage">{usage.text}</p>}</li>)}</ul>
      {pages>1&&<div className="modal-actions"><Button variant="ghost" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Trang trước</Button><span>Trang {page+1} / {pages}</span><Button variant="ghost" disabled={page+1>=pages} onClick={()=>setPage(p=>p+1)}>Trang sau</Button></div>}
     </>}
    </>}
    <div className="cleanup-bar"><Button variant="primary" disabled={busy} onClick={()=>void runScan()}>{scanState==='scanning'?'Đang kiểm tra…':'Kiểm tra tệp có thể dọn'}</Button>{scanState==='done'&&!!selectable.length&&<><span>Đã chọn {picked.length} tệp · {formatBytes(selectedBytes)}</span><Button variant="danger" disabled={busy||!picked.length} onClick={()=>setConfirm(true)}>Xóa {picked.length} tệp đã chọn</Button></>}</div>
    {deleting&&<p role="status">Đang xóa…</p>}
    {result&&<div role="status"><p>Đã xóa {result.deleted.length}. Đã bỏ qua {result.skipped.length} vì đang được dùng hoặc dữ liệu đã đổi. Không xóa được {result.failed.length}. Đã giải phóng {formatBytes(result.freedBytes)}.</p>{!!result.skipped.length&&<ul className="storage-list">{result.skipped.map(item=><li key={item.id}>{item.id}: {item.reason}</li>)}</ul>}{!!result.failed.length&&<ul className="storage-list">{result.failed.map(item=><li key={item.id}>{item.id}: {item.error}</li>)}</ul>}</div>}
   </section>
   <Collapsible summary="Cài đặt lịch sử"><p className="storage-meta">Khi vượt giới hạn, bản cũ được loại trước. Lưu cài đặt không dọn toàn thư viện. Hạn mức có hiệu lực từ lần lưu tài liệu sau. 1 MiB = 1.048.576 byte.</p>
    <div className="storage-fields"><Field label="Số phiên bản tối đa mỗi tài liệu" error={count.error}><Input value={historyCount} inputMode="numeric" onChange={e=>setHistoryCount(e.target.value)}/></Field><Field label="Dung lượng lịch sử tối đa mỗi tài liệu (MiB)" error={bytes.error}><Input value={historyMib} inputMode="decimal" onChange={e=>setHistoryMib(e.target.value)}/></Field></div>
    <div className="modal-actions"><Button variant="ghost" disabled={busy||count.value===undefined||bytes.value===undefined} onClick={()=>void previewHistory()}>Xem trước thay đổi</Button><Button variant="secondary" disabled={busy||!dirty||invalid} onClick={()=>void saveHistory()}>Lưu cài đặt lịch sử</Button></div>
    {previewStale&&<p>Kết quả xem trước không còn khớp giá trị đang nhập.</p>}
    {!previewStale&&previewText&&<p>{previewText}</p>}
   </Collapsible>
   <Collapsible summary="Chi tiết kỹ thuật">{stats&&<ul className="storage-list"><li>Nội dung phiên bản: {formatBytes(stats.history.bytes)} · {stats.history.files} tệp</li><li>Metadata lịch sử, tệp mô tả đi kèm phiên bản: {formatBytes(stats.historyMeta.bytes)} · {stats.historyMeta.files} tệp</li><li>history/observed, bản sao nội dung hiện tại: {formatBytes(stats.observed.bytes)} · {stats.observed.files} tệp</li><li>db.json: {formatBytes(stats.database.bytes)}</li><li>Tổng số tệp vật lý đã đọc: {stats.totalFiles}</li>{stats.unusual.map(item=><li key={item.path}>Tệp khác {item.path}: {formatBytes(item.bytes)}</li>)}{stats.errors.map(item=><li key={item.path}>{item.path}: {item.message}</li>)}{scan?.missing.map(item=><li key={item.id}>Thiếu tệp: {item.filename}</li>)}{scan?.orphans.map(item=><li key={item.name}>Có trên đĩa nhưng thiếu bản ghi: {item.name}</li>)}</ul>}</Collapsible>
  </>}
  {confirm&&<ConfirmDialog title="Xóa các tệp đã chọn?" confirmLabel={`Xóa ${picked.length} tệp`} danger onCancel={()=>setConfirm(false)} onConfirm={()=>void remove()}><p>Xóa {picked.length} tệp, khoảng {formatBytes(selectedBytes)}. Không thể hoàn tác. Server kiểm tra lại trước khi xóa.</p></ConfirmDialog>}
  {discard&&<ConfirmDialog title="Bỏ thay đổi chưa lưu?" confirmLabel="Bỏ thay đổi" danger onCancel={()=>setDiscard(false)} onConfirm={onClose}><p>Cài đặt lịch sử vừa sửa chưa được lưu.</p></ConfirmDialog>}
 </div></Dialog>;
}
