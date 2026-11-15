'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {BookOpen} from 'lucide-react';
import {loadAtlasSession,type AtlasSession} from '@/lib/atlas-client';
import LibraryManager from './LibraryManager';
import {useT} from './LocaleProvider';
export default function ProjectsPage(){
 const t=useT(),router=useRouter();const [session,setSession]=useState<AtlasSession|null>(null),[error,setError]=useState('');
 useEffect(()=>{let cancelled=false;loadAtlasSession(true).then(s=>{if(!cancelled)setSession(s);}).catch(e=>{if(!cancelled)setError(e.message);});return()=>{cancelled=true;};},[]);
 const enter=()=>{if(!session?.libraryRoot)return;sessionStorage.setItem('atlas-recovery-accepted',session.runtimeId);router.push('/workspace');};
 return <main className="projects-page"><div className="projects-layout"><div className="projects-brand"><span className="projects-brand-icon"><BookOpen size={24}/></span><strong>Atlas Docs</strong></div>
 {error?<p role="alert">{error}</p>:session?<LibraryManager embedded session={session} onEnterCurrent={enter}/>:<p role="status">{t('common.loading')}</p>}
 </div></main>;
}
