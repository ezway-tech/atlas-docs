'use client';
import {useEffect,useRef,useState} from 'react';
import {BookOpen,ChevronDown,CircleHelp,Coffee,Download,History,Info,X} from 'lucide-react';
import {Button} from './ui/controls';
import {Dialog,ConfirmDialog} from './ui/dialog';
import {DropdownMenu,MenuItem,MenuLink,MenuSeparator} from './ui/patterns';
import {useLocale} from './LocaleProvider';

type Operation={id:string;phase:string;failedPhase?:string;error?:string;recoveryCommand?:string};
type Status={currentVersion:string;development:boolean;latestVersion?:string;updateAvailable:boolean;canAutoUpdate:boolean;status:string;command?:string;guide?:string;nodeRequirement?:string;operation?:Operation};
async function readStatus(force=false):Promise<Status>{
 const response=await fetch('/api/update-status'+(force?'?refresh=1':''),{cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Update check failed');
 return response.json();
}

export default function HelpMenu({dirty}:{dirty:boolean}){
 const {t}=useLocale();
 const [status,setStatus]=useState<Status|null>(null),[open,setOpen]=useState(false),[confirm,setConfirm]=useState(false),[checking,setChecking]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false),[phase,setPhase]=useState('');
 const running=useRef(false),alive=useRef(true),dirtyRef=useRef(dirty);
 dirtyRef.current=dirty;
 useEffect(()=>{alive.current=true;readStatus().then(data=>{if(alive.current)setStatus(data);}).catch(()=>{});return()=>{alive.current=false;};},[]);
 const check=async()=>{setChecking(true);setError('');try{setStatus(await readStatus(true));}catch{setError(t('help.update.unavailable'));}finally{setChecking(false);}};
 const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value);setCopied(true);setTimeout(()=>setCopied(false),1500);}catch{setError(t('help.update.copyFailed'));}};
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
    let next:Status;
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
 const label=status?.development?t('help.update.development'):status?.status==='available'?t('help.update.available',{version:status.latestVersion||''}):status?.status==='current'?t('help.update.current'):status?.status==='disabled'?t('help.update.disabled'):t('help.update.unavailable');
 return <>
  <DropdownMenu align="end" trigger={<Button className="top-help" aria-label={t('utilities.menu.help')}><CircleHelp size={16}/><span>{t('utilities.menu.help')}</span>{status?.updateAvailable&&<i className="help-update-dot" aria-label={t('help.update.available',{version:status.latestVersion||''})}/>}<ChevronDown size={16}/></Button>}>
   <MenuLink href="/help"><BookOpen size={16}/>{t('help.guide')}</MenuLink>
   <MenuLink href="/help/changelog"><History size={16}/>{t('help.releaseNotes')}</MenuLink>
   <MenuItem onSelect={()=>{setOpen(true);setError('');}}><Info size={16}/><span className="help-version-label">{t('help.version')}</span></MenuItem>
   <MenuSeparator/>
   <MenuLink href="https://atlasdocs.ezway.tech/donate/"><Coffee size={16}/>{t('help.donate')}</MenuLink>
  </DropdownMenu>
  {open&&<Dialog title={t('help.version')} busy={busy} onOpenChange={setOpen}><section className="modal help-version-dialog" data-ui-block-shortcuts="">
   <div className="modal-heading"><h2>{t('help.version')}</h2><Button className="icon" disabled={busy} aria-label={t('common.close')} onClick={()=>setOpen(false)}><X size={18}/></Button></div>
   <p className="help-version-number">Atlas Docs <strong>{status?'v'+status.currentVersion:'…'}</strong></p>
   <p role="status">{checking?t('help.update.checking'):label}</p>
   {status?.development&&<p>{t('help.update.devNote')}</p>}
   {!status?.development&&<>
    <p>{t('help.update.dataNote')}</p>
    {status?.updateAvailable&&!status.canAutoUpdate&&<p>{t('help.update.manual')} <a href={status.guide||'/help/npm#updates'} target="_blank" rel="noopener noreferrer">{t('help.update.instructions')}</a>{status.nodeRequirement&&<> · {t('help.update.node',{version:status.nodeRequirement})}</>}</p>}
    {status?.command&&!status.canAutoUpdate&&status.updateAvailable&&<div className="help-update-command"><code>{status.command}</code><Button variant="ghost" onClick={()=>void copy(status.command!)}>{copied?t('common.copied'):t('common.copy')}</Button></div>}
   </>}
   {busy&&<p role="status">{t('help.update.progress')} {t('help.update.phase.'+phase)}</p>}
   {error&&<p role="alert" className="help-update-error">{error}</p>}
   {error&&status?.operation?.recoveryCommand&&<div className="help-update-command"><code>{status.operation.recoveryCommand}</code><Button onClick={()=>void copy(status.operation!.recoveryCommand!)}>{t('common.copy')}</Button></div>}
   <div className="modal-actions">
    {!status?.development&&<Button variant="ghost" disabled={checking||busy} onClick={()=>void check()}>{t('help.update.check')}</Button>}
    {status?.updateAvailable&&status.canAutoUpdate&&<Button variant="primary" disabled={checking||busy} onClick={()=>{if(dirty)setError(t('help.update.dirty'));else setConfirm(true);}}><Download size={16}/>{t('help.update.install')}</Button>}
   </div>
  </section></Dialog>}
  {confirm&&<ConfirmDialog title={t('help.update.install')} confirmLabel={t('help.update.install')} onCancel={()=>setConfirm(false)} onConfirm={()=>void update()}><p>{t('help.update.confirm')}</p></ConfirmDialog>}
 </>;
}
