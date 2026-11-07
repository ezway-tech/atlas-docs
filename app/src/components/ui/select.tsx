'use client';

import type React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import {Check, ChevronDown, ChevronUp} from 'lucide-react';
import {useLocale} from '../LocaleProvider';

// shadcn/ui's Radix composition, styled with the application's theme tokens.
export function Select({value,onValueChange,options,label,placeholder,className,ref,disabled,id,onCloseAutoFocus}:{
 value:string;
 onValueChange:(value:string)=>void;
 options:{value:string;label:string}[];
 label:string;
 placeholder?:string;className?:string;ref?:React.Ref<HTMLButtonElement>;disabled?:boolean;id?:string;
 onCloseAutoFocus?:(event:Event)=>void;
}){
 const {t}=useLocale();
 const resolvedPlaceholder=placeholder??t('common.choose');

 return <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
  <SelectPrimitive.Trigger ref={ref} id={id} className={["ui-select-trigger",className].filter(Boolean).join(" ")} aria-label={label}>
   <SelectPrimitive.Value placeholder={resolvedPlaceholder}/>
   <SelectPrimitive.Icon asChild><ChevronDown size={16}/></SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
  <SelectPrimitive.Portal>
   <SelectPrimitive.Content className="ui-select-content" position="popper" sideOffset={6} collisionPadding={12} data-ui-popup="" onCloseAutoFocus={onCloseAutoFocus}>
    <SelectPrimitive.ScrollUpButton className="ui-select-scroll"><ChevronUp size={16}/></SelectPrimitive.ScrollUpButton>
    <SelectPrimitive.Viewport className="ui-select-viewport">
     {options.map(option=><SelectPrimitive.Item className="ui-select-item" key={option.value} value={option.value}>
      <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="ui-select-check"><Check size={16}/></SelectPrimitive.ItemIndicator>
     </SelectPrimitive.Item>)}
    </SelectPrimitive.Viewport>
    <SelectPrimitive.ScrollDownButton className="ui-select-scroll"><ChevronDown size={16}/></SelectPrimitive.ScrollDownButton>
   </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
 </SelectPrimitive.Root>;
}
