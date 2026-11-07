'use client';
import {Button as UiButton,Input as UiInput} from './ui/controls';

import {Dialog} from './ui/dialog';
import {Select} from './ui/select';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {chordLabel,commands,commandById,eventChord,fixedKeys,groups,resolveChord,sameChord,sanitizeKeymap,type Chord,type Keymap} from '@/lib/keymap';
import {useKeymap} from './KeymapProvider';
import {useLocale} from './LocaleProvider';

export function KeymapDialog({keymap,onClose,onSave}:{keymap:Keymap;onClose:()=>void;onSave:(map:Keymap)=>void}){
 const {t,lowerText}=useLocale();
 const km=useKeymap();
 const [query,setQuery]=useState('');
 const [category,setCategory]=useState('all');
 const [status,setStatus]=useState('all');
 const listRef=useRef<HTMLDivElement>(null);
 const [listen,setListen]=useState<string|null>(null);
 const [error,setError]=useState('');
 const saved=useRef(keymap);
 saved.current=keymap;
 const commandLabel=(id:string)=>t('keymap.commands.'+id);
 const groupLabel=(id:string)=>t('keymap.groups.'+id);
 const fixedKeyId:Record<string,string>={'Escape':'closeTop','Enter':'findNext','Shift+Enter':'findPrev'};
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
 const normalize=(value:string)=>lowerText(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/\s/g,'');
 const needle=normalize(query);
 const matches=commands.filter(command=>{
  const chord=resolveChord(command.id,keymap);
  const label=commandLabel(command.id);
  return (!needle||normalize(label).includes(needle)||(chord&&normalize(chordLabel(chord)).includes(needle)))&&
   (status==='all'||(status==='assigned'&&!!chord)||(status==='unassigned'&&!chord)||(status==='custom'&&Object.prototype.hasOwnProperty.call(keymap,command.id)));
 });
 const fixedMatches=fixedKeys.filter(item=>{
  const label=t('keymap.fixed.'+(fixedKeyId[item.keys]||'closeTop'));
  return (status==='all'||status==='assigned')&&(!needle||normalize(label).includes(needle)||normalize(item.keys).includes(needle));
 });
 const visible=matches.filter(command=>category==='all'||command.group===category);
 const fixed=category==='all'||category==='fixed'?fixedMatches:[];
 const categories=useMemo(()=>[{id:'all',label:t('keymap.category.all'),count:matches.length+fixedMatches.length},...groups.map(group=>({id:group.id,label:groupLabel(group.id),count:matches.filter(command=>command.group===group.id).length})),{id:'fixed',label:t('keymap.category.fixed'),count:fixedMatches.length}],[matches.length,fixedMatches.length,t,groupLabel]);
 function resetFilters(){setQuery('');setCategory('all');setStatus('all');}
 useEffect(()=>{setListen(null);setError('');listRef.current?.scrollTo(0,0);},[query,category,status]);
 return <Dialog title={t('keymap.dialog.title')} overlayClassName="keymap-backdrop" onEscape={()=>{if(listen){setListen(null);setError('');}else onClose();}} onOpenChange={v=>{if(!v)onClose();}}><div className="modal wide keymap-dialog" role="dialog" aria-modal="true" aria-labelledby="keymap-title">
  <div className="modal-heading"><h2 id="keymap-title">{t('keymap.dialog.title')}</h2><UiButton type="button" aria-label={t('common.close')} onClick={onClose}><X/></UiButton></div>
  <div className="keymap-toolbar">
   <label className="keymap-search">{t('keymap.search.label')}<UiInput autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder={t('keymap.search.placeholder')}/></label>
   <label>{t('keymap.status.label')}<Select label={t('keymap.status.label')} value={status} onValueChange={setStatus} options={[{value:"all",label:t('keymap.status.all')},{value:"assigned",label:t('keymap.status.assigned')},{value:"unassigned",label:t('keymap.status.unassigned')},{value:"custom",label:t('keymap.status.custom')}]}/></label>
  </div>
  <div className="keymap-workspace">
  <nav className="keymap-categories" aria-label={t('keymap.categoriesAria')}>{categories.map(group=><UiButton type="button" key={group.id} aria-pressed={category===group.id} onClick={()=>setCategory(group.id)}><span>{group.label}</span><span className="keymap-count">{group.count}</span></UiButton>)}</nav>
  <div className="keymap-content">
  <div className="keymap-results"><strong>{categories.find(group=>group.id===category)?.label}</strong><span role="status">{t('keymap.commandsCount',{count:visible.length+fixed.length})}</span></div>
  {error&&<p className="keymap-error" role="alert">{error}</p>}
  <div className="keymap-list" ref={listRef}>{!visible.length&&!fixed.length&&<div className="keymap-empty"><strong>{t('keymap.empty.title')}</strong><p>{t('keymap.empty.body')}</p><UiButton type="button" className="btn ghost" onClick={resetFilters}>{t('keymap.resetAll')}</UiButton></div>}{groups.map(group=>{
   const rows=visible.filter(command=>command.group===group.id);
   if(!rows.length)return null;
   return <section key={group.id}><h3>{groupLabel(group.id)}</h3>{rows.map(command=>{
    const current=resolveChord(command.id,keymap);
    const listening=listen===command.id;
    const custom=Object.prototype.hasOwnProperty.call(keymap,command.id);
    const label=commandLabel(command.id);
    return <div className="keymap-row" key={command.id}><span>{label}</span><span>{listening?<em className="keymap-listen">{t('keymap.listen')}</em>:current?<kbd>{chordLabel(current)}</kbd>:<em>{t('keymap.unassigned')}</em>}</span><div className="keymap-row-actions"><UiButton type="button" className="btn ghost" aria-label={listening?`${t('keymap.changeCancel')}: ${label}`:`${t('keymap.changeShortcut')}: ${label}`} onClick={()=>{setError('');setListen(listening?null:command.id);}}>{listening?t('keymap.changeCancel'):t('keymap.change')}</UiButton>{custom&&<UiButton type="button" className="btn ghost" aria-label={`${t('keymap.resetDefault')}: ${label}`} onClick={()=>commit(command.id,command.default)}>{t('keymap.resetDefault')}</UiButton>}</div></div>;
   })}</section>;
  })}{!!fixed.length&&<section><h3>{t('keymap.category.fixed')}</h3><p className="keymap-note">{t('keymap.fixedNote')}</p>{fixed.map(item=><div className="keymap-row keymap-fixed" key={item.keys}><span>{t('keymap.fixed.'+(fixedKeyId[item.keys]||'closeTop'))}</span><kbd>{item.keys}</kbd><span/><span/></div>)}</section>}</div>
  </div></div>
  <div className="modal-actions"><span className="keymap-hint">{listen?t('keymap.hint.listening'):t('keymap.hint.saved')}</span><UiButton type="button" className="btn ghost" onClick={()=>{onSave({});setError('');setListen(null);}}>{t('keymap.resetAll')}</UiButton><UiButton type="button" className="btn primary" onClick={onClose}>{t('common.done')}</UiButton></div>
 </div></Dialog>;
}
