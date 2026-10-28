'use client';
import React,{createContext,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {activeScopes,allowsField,chordLabel,chordList,commands,eventChord,fieldKind,resolveChord,type Chord,type Keymap,type KeyRuntime} from '@/lib/keymap';

type Layer={order:number;close:()=>boolean;token:object};
type Capture=(event:KeyboardEvent)=>boolean;
type Api={
 overrides:Keymap;
 publish:(map:Keymap)=>void;
 text:(id:string)=>string;
 overridden:(id:string)=>boolean;
 register:(id:string,fn:()=>void)=>()=>void;
 pushLayer:(id:string,order:number,close:()=>boolean)=>()=>void;
 enterImage:()=>()=>void;
 setRuntime:(runtime:KeyRuntime)=>void;
 setCapture:(capture:Capture|null)=>void;
};

const Ctx=createContext<Api|null>(null);
const emptyRuntime:KeyRuntime={dialog:null,search:false,menu:false,resource:false,editing:false,source:false,doc:false};

export function KeymapProvider({children}:{children:React.ReactNode}){
 const [overrides,setOverrides]=useState<Keymap>({});
 const overridesRef=useRef(overrides);
 overridesRef.current=overrides;
 const handlers=useRef(new Map<string,()=>void>());
 const layers=useRef(new Map<string,Layer>());
 const runtime=useRef<KeyRuntime>(emptyRuntime);
 const capture=useRef<Capture|null>(null);
 const images=useRef(0);
 const value=useMemo<Api>(()=>({
  overrides,
  publish:setOverrides,
  text:id=>{const chord=resolveChord(id,overrides);return chord?chordLabel(chord):'';},
  overridden:id=>Object.prototype.hasOwnProperty.call(overrides,id),
  register(id,fn){handlers.current.set(id,fn);return ()=>{if(handlers.current.get(id)===fn)handlers.current.delete(id);};},
  pushLayer(id,order,close){const token={};layers.current.set(id,{order,close,token});return ()=>{const current=layers.current.get(id);if(current?.token===token)layers.current.delete(id);};},
  enterImage(){images.current+=1;return ()=>{images.current=Math.max(0,images.current-1);};},
  setRuntime(next){runtime.current=next;},
  setCapture(next){capture.current=next;},
 }),[overrides]);
 useEffect(()=>{
  const onKey=(event:KeyboardEvent)=>{
   if(capture.current){if(capture.current(event)){event.preventDefault();event.stopPropagation();}return;}
   if(event.key==='Escape'){
    const ordered=[...layers.current.values()].sort((a,b)=>b.order-a.order);
    for(const layer of ordered){if(layer.close()){event.preventDefault();event.stopPropagation();return;}}
    return;
   }
   const find=event.target instanceof Element&&event.target.closest('[data-keymap-find]');
   if(event.key==='Enter'&&find){event.preventDefault();event.stopPropagation();handlers.current.get(event.shiftKey?'find.prev':'find.next')?.();return;}
   if(event.repeat||event.isComposing)return;
   const chord=eventChord(event);
   if(!chord)return;
   const where=fieldKind(event.target);
   for(const scope of activeScopes(runtime.current,images.current>0)){
    for(const command of commands){
     if(command.scope!==scope||!chordList(command.id,overridesRef.current).some(item=>same(item,chord)))continue;
     if(!allowsField(command,where,event.target))continue;
     const run=handlers.current.get(command.id);
     if(!run)continue;
     event.preventDefault();event.stopPropagation();run();return;
    }
   }
  };
  document.addEventListener('keydown',onKey,true);
  return ()=>document.removeEventListener('keydown',onKey,true);
 },[]);
 return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function same(a:Chord,b:Chord){return !!a.mod===!!b.mod&&!!a.alt===!!b.alt&&!!a.shift===!!b.shift&&a.key===b.key;}

export function useKeymap(){
 const value=useContext(Ctx);
 if(!value)throw Error('Keymap chưa được bật');
 return value;
}
