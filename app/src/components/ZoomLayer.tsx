'use client';
import React,{useEffect,useRef,useState} from 'react';

type Props={image?:{src:string;alt:string};svg?:string;onClose:()=>void};

export default function ZoomLayer({image,svg,onClose}:Props){
  const frame=useRef<HTMLDivElement>(null);
  const box=useRef<HTMLDivElement>(null);
  const natural=useRef({w:1,h:1});
  const [view,setView]=useState({scale:1,x:0,y:0});
  const viewRef=useRef(view);
  viewRef.current=view;
  const drag=useRef<{px:number;py:number;x:number;y:number}|null>(null);

  const fit=()=>{
    const frameEl=frame.current;if(!frameEl)return;
    const availW=Math.max(1,frameEl.clientWidth-48),availH=Math.max(1,frameEl.clientHeight-48);
    const scale=Math.min(4,Math.max(0.2,Math.min(availW/natural.current.w,availH/natural.current.h)));
    setView({scale,x:(frameEl.clientWidth-natural.current.w*scale)/2,y:(frameEl.clientHeight-natural.current.h*scale)/2});
  };
  const actual=()=>{
    const frameEl=frame.current;if(!frameEl)return;
    setView({scale:1,x:(frameEl.clientWidth-natural.current.w)/2,y:(frameEl.clientHeight-natural.current.h)/2});
  };

  useEffect(()=>{
    const el=frame.current;if(!el)return;
    const onWheel=(e:WheelEvent)=>{e.preventDefault();const factor=e.deltaY<0?1.1:0.9;setView(v=>({...v,scale:Math.min(4,Math.max(0.2,v.scale*factor))}));};
    el.addEventListener('wheel',onWheel,{passive:false});
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};
    window.addEventListener('keydown',onKey);
    return()=>{el.removeEventListener('wheel',onWheel);window.removeEventListener('keydown',onKey);};
  },[onClose]);
  useEffect(()=>{
    if(!svg)return;
    const svgEl=box.current?.querySelector('svg');if(!svgEl)return;
    const vb=svgEl.viewBox?.baseVal;
    const w=vb?.width||800,h=vb?.height||600;
    svgEl.setAttribute('width',String(w));
    svgEl.setAttribute('height',String(h));
    natural.current={w,h};
    fit();
  },[svg]);

  return <div className="zoom-layer" role="dialog" aria-label="Phóng to"><div className="zoom-bar"><button type="button" onClick={fit}>Vừa khung</button><button type="button" onClick={actual}>100%</button><button type="button" onClick={onClose}>Đóng</button></div><div className="zoom-frame" ref={frame} onPointerDown={e=>{if(e.button!==0)return;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);drag.current={px:e.clientX,py:e.clientY,x:viewRef.current.x,y:viewRef.current.y};}} onPointerMove={e=>{const current=drag.current;if(!current)return;setView(v=>({...v,x:current.x+e.clientX-current.px,y:current.y+e.clientY-current.py}));}} onPointerUp={()=>{drag.current=null;}}><div ref={box} className="zoom-content" style={{transform:`translate(${view.x}px, ${view.y}px) scale(${view.scale})`}}>{image?<img src={image.src} alt={image.alt} draggable={false} onLoad={e=>{natural.current={w:e.currentTarget.naturalWidth||1,h:e.currentTarget.naturalHeight||1};fit();}}/>:<div dangerouslySetInnerHTML={{__html:svg||''}}/>}</div></div></div>;
}
