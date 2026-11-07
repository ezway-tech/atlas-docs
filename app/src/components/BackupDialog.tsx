'use client';
import {useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {BACKUP_LIMIT_CEILING,DEFAULT_BACKUP_LIMITS,formatBytes} from '@/lib/backup-policy';
import type {BackupPolicy} from '@/lib/types';
import {Button,Field,Input} from './ui/controls';
import {ConfirmDialog,Dialog} from './ui/dialog';
import {Collapsible} from './ui/patterns';
import {formatLimitFieldError,mibText,parseMib,parsePositiveInt} from './limit-fields';
import {useApiError,useLocale} from './LocaleProvider';

async function api<T>(url:string,init?:RequestInit):Promise<T>{const resp=await fetch(url,{cache:'no-store',...init});const data=await resp.json();if(!resp.ok)throw Error(data.error||resp.statusText);return data as T;}

export async function downloadBackup(){
 const check=await api<{ok:boolean;blockers:string[]}>('/api/backup?check=1');
 if(!check.ok)throw Error(check.blockers.join(' '));
 const resp=await fetch('/api/backup');
 if(!resp.ok)throw Error((await resp.json()).error||resp.statusText);
 const url=URL.createObjectURL(await resp.blob());
 const link=document.createElement('a');link.href=url;link.download='atlas-docs-backup.zip';link.click();
 setTimeout(()=>URL.revokeObjectURL(url),500);
 return 'backup.toast.downloaded';
}

export default function BackupDialog({onClose,pickRequest,onNotify}:{onClose:()=>void;pickRequest:number;onNotify:(message:string)=>void}){
 const {t}=useLocale();
 const apiError=useApiError();
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
 const dataLabel=t('limits.label.backupUncompressedPolicy');
 const zipLabel=t('limits.label.backupZipPolicy');
 const countLabel=t('limits.label.backupFilesPolicy');
 const data=parseMib(dataMib,BACKUP_LIMIT_CEILING.maxUncompressedBytes,dataLabel);
 const zip=parseMib(zipMib,BACKUP_LIMIT_CEILING.maxZipBytes,zipLabel);
 const count=parsePositiveInt(files,BACKUP_LIMIT_CEILING.maxDataFiles,countLabel);
 const fieldErr=(row:{error?:import('./limit-fields').LimitFieldError})=>row.error?formatLimitFieldError(t,row.error):'';
 const dirty=!!saved&&data.value!==undefined&&zip.value!==undefined&&count.value!==undefined&&(data.value!==saved.maxUncompressedBytes||zip.value!==saved.maxZipBytes||count.value!==saved.maxDataFiles);
 const invalid=(dataMib!==''&&data.value===undefined)||(zipMib!==''&&zip.value===undefined)||(files!==''&&count.value===undefined);
 const busy=task!=='';
 useEffect(()=>{void api<{backup?:BackupPolicy}>('/api/settings').then(settings=>{const backup=settings.backup||DEFAULT_BACKUP_LIMITS;setSaved(backup);setDataMib(mibText(backup.maxUncompressedBytes));setZipMib(mibText(backup.maxZipBytes));setFiles(String(backup.maxDataFiles));}).catch(e=>setError(apiError(e)));},[apiError]);
 useEffect(()=>{if(pickRequest>0)fileRef.current?.click();},[pickRequest]);
 useEffect(()=>()=>{document.querySelector<HTMLElement>('.tools-trigger')?.focus();},[]);
 function requestClose(){if(busy)return;if(dirty)setDiscard(true);else onClose();}
 async function save(){if(!data.value||!zip.value||!count.value)return;setTask('save');setError('');try{const backup={maxUncompressedBytes:data.value,maxZipBytes:zip.value,maxDataFiles:count.value};const next=await api<{backup?:BackupPolicy}>('/api/settings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({backup})});setSaved(next.backup||backup);setNotice(t('backup.limits.savedToast'));}catch(e){setError(apiError(e));}finally{setTask('');}}
 async function download(){setTask('download');setError('');setNotice('');try{const key=await downloadBackup();setNotice(t(key));}catch(e){setError(apiError(e));}finally{setTask('');}}
 async function restore(file:File){setConfirmFile(null);setTask('restore');setError('');setNotice('');try{const data=await api<{historyOver?:{id:string}[]}>('/api/backup',{method:'POST',headers:{'Content-Type':'application/zip'},body:file});onNotify(data.historyOver?.length?t('backup.toast.restoredHistoryOver',{count:data.historyOver.length}):t('backup.toast.restored'));window.location.reload();}catch(e){setError(apiError(e));setTask('');}}
 return <Dialog title={t('backup.dialog.title')} busy={busy} onEscape={requestClose} onOpenChange={v=>{if(!v)requestClose();}}><div className="modal library-modal"><div className="modal-heading"><h2>{t('backup.dialog.title')}</h2><Button aria-label={t('common.close')} disabled={busy} onClick={requestClose}><X size={16}/></Button></div>
  {error&&<p className="storage-block" role="alert">{error}</p>}
  {notice&&<p role="status">{notice}</p>}
  <section><h3>{t('backup.section.export')}</h3><p>{t('backup.section.exportBlurb')}</p><Button variant="primary" disabled={busy} onClick={()=>void download()}>{task==='download'?t('backup.downloading'):t('backup.download')}</Button></section>
  <section><h3>{t('backup.section.restore')}</h3><p className="storage-warn">{t('backup.restore.emptyOnly')}</p><input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)setConfirmFile(file);}}/><Button variant="ghost" disabled={busy} onClick={()=>fileRef.current?.click()}>{t('backup.restore.pickFile')}</Button></section>
  <Collapsible summary={t('common.advanced')}><p className="storage-meta">{t('backup.advanced.mibNote')}</p>
   <div className="storage-fields"><Field label={t('backup.limits.dataMiB')} error={fieldErr(data)}><Input value={dataMib} inputMode="decimal" onChange={e=>{setDataMib(e.target.value);setNotice('');}}/></Field><Field label={t('backup.limits.zipMiB')} error={fieldErr(zip)}><Input value={zipMib} inputMode="decimal" onChange={e=>{setZipMib(e.target.value);setNotice('');}}/></Field><Field label={t('backup.limits.fileCount')} error={fieldErr(count)}><Input value={files} inputMode="numeric" onChange={e=>{setFiles(e.target.value);setNotice('');}}/></Field></div>
   <p className="storage-meta">{saved?t('backup.limits.current',{uncompressed:formatBytes(saved.maxUncompressedBytes),zip:formatBytes(saved.maxZipBytes),files:saved.maxDataFiles}):t('backup.limits.loading')}</p>
   <Button variant="secondary" disabled={busy||!dirty||!!invalid} onClick={()=>void save()}>{t('backup.limits.save')}</Button>
  </Collapsible>
  <Collapsible summary={t('common.details')}><p>{t('backup.details.format')}</p></Collapsible>
  {confirmFile&&<ConfirmDialog title={t('backup.confirm.restore.title')} confirmLabel={t('backup.section.restore')} danger onCancel={()=>setConfirmFile(null)} onConfirm={()=>void restore(confirmFile)}><p>{t('backup.confirm.restore.body',{name:confirmFile.name})}</p></ConfirmDialog>}
  {discard&&<ConfirmDialog title={t('dialogs.discardUnsaved.title')} confirmLabel={t('common.discardChanges')} danger onCancel={()=>setDiscard(false)} onConfirm={onClose}><p>{t('backup.confirm.discard')}</p></ConfirmDialog>}
 </div></Dialog>;
}
