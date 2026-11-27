'use client';
import {usePathname,useRouter} from 'next/navigation';
import {useEffect,useState} from 'react';
import dynamic from 'next/dynamic';
import {loadAtlasSession} from '@/lib/atlas-client';
import {KeymapProvider} from './KeymapProvider';
import {LocaleProvider} from './LocaleProvider';
import WorkspaceLoading from './WorkspaceLoading';
import type {Locale} from '@/lib/i18n/locales';
const Workspace=dynamic(()=>import('./Workspace'));
const FolderWorkspace=dynamic(()=>import('./FolderWorkspace'));
function WorkspaceGate(){
 const router=useRouter();const [ready,setReady]=useState(false);const [folder,setFolder]=useState(false);
 useEffect(()=>{let cancelled=false;loadAtlasSession(true).then(s=>{
  if(cancelled)return;
  if(s.mode==='manager'||!s.libraryRoot||(s.switchError&&sessionStorage.getItem('atlas-recovery-accepted')!==s.runtimeId)){router.replace('/projects');return;}
  setFolder(!!s.folderMode);setReady(true);
 }).catch(()=>{if(!cancelled)router.replace('/projects');});return()=>{cancelled=true;};},[router]);
 return ready?(folder?<FolderWorkspace/>:<Workspace/>):<WorkspaceLoading/>;
}
export default function Shell({children,initialLocale}:{children:React.ReactNode;initialLocale:Locale}){
 const path=usePathname();const workspace=path!=='/'&&path!=='/projects'&&!path.startsWith('/help');
 return <LocaleProvider initialLocale={initialLocale}><KeymapProvider>{workspace&&<WorkspaceGate/>}{children}</KeymapProvider></LocaleProvider>;
}
