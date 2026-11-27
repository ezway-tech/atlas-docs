'use client';

import {useEffect, useState} from 'react';
import {atlasFetch, atlasJson} from '@/lib/atlas-client';
import {useLocale} from './LocaleProvider';
import Markdown from './Markdown';
import OpenApiView from './OpenApiView';
import SqlView from './SqlView';
import './folder-workspace.css';

type Entry = {path:string; supported:boolean};
type Catalogue = {files:Entry[]; unreadable:string[]; readOnly:boolean};
type Document = {raw:string; version:string};

function Tree({files, prefix='', choose}:{files:Entry[]; prefix?:string; choose:(path:string)=>void}) {
  const groups = new Map<string,Entry[]>();
  const items = [];
  for (const file of files) {
    const relative=file.path.slice(prefix.length);
    const slash=relative.indexOf('/');
    if(slash<0){items.push(file);continue;}
    const folder=relative.slice(0,slash);
    if(!groups.has(folder))groups.set(folder,[]);
    groups.get(folder)!.push(file);
  }
  return <ul>{Array.from(groups,([name,children])=><li key={name}><details open><summary>{name}</summary><Tree files={children} prefix={prefix+name+'/'} choose={choose}/></details></li>)}
    {items.map(file=><li key={file.path}><button disabled={!file.supported} onClick={()=>choose(file.path)}>{file.path.slice(prefix.length)}</button></li>)}</ul>;
}

export default function FolderWorkspace() {
  const {t}=useLocale();
  const [catalog,setCatalog]=useState<Catalogue|null>(null);
  const [path,setPath]=useState('');
  const [document,setDocument]=useState<Document|null>(null);
  const [draft,setDraft]=useState('');
  const [editing,setEditing]=useState(false);
  const [busy,setBusy]=useState(false);
  const [conflict,setConflict]=useState<Document|null>(null);
  const [versions,setVersions]=useState<string[]|null>(null);
  const [error,setError]=useState('');
  const [refresh,setRefresh]=useState(0);
  const url='/api/folder-files?path='+encodeURIComponent(path);
  useEffect(()=>{
    let active=true;
    atlasJson<Catalogue>('/api/folder-files').then(data=>{if(active)setCatalog(data);}).catch(e=>{if(active)setError(e.message);});
    const focus=()=>setRefresh(n=>n+1);
    window.addEventListener('focus',focus);
    return ()=>{active=false;window.removeEventListener('focus',focus);};
  },[refresh]);
  useEffect(()=>{
    let active=true;
    if(path&&!editing)atlasJson<Document>(url).then(data=>{if(active){setDocument(data);setDraft(data.raw);setError('');}}).catch(e=>{if(active){setDocument(null);setError(e.message);}});
    return ()=>{active=false;};
  },[url,path,editing,refresh]);
  const dirty=editing&&draft!==document?.raw;
  useEffect(()=>{
    const guard=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',guard);return ()=>window.removeEventListener('beforeunload',guard);
  },[dirty]);
  function choose(next:string){
    if(next===path||busy||(dirty&&!window.confirm(t('folderProject.discard'))))return;
    setPath(next);setVersions(null);setEditing(false);setDocument(null);setConflict(null);setError('');
  }
  async function save(){
    if(!document||busy)return;
    setBusy(true);
    try{
      const response=await atlasFetch(url,{method:'PUT',headers:{'X-Atlas-Library-Api':'1'},body:JSON.stringify({raw:draft,version:document.version})});
      const data=await response.json();
      if(response.status===409&&data.conflict){setConflict(data);return;}
      if(!response.ok)throw Error(data.error||response.statusText);
      setDocument(data);setEditing(false);setConflict(null);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <main className="folder-workspace"><aside><a href="/projects">← {t('folderProject.projects')}</a><p><a href="/help/user-guide#open-an-existing-document-folder">{t('help.guide')}</a></p><h2>{t('folderProject.files')}</h2>
    {catalog?.readOnly&&<p>{t('folderProject.readOnly')}</p>}
    {catalog&&!catalog.files.some(file=>file.supported)&&<p>{t('folderProject.empty')}</p>}
    {catalog&&<Tree files={catalog.files} choose={choose}/>}
    {catalog?.unreadable.map(dir=><p key={dir}>{t('folderProject.error',{path:dir||'/'})}</p>)}
    </aside><section><h1>{path||t('folderProject.choose')}</h1>{error&&<p role="alert">{error}</p>}
    {document&&!editing&&<button onClick={async()=>{try{setVersions(versions?null:await atlasJson<string[]>(url+'&history'));}catch(e){setError((e as Error).message);}}}>{t('folderProject.history')}</button>}
    {versions&&!editing&&<ul>{versions.length===0&&<li>{t('folderProject.noHistory')}</li>}{versions.map(id=><li key={id}><button disabled={catalog?.readOnly} onClick={async()=>{try{const old=await atlasJson<Document>(url+'&revision='+encodeURIComponent(id));setDraft(old.raw);setEditing(true);setVersions(null);}catch(e){setError((e as Error).message);}}}>{t('folderProject.revision',{date:new Date(Number(id.slice(0,13))).toLocaleString()})}</button></li>)}</ul>}
    {document&&<>{!catalog?.readOnly&&<p>{editing?<><button disabled={busy||!!conflict} onClick={save}>{t('folderProject.save')}</button> <button disabled={busy} onClick={()=>{if(!dirty||window.confirm(t('folderProject.discard'))){setEditing(false);setConflict(null);}}}>{t('folderProject.cancel')}</button></>:<button onClick={()=>setEditing(true)}>{t('folderProject.edit')}</button>}</p>}
    {editing?<><textarea aria-label={t('folderProject.text')} value={draft} disabled={busy} onChange={e=>setDraft(e.target.value)}/>{conflict&&<><h2>{t('folderProject.conflict')}</h2><pre>{conflict.raw}</pre><button onClick={()=>{setDocument(conflict);setConflict(null);}}>{t('folderProject.keep')}</button></>}</>:
    /\.md$|\.markdown$/i.test(path)?<Markdown content={document.raw} docId={path}/>: /\.sql$/i.test(path)?<SqlView source={document.raw} dark={false}/>:/(?:^|[\s"{,])(openapi|swagger)["']?\s*:/m.test(document.raw)?<OpenApiView source={document.raw}/>:<pre>{document.raw}</pre>}</>}
    </section></main>;
}
