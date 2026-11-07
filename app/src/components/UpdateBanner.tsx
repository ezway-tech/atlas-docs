'use client';
import {useEffect,useState} from 'react';

type Notice={
 updateAvailable:boolean;
 currentVersion?:string;
 latestVersion?:string|null;
 command?:string|null;
 note?:string;
};

export default function UpdateBanner(){
 const [notice,setNotice]=useState<Notice|null>(null);
 const [copied,setCopied]=useState(false);
 useEffect(()=>{
  let cancel=false;
  fetch('/api/update-status',{cache:'no-store'})
   .then(r=>r.ok?r.json():null)
   .then((data:Notice|null)=>{if(!cancel&&data?.updateAvailable)setNotice(data);})
   .catch(()=>{});
  return()=>{cancel=true;};
 },[]);
 if(!notice?.updateAvailable)return null;
 return (
  <div role="status" style={{padding:'8px 12px',borderBottom:'1px solid var(--border, #ccc)',fontSize:13,display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
   <span>Update available: {notice.currentVersion} → {notice.latestVersion}</span>
   {notice.command?(
    <>
     <code style={{userSelect:'all'}}>{notice.command}</code>
     <button type="button" onClick={async()=>{
      try{await navigator.clipboard.writeText(notice.command||'');setCopied(true);setTimeout(()=>setCopied(false),1500);}catch{}
     }}>{copied?'Copied':'Copy command'}</button>
    </>
   ):null}
   {notice.note?<span style={{opacity:.8}}>{notice.note}</span>:null}
  </div>
 );
}
