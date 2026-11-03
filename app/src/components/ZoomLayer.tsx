'use client';
import {Button as UiButton} from './ui/controls';

import {Dialog} from './ui/dialog';
import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {X,Minus,Plus,Expand,Minimize} from 'lucide-react';
import {useKeymap} from './KeymapProvider';
import {Tooltip} from './Tooltip';

export type ZoomMode='medium'|'fullscreen';
type Props={initialMode?:ZoomMode;image?:{src:string;alt:string};svg?:string;onClose:()=>void};

export function prefixSvgIds(html:string){
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
  // Rewrite selectors only: declarations can contain colors such as #fff.
  const doc=new DOMParser().parseFromString(next,'image/svg+xml');
  for(const style of doc.querySelectorAll('style')){
    const sheet=new CSSStyleSheet();
    sheet.replaceSync(style.textContent||'');
    const rewrite=(rules:CSSRuleList)=>{
      for(const rule of Array.from(rules)){
        if(rule instanceof CSSStyleRule){
          for(const id of ids){
            const escaped=CSS.escape(id).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
            rule.selectorText=rule.selectorText.replace(new RegExp('#'+escaped+'(?![\\w-])','g'),'#'+CSS.escape(prefix+id));
          }
        }
        if('cssRules' in rule)rewrite((rule as CSSGroupingRule).cssRules);
      }
    };
    rewrite(sheet.cssRules);
    style.textContent=Array.from(sheet.cssRules,r=>r.cssText).join('\n');
  }
  return new XMLSerializer().serializeToString(doc.documentElement);
}

export function zoomView(v:{scale:number;x:number;y:number},factor:number,anchor:{x:number;y:number}){
  const scale=Math.min(4,Math.max(0.05,v.scale*factor)),ratio=scale/v.scale;
  return {scale,x:anchor.x-(anchor.x-v.x)*ratio,y:anchor.y-(anchor.y-v.y)*ratio};
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

export default function ZoomLayer({image,svg,onClose,initialMode='fullscreen'}:Props){
  const [mode,setMode]=useState<ZoomMode>(initialMode);
  const frame=useRef<HTMLDivElement>(null);
  const box=useRef<HTMLDivElement>(null);
  const natural=useRef({w:1,h:1});
  const [view,setView]=useState({scale:1,x:0,y:0});
  const viewRef=useRef(view);
  viewRef.current=view;
  const drag=useRef<{px:number;py:number;x:number;y:number}|null>(null);
  const ready=useRef(false);
  const fitMode=useRef(true);
  const frameSize=useRef({w:0,h:0});
  const km=useKeymap();
  const zoomSvg=useMemo(()=>svg?prefixSvgIds(svg):'',[svg]);

  const fit=useCallback(()=>{
    const frameEl=frame.current;
    if(!frameEl||frameEl.clientWidth<32||frameEl.clientHeight<32)return false;
    const availW=Math.max(1,frameEl.clientWidth-48),availH=Math.max(1,frameEl.clientHeight-48);
    const scale=Math.min(1.5,Math.max(0.05,Math.min(availW/natural.current.w,availH/natural.current.h)));
    fitMode.current=true;
    setView({scale,x:(frameEl.clientWidth-natural.current.w*scale)/2,y:(frameEl.clientHeight-natural.current.h*scale)/2});
    return true;
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
    svgEl.style.maxWidth='none';
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

  const zoomAt=useCallback((factor:number,point?:{x:number;y:number})=>{
    const el=frame.current;if(!el)return;
    const anchor=point||{x:el.clientWidth/2,y:el.clientHeight/2};
    fitMode.current=false;
    setView(v=>zoomView(v,factor,anchor));
  },[]);

  const bindFrame=useCallback((el:HTMLDivElement|null)=>{
    frame.current=el;if(!el)return;
    const onWheel=(e:WheelEvent)=>{
      e.preventDefault();
      const rect=el.getBoundingClientRect();
      zoomAt(e.deltaY<0?1.2:1/1.2,{x:e.clientX-rect.left,y:e.clientY-rect.top});
    };
    el.addEventListener('wheel',onWheel,{passive:false});
    ready.current=false;fitMode.current=true;scheduleFit();
    frameSize.current={w:el.clientWidth,h:el.clientHeight};
    const ro=new ResizeObserver(()=>{
      const prev=frameSize.current,next={w:el.clientWidth,h:el.clientHeight};
      frameSize.current=next;
      if(!ready.current)scheduleFit();
      else if(fitMode.current)fit();
      else setView(v=>({...v,x:v.x+(next.w-prev.w)/2,y:v.y+(next.h-prev.h)/2}));
    });
    ro.observe(el);
    return ()=>{el.removeEventListener('wheel',onWheel);ro.disconnect();};
  },[zoomAt,fit,scheduleFit,zoomSvg]);

  useEffect(()=>km.pushLayer('zoom',70,()=>{onClose();return true;}),[km,onClose]);


  return <Dialog closeOnOutside={mode==='medium'} overlayClassName={`zoom-overlay zoom-${mode}`} title="Phóng to" onOpenChange={v=>{if(!v)onClose();}}>
    <div className="zoom-layer" data-mode={mode} role="dialog" aria-label="Phóng to">
      <div className="zoom-bar">
        <UiButton aria-label="Thu nhỏ" disabled={view.scale<=0.05} onClick={()=>zoomAt(1/1.2)}><Minus size={18}/></UiButton>
        <Tooltip content="Vừa khung"><UiButton className="zoom-scale" aria-label="Vừa khung" onClick={()=>fit()}><output aria-label="Tỷ lệ phóng to">{Math.round(view.scale*100)}%</output></UiButton></Tooltip>
        <UiButton aria-label="Phóng lớn" disabled={view.scale>=4} onClick={()=>zoomAt(1.2)}><Plus size={18}/></UiButton>
        <UiButton aria-label={mode==='medium'?'Toàn màn hình':'Khung vừa'} onClick={()=>{fitMode.current=true;setMode(v=>v==='medium'?'fullscreen':'medium');scheduleFit();}}>{mode==='medium'?<Expand size={18}/>:<Minimize size={18}/>}</UiButton>
        <Tooltip content="Đóng"><UiButton type="button" className="zoom-icon" aria-label="Đóng" onClick={onClose}><X size={18}/></UiButton></Tooltip>
      </div>
      <div className="zoom-frame" ref={bindFrame}
        onPointerDown={e=>{if(e.button!==0)return;fitMode.current=false;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);drag.current={px:e.clientX,py:e.clientY,x:viewRef.current.x,y:viewRef.current.y};}}
        onPointerMove={e=>{const current=drag.current;if(!current)return;setView(v=>({...v,x:current.x+e.clientX-current.px,y:current.y+e.clientY-current.py}));}}
        onPointerUp={()=>{drag.current=null;}}
        onPointerCancel={()=>{drag.current=null;}}
        onLostPointerCapture={()=>{drag.current=null;}}
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
