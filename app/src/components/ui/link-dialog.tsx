'use client';
import {useState} from 'react';
import type {Editor} from '@tiptap/react';
import {Dialog} from './dialog';
import {Button,Field,Input} from './controls';
import {useLocale} from '../LocaleProvider';

export function LinkDialog({editor,onClose}:{editor:Editor;onClose:()=>void}){
 const {t}=useLocale();
 const [href,setHref]=useState(String(editor.getAttributes('link').href||'https://'));
 const [selection]=useState(()=>({from:editor.state.selection.from,to:editor.state.selection.to}));
 const [error,setError]=useState('');
 function save(remove=false){if(editor.isDestroyed){onClose();return;}const value=href.trim();if(!remove&&value&&/^(javascript|data|vbscript):/i.test(value)){setError(t('link.dialog.invalid'));return;}const chain=editor.chain().focus().setTextSelection(selection).extendMarkRange('link');const ok=remove||!value?chain.unsetLink().run():chain.setLink({href:value}).run();if(ok)onClose();else setError(t('link.dialog.invalid'));}
 function cancel(){onClose();requestAnimationFrame(()=>{if(!editor.isDestroyed)editor.commands.focus();});}
 return <Dialog title={t('link.dialog.title')} onOpenChange={v=>{if(!v)cancel();}}><form data-ui-block-shortcuts="" className="modal" onSubmit={e=>{e.preventDefault();save();}}><div className="modal-heading"><h2>{t('link.dialog.title')}</h2></div><Field label="URL" error={error}><Input autoFocus value={href} onChange={e=>setHref(e.target.value)} placeholder="https://…"/></Field><div className="modal-actions"><Button variant="ghost" onClick={cancel}>{t('common.cancel')}</Button><Button variant="ghost" onClick={()=>save(true)}>{t('link.dialog.remove')}</Button><Button variant="primary" type="submit">{t('common.save')}</Button></div></form></Dialog>;
}
