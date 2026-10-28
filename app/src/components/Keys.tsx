'use client';
import React from 'react';
import {Tooltip} from './Tooltip';
import {useKeymap} from './KeymapProvider';

export function CommandKeys({id}:{id:string}){
 const text=useKeymap().text(id);
 if(!text)return null;
 return <kbd className="menu-key">{text}</kbd>;
}

export function CommandTip({id,label,children}:{id:string;label:string;children:React.ReactElement}){
 const text=useKeymap().text(id);
 return <Tooltip content={text?<>{label} <kbd>{text}</kbd></>:label}>{children}</Tooltip>;
}
