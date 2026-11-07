'use client';
import {useRef} from 'react';
import {Select} from './ui/select';
import {useLocale} from './LocaleProvider';

export default function HeadingSelect({level,onChange,disabled=false}:{level:number;onChange:(level:number)=>void;disabled?:boolean}){
 const {t}=useLocale();
 const pending=useRef<number|null>(null);
 return <Select label={t('editor.headingSelect.label')} value={String(level)} disabled={disabled} onValueChange={value=>{pending.current=Number(value);}} onCloseAutoFocus={event=>{
  if(pending.current===null)return;
  event.preventDefault();const next=pending.current;pending.current=null;onChange(next);
 }} options={[{value:'0',label:t('editor.format.paragraph')},...[1,2,3,4,5,6].map(n=>({value:String(n),label:t('editor.headingSelect.option',{n})}))]}/>;
}
