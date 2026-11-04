'use client';
import {useRef} from 'react';
import {Select} from './ui/select';
export default function HeadingSelect({level,onChange,disabled=false}:{level:number;onChange:(level:number)=>void;disabled?:boolean}){
 const pending=useRef<number|null>(null);
 return <Select label="Kiểu đoạn văn" value={String(level)} disabled={disabled} onValueChange={value=>{pending.current=Number(value);}} onCloseAutoFocus={event=>{
  if(pending.current===null)return;
  event.preventDefault();const next=pending.current;pending.current=null;onChange(next);
 }} options={[{value:'0',label:'Đoạn văn'},...[1,2,3,4,5,6].map(level=>({value:String(level),label:`H${level} · Tiêu đề ${level}`}))]}/>;
}
