'use client';
import {Button as UiButton} from './ui/controls';

import {Dialog} from './ui/dialog';
import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Maximize2,Ratio,X} from 'lucide-react';
import {useKeymap} from './KeymapProvider';
import {Tooltip} from './Tooltip';

type Props={image?:{src:string;alt:string};svg?:string;onClose:()=>void};

function prefixSvgIds(html:string){
  const prefix='zoom-'+crypto.randomUUID().replaceAll('-','')+'-';
  const ids=new Set<string>();
  html.replace(/\bid=(["'])([^"']+)\1/gi,(_, __,id)=>{ids.add(id);return '';});
  html.replace(/\bid=([^\s"'=<>`]+)/gi,(_,id)=>{ids.add(id);return '';});
  let next=html;
  for(const id of ids){
    const safe=id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    next=next.replace(new RegExp(`\\bid=(["'])${safe}\\1`,'gi'),`id=$1${prefix}${id}$1`);
    next=next.replace(new RegExp(`\\bid=${safe}(?=[\\s>/])`,'gi'),`id=${prefix}${id}`);
    next=next.replace(new RegExp(`url\\((["']?)#${safe}\\1\\)`,'gi'),`url($1#${prefix}${id}$1)`);
    next=next.replace(new RegExp(`href=(["'])#${safe}\\1`,'gi'),`href=$1#${prefix}${id}$1`);
    next=next.replace(new RegExp(`xlink:href=(["'])#${safe}\\1`,'gi'),`xlink:href=$1#${prefix}${id}$1`);
  }
  return next;
}

function measureSvg(svgEl:SVGSVGElement){
  const vb=svgEl.viewBox?.baseVal;
  let w=vb?.width||0,h=vb?.height||0;
  if(w>1&&h>1)return {w,h};
  try{
    const box=svgEl.getBBox();
    if(box.width>1&&box.height>1){w=box.width;h=box.height;}
  }catch{/* not rendered yet */}
  if(!(w>1&&h>1)){
    w=Number(svgEl.getAttribute('width'))||svgEl.clientWidth||800;
    h=Number(svgEl.getAttribute('height'))||svgEl.clientHeight||600;
  }
  return {w:Math.max(1,w),h:Math.max(1,h)};
}

export default function ZoomLayer({image,svg,onClose}:Props){
  const frame=useRef<HTMLDivElement>(null);
  const box=useRef<HTMLDivElement>(null);
  const natural=useRef({w:1,h:1});
  const [view,setView]=useState({scale:1,x:0,y:0});
  const viewRef=useRef(view);
  viewRef.current=view;
  const drag=useRef<{px:number;py:number;x:number;y:number}|null>(null);
  const ready=useRef(false);
  const km=useKeymap();
  const zoomSvg=useMemo(()=>svg?prefixSvgIds(svg):'',[svg]);

  const fit=useCallback(()=>{
    const frameEl=frame.current;
    if(!frameEl||frameEl.clientWidth<32||frameEl.clientHeight<32)return false;
    const availW=Math.max(1,frameEl.clientWidth-48),availH=Math.max(1,frameEl.clientHeight-48);
    const scale=Math.min(4,Math.max(0.05,Math.min(availW/natural.current.w,availH/natural.current.h)));
    setView({scale,x:(frameEl.clientWidth-natural.current.w*scale)/2,y:(frameEl.clientHeight-natural.current.h*scale)/2});
    return true;
  },[]);

  const actual=useCallback(()=>{
    const frameEl=frame.current;
    if(!frameEl||frameEl.clientWidth<32||frameEl.clientHeight<32)return;
    setView({scale:1,x:(frameEl.clientWidth-natural.current.w)/2,y:(frameEl.clientHeight-natural.current.h)/2});
  },[]);

  const syncNatural=useCallback(()=>{
    if(image){
      const img=box.current?.querySelector('img');
      if(!img||!img.naturalWidth)return false;
      natural.current={w:img.naturalWidth,h:img.naturalHeight};
      return true;
    }
    const svgEl=box.current?.querySelector('svg');
    if(!svgEl)return false;
    const size=measureSvg(svgEl);
    svgEl.setAttribute('width',String(size.w));
    svgEl.setAttribute('height',String(size.h));
    svgEl.style.width=size.w+'px';
    svgEl.style.height=size.h+'px';
    natural.current=size;
    return true;
  },[image]);

  const scheduleFit=useCallback(()=>{
    const run=()=>{
      if(!syncNatural())return;
      if(fit())ready.current=true;
      else requestAnimationFrame(run);
    };
    requestAnimationFrame(run);
  },[fit,syncNatural]);

  useEffect(()=>{
    const el=frame.current;if(!el)return;
    const onWheel=(e:WheelEvent)=>{
      e.preventDefault();
      const factor=e.deltaY<0?1.1:0.9;
      setView(v=>{
        const scale=Math.min(4,Math.max(0.05,v.scale*factor));
        return {...v,scale};
      });
    };
    el.addEventListener('wheel',onWheel,{passive:false});
    return ()=>el.removeEventListener('wheel',onWheel);
  },[onClose]);

  useEffect(()=>km.pushLayer('zoom',70,()=>{onClose();return true;}),[km,onClose]);

  useEffect(()=>{
    ready.current=false;
    scheduleFit();
    const el=frame.current;if(!el||typeof ResizeObserver==='undefined')return;
    const ro=new ResizeObserver(()=>{if(ready.current)fit();else scheduleFit();});
    ro.observe(el);
    return ()=>ro.disconnect();
  },[zoomSvg,image,fit,scheduleFit]);

  return <Dialog title="Phóng to" onOpenChange={v=>{if(!v)onClose();}}>
    <div className="zoom-layer" role="dialog" aria-label="Phóng to">
      <div className="zoom-bar">
        <Tooltip content="Vừa khung"><UiButton type="button" className="zoom-icon" aria-label="Vừa khung" onClick={()=>fit()}><Maximize2 size={18}/></UiButton></Tooltip>
        <Tooltip content="100%"><UiButton type="button" className="zoom-icon" aria-label="100%" onClick={actual}><Ratio size={18}/></UiButton></Tooltip>
        <Tooltip content="Đóng"><UiButton type="button" className="zoom-icon" aria-label="Đóng" onClick={onClose}><X size={18}/></UiButton></Tooltip>
      </div>
      <div className="zoom-frame" ref={frame}
        onPointerDown={e=>{if(e.button!==0)return;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);drag.current={px:e.clientX,py:e.clientY,x:viewRef.current.x,y:viewRef.current.y};}}
        onPointerMove={e=>{const current=drag.current;if(!current)return;setView(v=>({...v,x:current.x+e.clientX-current.px,y:current.y+e.clientY-current.py}));}}
        onPointerUp={()=>{drag.current=null;}}
      >
        <div ref={box} className="zoom-content" style={{transform:`translate(${view.x}px, ${view.y}px) scale(${view.scale})`}}>
          {image
            ?<img src={image.src} alt={image.alt} draggable={false} onLoad={()=>scheduleFit()}/>
            :<div dangerouslySetInnerHTML={{__html:zoomSvg}}/>}
        </div>
      </div>
    </div>
  </Dialog>;
}
