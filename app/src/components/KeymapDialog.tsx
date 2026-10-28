'use client';
import React,{useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {chordLabel,commands,commandById,eventChord,fixedKeys,groups,resolveChord,sameChord,sanitizeKeymap,type Chord,type Keymap} from '@/lib/keymap';
import {useKeymap} from './KeymapProvider';

export function KeymapDialog({keymap,onClose,onSave}:{keymap:Keymap;onClose:()=>void;onSave:(map:Keymap)=>void}){
 const km=useKeymap();
 const [query,setQuery]=useState('');
 const [listen,setListen]=useState<string|null>(null);
 const [error,setError]=useState('');
 const saved=useRef(keymap);
 saved.current=keymap;
 useEffect(()=>{
  if(!listen){km.setCapture(null);return;}
  km.setCapture(event=>{
   if(event.repeat)return false;
   const field=event.target instanceof HTMLElement&&!!event.target.closest('input,textarea');
   if(event.key==='Escape'){setListen(null);setError('');return true;}
   if(field&&!event.ctrlKey&&!event.metaKey&&!event.altKey)return false;
   if(event.key==='Backspace'){commit(listen,null);return true;}
   const chord=eventChord(event);
   if(!chord)return false;
   commit(listen,chord);
   return true;
  });
  return ()=>km.setCapture(null);
 },[km,listen]);
 function commit(id:string,chord:Chord|null){
  const command=commandById(id);
  if(!command)return;
  const next={...saved.current};
  if(chord===null){if(command.default)next[id]=null;else delete next[id];}
  else if(command.default&&sameChord(chord,command.default))delete next[id];
  else next[id]=chord;
  try{onSave(sanitizeKeymap(next));setError('');setListen(null);}catch(reason){setError((reason as Error).message);}
 }
 const needle=query.trim().toLocaleLowerCase('vi');
 const visible=commands.filter(command=>!needle||command.label.toLocaleLowerCase('vi').includes(needle));
 const fixed=fixedKeys.filter(item=>!needle||item.label.toLocaleLowerCase('vi').includes(needle)||item.keys.toLocaleLowerCase('vi').includes(needle));
 return <div className="backdrop"><div className="modal wide keymap-dialog" role="dialog" aria-modal="true" aria-labelledby="keymap-title">
  <div className="modal-heading"><h2 id="keymap-title">Phím tắt</h2><button type="button" aria-label="Đóng" onClick={onClose}><X/></button></div>
  <label className="keymap-search">Tìm lệnh<input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="Tên lệnh"/></label>
  {error&&<p className="keymap-error" role="alert">{error}</p>}
  <div className="keymap-list">{groups.map(group=>{
   const rows=visible.filter(command=>command.group===group.id);
   if(!rows.length)return null;
   return <section key={group.id}><h3>{group.label}</h3>{rows.map(command=>{
    const current=resolveChord(command.id,keymap);
    const listening=listen===command.id;
    const custom=Object.prototype.hasOwnProperty.call(keymap,command.id);
    return <div className="keymap-row" key={command.id}><span>{command.label}</span><span>{listening?<em className="keymap-listen">Nhấn tổ hợp mới…</em>:current?<kbd>{chordLabel(current)}</kbd>:<em>Chưa gán</em>}</span><button type="button" className="btn ghost" onClick={()=>setListen(listening?null:command.id)}>{listening?'Hủy':'Đổi'}</button>{custom?<button type="button" className="btn ghost" onClick={()=>commit(command.id,command.default)}>Mặc định</button>:<span/>}</div>;
   })}</section>;
  })}{!!fixed.length&&<section><h3>Hộp thoại</h3><p className="keymap-note">Phím này cố định, không đổi được.</p>{fixed.map(item=><div className="keymap-row keymap-fixed" key={item.label}><span>{item.label}</span><kbd>{item.keys}</kbd><span/><span/></div>)}</section>}</div>
  <div className="modal-actions"><button type="button" className="btn ghost" onClick={()=>{onSave({});setError('');setListen(null);}}>Khôi phục toàn bộ</button><button type="button" className="btn primary" onClick={onClose}>Xong</button></div>
 </div></div>;
}
