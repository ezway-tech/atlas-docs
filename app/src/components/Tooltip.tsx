'use client';
import React,{useRef,useState} from 'react';
import {Tooltip as RT} from 'radix-ui';
export function Tooltip({content,children,side='top',onlyOverflow=false}:{content:React.ReactNode;children:React.ReactElement;side?:'top'|'bottom';onlyOverflow?:boolean}){
 const [open,setOpen]=useState(false);const anchor=useRef<HTMLElement|null>(null);
 const child=children as React.ReactElement<{ref?:React.Ref<HTMLElement>}>;
 return <RT.Provider delayDuration={300}><RT.Root open={open} onOpenChange={v=>setOpen(v&&(!onlyOverflow||!!anchor.current&&anchor.current.scrollWidth>anchor.current.clientWidth+1))}><RT.Trigger asChild>{React.cloneElement(child,{ref:(node:HTMLElement|null)=>{anchor.current=node;const ref=child.props.ref;if(typeof ref==='function')ref(node);else if(ref)ref.current=node;}})}</RT.Trigger><RT.Portal><RT.Content className="ui-tooltip" side={side} sideOffset={8} collisionPadding={8}>{content}</RT.Content></RT.Portal></RT.Root></RT.Provider>;
}
export function Ellipsis({text,as='span'}:{text:string;as?:'span'|'small'}){const Tag=as;return <Tooltip content={text} onlyOverflow><Tag>{text}</Tag></Tooltip>;}
