'use client';
import React,{useEffect,useId,useState} from 'react';
import {Slider as RSlider,Popover as RPopover} from 'radix-ui';
import {HexColorPicker} from 'react-colorful';
import {useLocale} from '../LocaleProvider';
export const cx=(...parts:(string|undefined|false)[])=>parts.filter(Boolean).join(' ');
export type ButtonProps=React.ComponentPropsWithRef<'button'>&{variant?:'primary'|'secondary'|'ghost'|'danger';size?:'sm'|'md'|'lg'};
export function Button({variant,size='md',className,type='button',...props}:ButtonProps){return <button type={type} className={cx('ui-button',variant&&`btn ${variant}`,`ui-size-${size}`,className)} {...props}/>;}
export function IconButton({label,className,...props}:ButtonProps&{label:string}){return <Button aria-label={label} className={cx('ui-icon-button',className)} {...props}/>;}
export function Input({className,...props}:React.ComponentPropsWithRef<'input'>){return <input className={cx('ui-input',className)} {...props}/>;}
export function Textarea({className,...props}:React.ComponentPropsWithRef<'textarea'>){return <textarea className={cx('ui-input',className)} {...props}/>;}
export function Field({label,hint,error,children,className}:{label:string;hint?:string;error?:string;children:React.ReactElement<{id?:string;'aria-describedby'?:string;'aria-invalid'?:boolean}>;className?:string}){const uid=useId(),id=children.props.id||uid;return <div className={cx('ui-field',className)}><label htmlFor={id}>{label}</label>{React.cloneElement(children,{id,'aria-describedby':error||hint?id+'-hint':undefined,'aria-invalid':!!error})}{(error||hint)&&<small id={id+'-hint'} role={error?'alert':undefined}>{error||hint}</small>}</div>;}
export function NumberInput({value,onValueChange,min,max,step=1,...props}:Omit<React.ComponentPropsWithRef<'input'>,'value'|'onChange'|'min'|'max'|'step'|'type'>&{value:number;onValueChange:(v:number)=>void;min:number;max:number;step?:number}){
 const [draft,setDraft]=useState(String(value));useEffect(()=>setDraft(String(value)),[value]);
 const commit=(raw:string)=>{const n=raw.trim()===''?value:Number(raw);const next=Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n/step)*step)):value;setDraft(String(next));if(next!==value)onValueChange(next);};
 return <Input {...props} role="spinbutton" inputMode="decimal" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={e=>{commit(draft);props.onBlur?.(e);}} onKeyDown={e=>{props.onKeyDown?.(e);if(e.defaultPrevented)return;if(e.key==='Enter'){e.preventDefault();commit(draft);}if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();commit(String(value+(e.key==='ArrowUp'?step:-step)));}}}/>;
}
export function Slider({value,onValueChange,label,className,...props}:Omit<React.ComponentPropsWithRef<typeof RSlider.Root>,'value'|'onValueChange'>&{value:number;onValueChange:(v:number)=>void;label:string}){return <RSlider.Root {...props} value={[value]} onValueChange={v=>onValueChange(v[0])} className={cx('ui-slider',className)}><RSlider.Track className="ui-slider-track"><RSlider.Range className="ui-slider-range"/></RSlider.Track><RSlider.Thumb className="ui-slider-thumb" aria-label={label}/></RSlider.Root>;}
export function Popover({trigger,children,label,open,onOpenChange}:{trigger:React.ReactElement;children:React.ReactNode;label:string;open?:boolean;onOpenChange?:(v:boolean)=>void}){return <RPopover.Root open={open} onOpenChange={onOpenChange}><RPopover.Trigger asChild>{trigger}</RPopover.Trigger><RPopover.Portal><RPopover.Content aria-label={label} data-ui-popup="" className="ui-popover" sideOffset={6} collisionPadding={12}>{children}</RPopover.Content></RPopover.Portal></RPopover.Root>;}
export function ColorPicker({value,onValueChange,disabled,label}:{value:string;onValueChange:(v:string)=>void;disabled?:boolean;label?:string}){
 const {t}=useLocale();
 const resolved=label??t('imageEditor.color');
 const [draft,setDraft]=useState(value);useEffect(()=>setDraft(value),[value]);
 return <Popover label={resolved} trigger={<Button className="ui-color-trigger" disabled={disabled} aria-label={resolved}><span style={{background:value}}/>{value.toUpperCase()}</Button>}><HexColorPicker color={value} onChange={onValueChange}/><Field label={t('common.hexColor')}><Input value={draft} onChange={e=>{setDraft(e.target.value);if(/^#[0-9a-f]{6}$/i.test(e.target.value))onValueChange(e.target.value);}} onBlur={()=>setDraft(value)}/></Field><div className="ui-color-swatches">{['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#000000','#ffffff'].map(color=><IconButton key={color} label={color} style={{background:color}} onClick={()=>onValueChange(color)}/>)}</div></Popover>;
}
