'use client';
import React,{cloneElement,isValidElement,useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

type Side='top'|'bottom';
type TipProps={
  onMouseEnter?:React.MouseEventHandler;
  onMouseLeave?:React.MouseEventHandler;
  onFocus?:React.FocusEventHandler;
  onBlur?:React.FocusEventHandler;
  ref?:React.Ref<HTMLElement>;
  'aria-describedby'?:string;
};

export function Tooltip({content,children,side='top',onlyOverflow=false}:{content:React.ReactNode;children:React.ReactElement<TipProps>;side?:Side;onlyOverflow?:boolean}){
  const [open,setOpen]=useState(false),[box,setBox]=useState<{top:number;left:number}|null>(null);
  const anchor=useRef<HTMLElement|null>(null),tipRef=useRef<HTMLDivElement|null>(null),timer=useRef<number|undefined>(undefined);
  const id=useId();
  const hide=()=>{window.clearTimeout(timer.current);setOpen(false);setBox(null);};
  const show=()=>{window.clearTimeout(timer.current);timer.current=window.setTimeout(()=>{const el=anchor.current;if(!el)return;if(onlyOverflow&&el.scrollWidth<=el.clientWidth+1)return;setOpen(true);},300);};
  useLayoutEffect(()=>{if(!open)return;const el=anchor.current,tip=tipRef.current;if(!el||!tip)return;const r=el.getBoundingClientRect(),w=tip.offsetWidth,h=tip.offsetHeight;let place:Side=side;if(place==='top'&&r.top<h+12)place='bottom';if(place==='bottom'&&window.innerHeight-r.bottom<h+12)place='top';const left=Math.min(window.innerWidth-w-8,Math.max(8,r.left+r.width/2-w/2));setBox({top:place==='top'?r.top-h-8:r.bottom+8,left});},[open,side]);
  useEffect(()=>{if(!open)return;const onScroll=()=>hide();window.addEventListener('scroll',onScroll,true);window.addEventListener('resize',hide);return()=>{window.removeEventListener('scroll',onScroll,true);window.removeEventListener('resize',hide);};},[open]);
  useEffect(()=>()=>window.clearTimeout(timer.current),[]);
  if(!isValidElement(children))return children;
  const prev=children.props;
  const child=cloneElement(children,{
    ref:(node:HTMLElement|null)=>{anchor.current=node;const r=prev.ref;if(typeof r==='function')r(node);else if(r)r.current=node;},
    onMouseEnter:e=>{prev.onMouseEnter?.(e);show();},
    onMouseLeave:e=>{prev.onMouseLeave?.(e);hide();},
    onFocus:e=>{prev.onFocus?.(e);show();},
    onBlur:e=>{prev.onBlur?.(e);hide();},
    'aria-describedby':open?id:undefined,
  });
  return <>{child}{open&&typeof document!=='undefined'&&createPortal(<div ref={tipRef} id={id} role="tooltip" className="atlas-tip" style={{top:box?.top??-9999,left:box?.left??0,visibility:box?'visible':'hidden'}}>{content}</div>,document.body)}</>;
}

export function Ellipsis({text,as='span'}:{text:string;as?:'span'|'small'}){
  const Tag=as;
  return <Tooltip content={text} onlyOverflow><Tag>{text}</Tag></Tooltip>;
}
