'use client';
import {Button as UiButton,Input as UiInput} from './ui/controls';

import {Dialog} from './ui/dialog';
import {Select} from './ui/select';
import React,{useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {chordLabel,commands,commandById,eventChord,fixedKeys,groups,resolveChord,sameChord,sanitizeKeymap,type Chord,type Keymap} from '@/lib/keymap';
import {useKeymap} from './KeymapProvider';

export function KeymapDialog({keymap,onClose,onSave}:{keymap:Keymap;onClose:()=>void;onSave:(map:Keymap)=>void}){
 const km=useKeymap();
 const [query,setQuery]=useState('');
 const [category,setCategory]=useState('all');
 const [status,setStatus]=useState('all');
 const listRef=useRef<HTMLDivElement>(null);
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
 const normalize=(value:string)=>value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/\s/g,'');
 const needle=normalize(query);
 const matches=commands.filter(command=>{
  const chord=resolveChord(command.id,keymap);
  return (!needle||normalize(command.label).includes(needle)||(chord&&normalize(chordLabel(chord)).includes(needle)))&&
   (status==='all'||(status==='assigned'&&!!chord)||(status==='unassigned'&&!chord)||(status==='custom'&&Object.prototype.hasOwnProperty.call(keymap,command.id)));
 });
 const fixedMatches=fixedKeys.filter(item=>(status==='all'||status==='assigned')&&(!needle||normalize(item.label).includes(needle)||normalize(item.keys).includes(needle)));
 const visible=matches.filter(command=>category==='all'||command.group===category);
 const fixed=category==='all'||category==='fixed'?fixedMatches:[];
 const categories=[{id:'all',label:'Tất cả',count:matches.length+fixedMatches.length},...groups.map(group=>({...group,count:matches.filter(command=>command.group===group.id).length})),{id:'fixed',label:'Hộp thoại',count:fixedMatches.length}];
 function resetFilters(){setQuery('');setCategory('all');setStatus('all');}
 useEffect(()=>{setListen(null);setError('');listRef.current?.scrollTo(0,0);},[query,category,status]);
 return <Dialog title="Phím tắt" overlayClassName="keymap-backdrop" onEscape={()=>{if(listen){setListen(null);setError('');}else onClose();}} onOpenChange={v=>{if(!v)onClose();}}><div className="modal wide keymap-dialog" role="dialog" aria-modal="true" aria-labelledby="keymap-title">
  <div className="modal-heading"><h2 id="keymap-title">Phím tắt</h2><UiButton type="button" aria-label="Đóng" onClick={onClose}><X/></UiButton></div>
  <div className="keymap-toolbar">
   <label className="keymap-search">Tìm lệnh hoặc phím tắt<UiInput autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="Ví dụ: soạn thảo, Ctrl+K…"/></label>
   <label>Trạng thái<Select label="Trạng thái" value={status} onValueChange={setStatus} options={[{value:"all",label:"Tất cả trạng thái"},{value:"assigned",label:"Đã gán phím"},{value:"unassigned",label:"Chưa gán phím"},{value:"custom",label:"Đã tùy chỉnh"}]}/></label>
  </div>
  <div className="keymap-workspace">
  <nav className="keymap-categories" aria-label="Nhóm phím tắt">{categories.map(group=><UiButton type="button" key={group.id} aria-pressed={category===group.id} onClick={()=>setCategory(group.id)}><span>{group.label}</span><span className="keymap-count">{group.count}</span></UiButton>)}</nav>
  <div className="keymap-content">
  <div className="keymap-results"><strong>{categories.find(group=>group.id===category)?.label}</strong><span role="status">{visible.length+fixed.length} lệnh</span></div>
  {error&&<p className="keymap-error" role="alert">{error}</p>}
  <div className="keymap-list" ref={listRef}>{!visible.length&&!fixed.length&&<div className="keymap-empty"><strong>Không tìm thấy lệnh phù hợp</strong><p>Thử từ khóa khác hoặc bỏ bộ lọc.</p><UiButton type="button" className="btn ghost" onClick={resetFilters}>Xóa bộ lọc</UiButton></div>}{groups.map(group=>{
   const rows=visible.filter(command=>command.group===group.id);
   if(!rows.length)return null;
   return <section key={group.id}><h3>{group.label}</h3>{rows.map(command=>{
    const current=resolveChord(command.id,keymap);
    const listening=listen===command.id;
    const custom=Object.prototype.hasOwnProperty.call(keymap,command.id);
    return <div className="keymap-row" key={command.id}><span>{command.label}</span><span>{listening?<em className="keymap-listen">Nhấn tổ hợp mới…</em>:current?<kbd>{chordLabel(current)}</kbd>:<em>Chưa gán</em>}</span><div className="keymap-row-actions"><UiButton type="button" className="btn ghost" aria-label={`${listening?'Hủy đổi':'Đổi phím tắt'}: ${command.label}`} onClick={()=>{setError('');setListen(listening?null:command.id);}}>{listening?'Hủy':'Đổi'}</UiButton>{custom&&<UiButton type="button" className="btn ghost" aria-label={`Khôi phục mặc định: ${command.label}`} onClick={()=>commit(command.id,command.default)}>Mặc định</UiButton>}</div></div>;
   })}</section>;
  })}{!!fixed.length&&<section><h3>Hộp thoại</h3><p className="keymap-note">Phím này cố định, không đổi được.</p>{fixed.map(item=><div className="keymap-row keymap-fixed" key={item.label}><span>{item.label}</span><kbd>{item.keys}</kbd><span/><span/></div>)}</section>}</div>
  </div></div>
  <div className="modal-actions"><span className="keymap-hint">{listen?'Nhấn tổ hợp mới · Esc để hủy · Backspace để bỏ gán':'Thay đổi phím tắt được lưu ngay.'}</span><UiButton type="button" className="btn ghost" onClick={()=>{onSave({});setError('');setListen(null);}}>Khôi phục toàn bộ</UiButton><UiButton type="button" className="btn primary" onClick={onClose}>Xong</UiButton></div>
 </div></Dialog>;
}
