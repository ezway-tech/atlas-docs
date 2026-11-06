'use client';
import {useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {BACKUP_LIMIT_CEILING,DEFAULT_BACKUP_LIMITS,formatBytes} from '@/lib/backup-policy';
import type {BackupPolicy} from '@/lib/types';
import {Button,Field,Input} from './ui/controls';
import {ConfirmDialog,Dialog} from './ui/dialog';
import {Collapsible} from './ui/patterns';
import {mibText,parseMib,parsePositiveInt} from './limit-fields';

async function api<T>(url:string,init?:RequestInit):Promise<T>{const resp=await fetch(url,{cache:'no-store',...init});const data=await resp.json();if(!resp.ok)throw Error(data.error||resp.statusText);return data as T;}

export async function downloadBackup(){
 const check=await api<{ok:boolean;blockers:string[]}>('/api/backup?check=1');
 if(!check.ok)throw Error(check.blockers.join(' '));
 const resp=await fetch('/api/backup');
 if(!resp.ok)throw Error((await resp.json()).error||resp.statusText);
 const url=URL.createObjectURL(await resp.blob());
 const link=document.createElement('a');link.href=url;link.download='atlas-docs-backup.zip';link.click();
 setTimeout(()=>URL.revokeObjectURL(url),500);
 return 'Đã tải bản sao lưu.';
}

export default function BackupDialog({onClose,pickRequest,onNotify}:{onClose:()=>void;pickRequest:number;onNotify:(message:string)=>void}){
 const fileRef=useRef<HTMLInputElement>(null);
 const [task,setTask]=useState<''|'download'|'restore'|'save'>('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [saved,setSaved]=useState<BackupPolicy|null>(null);
 const [dataMib,setDataMib]=useState('');
 const [zipMib,setZipMib]=useState('');
 const [files,setFiles]=useState('');
 const [confirmFile,setConfirmFile]=useState<File|null>(null);
 const [discard,setDiscard]=useState(false);
 const data=parseMib(dataMib,BACKUP_LIMIT_CEILING.maxUncompressedBytes,'Dung lượng trước nén');
 const zip=parseMib(zipMib,BACKUP_LIMIT_CEILING.maxZipBytes,'Dung lượng ZIP');
 const count=parsePositiveInt(files,BACKUP_LIMIT_CEILING.maxDataFiles,'Số tệp');
 const dirty=!!saved&&data.value!==undefined&&zip.value!==undefined&&count.value!==undefined&&(data.value!==saved.maxUncompressedBytes||zip.value!==saved.maxZipBytes||count.value!==saved.maxDataFiles);
 const invalid=(dataMib!==''&&data.value===undefined)||(zipMib!==''&&zip.value===undefined)||(files!==''&&count.value===undefined);
 const busy=task!=='';
 useEffect(()=>{void api<{backup?:BackupPolicy}>('/api/settings').then(settings=>{const backup=settings.backup||DEFAULT_BACKUP_LIMITS;setSaved(backup);setDataMib(mibText(backup.maxUncompressedBytes));setZipMib(mibText(backup.maxZipBytes));setFiles(String(backup.maxDataFiles));}).catch(e=>setError((e as Error).message));},[]);
 useEffect(()=>{if(pickRequest>0)fileRef.current?.click();},[pickRequest]);
 useEffect(()=>()=>{document.querySelector<HTMLElement>('.tools-trigger')?.focus();},[]);
 function requestClose(){if(busy)return;if(dirty)setDiscard(true);else onClose();}
 async function save(){if(!data.value||!zip.value||!count.value)return;setTask('save');setError('');try{const backup={maxUncompressedBytes:data.value,maxZipBytes:zip.value,maxDataFiles:count.value};const next=await api<{backup?:BackupPolicy}>('/api/settings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({backup})});setSaved(next.backup||backup);setNotice('Đã lưu giới hạn sao lưu. Thư viện hiện tại không bị cắt.');}catch(e){setError((e as Error).message);}finally{setTask('');}}
 async function download(){setTask('download');setError('');setNotice('');try{setNotice(await downloadBackup());}catch(e){setError((e as Error).message);}finally{setTask('');}}
 async function restore(file:File){setConfirmFile(null);setTask('restore');setError('');setNotice('');try{const data=await api<{historyOver?:{id:string}[]}>('/api/backup',{method:'POST',headers:{'Content-Type':'application/zip'},body:file});onNotify(data.historyOver?.length?`Đã khôi phục. ${data.historyOver.length} tài liệu vượt hạn lịch sử và chưa bị cắt.`:'Đã khôi phục.');window.location.reload();}catch(e){setError((e as Error).message);setTask('');}}
 return <Dialog title="Sao lưu & khôi phục" busy={busy} onEscape={requestClose} onOpenChange={v=>{if(!v)requestClose();}}><div className="modal library-modal"><div className="modal-heading"><h2>Sao lưu & khôi phục</h2><Button aria-label="Đóng" disabled={busy} onClick={requestClose}><X size={16}/></Button></div>
  {error&&<p className="storage-block" role="alert">{error}</p>}
  {notice&&<p role="status">{notice}</p>}
  <section><h3>Tạo bản sao lưu</h3><p>Tải một bản sao gồm tài liệu, tệp đính kèm, lịch sử và cài đặt.</p><Button variant="primary" disabled={busy} onClick={()=>void download()}>{task==='download'?'Đang tạo bản sao lưu…':'Tải bản sao lưu'}</Button></section>
  <section><h3>Khôi phục dữ liệu</h3><p className="storage-warn">Chỉ khôi phục vào thư viện trống.</p><input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)setConfirmFile(file);}}/><Button variant="ghost" disabled={busy} onClick={()=>fileRef.current?.click()}>Chọn tệp sao lưu</Button></section>
  <Collapsible summary="Nâng cao"><p className="storage-meta">Đây là giới hạn của thao tác sao lưu và khôi phục, không phải số tài liệu tối đa của ứng dụng. 1 MiB = 1.048.576 byte.</p>
   <div className="storage-fields"><Field label="Dung lượng dữ liệu trước nén (MiB)" error={data.error}><Input value={dataMib} inputMode="decimal" onChange={e=>{setDataMib(e.target.value);setNotice('');}}/></Field><Field label="Dung lượng tệp ZIP (MiB)" error={zip.error}><Input value={zipMib} inputMode="decimal" onChange={e=>{setZipMib(e.target.value);setNotice('');}}/></Field><Field label="Số tệp trong bản sao lưu" error={count.error}><Input value={files} inputMode="numeric" onChange={e=>{setFiles(e.target.value);setNotice('');}}/></Field></div>
   <p className="storage-meta">{saved?`Đang lưu: ${formatBytes(saved.maxUncompressedBytes)} trước nén, ${formatBytes(saved.maxZipBytes)} ZIP, ${saved.maxDataFiles} tệp.`:'Đang đọc giới hạn…'}</p>
   <Button variant="secondary" disabled={busy||!dirty||!!invalid} onClick={()=>void save()}>Lưu giới hạn sao lưu</Button>
  </Collapsible>
  <Collapsible summary="Chi tiết"><p>Bản sao dùng định dạng atlas-docs phiên bản 1. Mỗi tệp dữ liệu có mã SHA-256. Bản sao chứa cơ sở dữ liệu, tài liệu, tệp đính kèm và lịch sử. Nếu khôi phục bị ngắt, lần mở sau xóa đúng phần đã ghi dở và không báo thành công.</p></Collapsible>
  {confirmFile&&<ConfirmDialog title="Khôi phục thư viện?" confirmLabel="Khôi phục" danger onCancel={()=>setConfirmFile(null)} onConfirm={()=>void restore(confirmFile)}><p>Chỉ khôi phục vào thư viện trống. Thư viện đang có dữ liệu sẽ được giữ nguyên. Tệp: {confirmFile.name}.</p></ConfirmDialog>}
  {discard&&<ConfirmDialog title="Bỏ thay đổi chưa lưu?" confirmLabel="Bỏ thay đổi" danger onCancel={()=>setDiscard(false)} onConfirm={onClose}><p>Giới hạn sao lưu vừa sửa chưa được lưu.</p></ConfirmDialog>}
 </div></Dialog>;
}
