'use client';

import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type MutableRefObject,type ReactNode} from 'react';
import {Download,ExternalLink,X} from 'lucide-react';
import {Button} from './ui/controls';
import {Dialog,ConfirmDialog} from './ui/dialog';
import {useLocale} from './LocaleProvider';
import {PRODUCT_CHANGELOG} from '@/lib/product';
import {readSkippedUpdate,updateNoticeActive,writeSkippedUpdate} from '@/lib/skipped-update';

type Operation={id:string;phase:string;failedPhase?:string;error?:string;recoveryCommand?:string};
export type UpdateStatus={
  currentVersion:string;
  development:boolean;
  latestVersion?:string;
  updateAvailable:boolean;
  canAutoUpdate:boolean;
  status:string;
  command?:string;
  guide?:string;
  nodeRequirement?:string;
  operation?:Operation;
};

type UpdateNoticeContextValue={
  status:UpdateStatus|null;
  noticeActive:boolean;
  openVersionDialog:()=>void;
  setUpdateDirty:(dirty:boolean)=>void;
};

const UpdateNoticeContext=createContext<UpdateNoticeContextValue|null>(null);

async function readStatus(force=false):Promise<UpdateStatus>{
  const response=await fetch('/api/update-status'+(force?'?refresh=1':''),{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Update check failed');
  return response.json();
}

export function useUpdateNotice(){
  const value=useContext(UpdateNoticeContext);
  if(!value)throw Error('useUpdateNotice requires UpdateNoticeProvider');
  return value;
}

/** Safe for brand chip when provider may be absent in tests. */
export function useUpdateNoticeOptional(){
  return useContext(UpdateNoticeContext);
}

function VersionDialogs({
  status,setStatus,open,setOpen,dirtyRef,noticeActive,skipped,setSkipped,
}:{
  status:UpdateStatus|null;
  setStatus:(s:UpdateStatus|null)=>void;
  open:boolean;
  setOpen:(v:boolean)=>void;
  dirtyRef:MutableRefObject<boolean>;
  noticeActive:boolean;
  skipped:string|null;
  setSkipped:(v:string|null)=>void;
}){
  const {t}=useLocale();
  const [confirm,setConfirm]=useState(false),[checking,setChecking]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false),[phase,setPhase]=useState('');
  const running=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);

  const check=async()=>{setChecking(true);setError('');try{setStatus(await readStatus(true));}catch{setError(t('help.update.unavailable'));}finally{setChecking(false);}};
  const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value);setCopied(true);setTimeout(()=>setCopied(false),1500);}catch{setError(t('help.update.copyFailed'));}};
  const skip=()=>{
    if(!status?.latestVersion)return;
    writeSkippedUpdate(status.latestVersion);
    setSkipped(status.latestVersion);
  };
  const update=async()=>{
    setConfirm(false);
    if(dirtyRef.current){setError(t('help.update.dirty'));return;}
    if(running.current)return;
    running.current=true;setBusy(true);setError('');setPhase('checking');
    try{
      const response=await fetch('/api/update',{method:'POST',headers:{'X-Atlas-Update':'1'}});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||t('help.update.failed'));
      setPhase('installing');
      const deadline=Date.now()+5*60*1000;
      while(alive.current&&Date.now()<deadline){
        await new Promise(resolve=>setTimeout(resolve,1500));
        let next:UpdateStatus;
        try{next=await readStatus();}catch{continue;}
        if(!alive.current)return;
        setStatus(next);
        if(!next.operation||next.operation.id!==data.id)continue;
        setPhase(next.operation.phase);
        if(next.operation.phase==='error')throw Error(t('help.update.failed')+' '+t('help.update.phase.'+(next.operation.failedPhase||'error'))+' '+(next.operation.error||''));
        if(next.operation.phase==='succeeded'){window.location.reload();return;}
      }
      throw Error(t('help.update.timeout'));
    }catch(e){if(alive.current)setError((e as Error).message);}
    finally{running.current=false;if(alive.current)setBusy(false);}
  };

  const skippedThis=!!(status?.updateAvailable&&status.latestVersion&&skipped&&!noticeActive);
  const label=status?.development?t('help.update.development')
    :skippedThis?t('help.update.skipped',{version:status?.latestVersion||''})
    :status?.status==='available'?t('help.update.available',{version:status.latestVersion||''})
    :status?.status==='current'?t('help.update.current')
    :status?.status==='disabled'?t('help.update.disabled')
    :t('help.update.unavailable');

  return <>
    {open&&<Dialog title={t('help.version')} busy={busy} onOpenChange={v=>{setOpen(v);if(!v)setError('');}}><section className="modal help-version-dialog" data-ui-block-shortcuts="">
      <div className="modal-heading"><h2>{t('help.version')}</h2><Button className="icon" disabled={busy} aria-label={t('common.close')} onClick={()=>setOpen(false)}><X size={18}/></Button></div>
      <p className="help-version-number">Atlas Docs <strong>{status?'v'+status.currentVersion:'…'}</strong></p>
      <p role="status">{checking?t('help.update.checking'):label}</p>
      {status?.development&&<p>{t('help.update.devNote')}</p>}
      {!status?.development&&<>
        <p>{t('help.update.dataNote')}</p>
        {status?.updateAvailable&&<p><a className="help-update-whats-new" href={PRODUCT_CHANGELOG} target="_blank" rel="noopener noreferrer">{t('help.update.whatsNew',{version:status.latestVersion||''})} <ExternalLink size={14} aria-hidden="true"/></a></p>}
        {status?.updateAvailable&&!status.canAutoUpdate&&<p>{t('help.update.manual')} <a href={status.guide||'/help/npm#updates'} target="_blank" rel="noopener noreferrer">{t('help.update.instructions')}</a>{status.nodeRequirement&&<> · {t('help.update.node',{version:status.nodeRequirement})}</>}</p>}
        {status?.command&&!status.canAutoUpdate&&status.updateAvailable&&<div className="help-update-command"><code>{status.command}</code><Button variant="ghost" onClick={()=>void copy(status.command!)}>{copied?t('common.copied'):t('common.copy')}</Button></div>}
      </>}
      {busy&&<p role="status">{t('help.update.progress')} {t('help.update.phase.'+phase)}</p>}
      {error&&<p role="alert" className="help-update-error">{error}</p>}
      {error&&status?.operation?.recoveryCommand&&<div className="help-update-command"><code>{status.operation.recoveryCommand}</code><Button onClick={()=>void copy(status.operation!.recoveryCommand!)}>{t('common.copy')}</Button></div>}
      <div className="modal-actions">
        {!status?.development&&<Button variant="ghost" disabled={checking||busy} onClick={()=>void check()}>{t('help.update.check')}</Button>}
        {status?.updateAvailable&&noticeActive&&<Button variant="ghost" disabled={checking||busy} onClick={skip}>{t('help.update.skip')}</Button>}
        {status?.updateAvailable&&status.canAutoUpdate&&<Button variant="primary" disabled={checking||busy} onClick={()=>{if(dirtyRef.current)setError(t('help.update.dirty'));else setConfirm(true);}}><Download size={16}/>{t('help.update.install')}</Button>}
      </div>
    </section></Dialog>}
    {confirm&&<ConfirmDialog title={t('help.update.install')} confirmLabel={t('help.update.install')} onCancel={()=>setConfirm(false)} onConfirm={()=>void update()}><p>{t('help.update.confirm')}</p></ConfirmDialog>}
  </>;
}

export function BrandVersionChip(){
  const ctx=useUpdateNoticeOptional();
  const {t}=useLocale();
  if(!ctx?.status)return null;
  const {status,noticeActive,openVersionDialog}=ctx;
  const label=noticeActive
    ?t('help.update.available',{version:status.latestVersion||''})
    :t('help.version');
  return (
    <button
      type="button"
      className={'brand-version'+(noticeActive?' is-update':'')}
      aria-label={label}
      title={label}
      onClick={openVersionDialog}
    >
      <span>v{status.currentVersion}</span>
      {noticeActive&&<i className="brand-update-dot" aria-hidden="true"/>}
    </button>
  );
}

export default function UpdateNoticeProvider({children}:{children:ReactNode}){
  const [status,setStatus]=useState<UpdateStatus|null>(null);
  const [open,setOpen]=useState(false);
  const [skipped,setSkipped]=useState<string|null>(null);
  const dirtyRef=useRef(false);

  useEffect(()=>{
    setSkipped(readSkippedUpdate());
    let alive=true;
    readStatus().then(data=>{if(alive)setStatus(data);}).catch(()=>{});
    return()=>{alive=false;};
  },[]);

  const noticeActive=useMemo(
    ()=>updateNoticeActive(status?.latestVersion,!!status?.updateAvailable,skipped),
    [status?.latestVersion,status?.updateAvailable,skipped],
  );

  const openVersionDialog=useCallback(()=>{setOpen(true);},[]);
  const setUpdateDirty=useCallback((dirty:boolean)=>{dirtyRef.current=dirty;},[]);

  const value=useMemo(()=>({status,noticeActive,openVersionDialog,setUpdateDirty}),[status,noticeActive,openVersionDialog,setUpdateDirty]);

  return (
    <UpdateNoticeContext.Provider value={value}>
      {children}
      <VersionDialogs
        status={status}
        setStatus={setStatus}
        open={open}
        setOpen={setOpen}
        dirtyRef={dirtyRef}
        noticeActive={noticeActive}
        skipped={skipped}
        setSkipped={setSkipped}
      />
    </UpdateNoticeContext.Provider>
  );
}
