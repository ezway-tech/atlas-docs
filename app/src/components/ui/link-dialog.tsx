'use client';
import {useState} from 'react';
import type {Editor} from '@tiptap/react';
import {Dialog} from './dialog';
import {Button,Field,Input} from './controls';
export function LinkDialog({editor,onClose}:{editor:Editor;onClose:()=>void}){
 const [href,setHref]=useState(String(editor.getAttributes('link').href||'https://'));
 const [selection]=useState(()=>({from:editor.state.selection.from,to:editor.state.selection.to}));
 const [error,setError]=useState('');
 function save(remove=false){if(editor.isDestroyed){onClose();return;}const value=href.trim();if(!remove&&value&&/^(javascript|data|vbscript):/i.test(value)){setError('Liên kết không hợp lệ.');return;}const chain=editor.chain().focus().setTextSelection(selection).extendMarkRange('link');const ok=remove||!value?chain.unsetLink().run():chain.setLink({href:value}).run();if(ok)onClose();else setError('Liên kết không hợp lệ.');}
 function cancel(){onClose();requestAnimationFrame(()=>{if(!editor.isDestroyed)editor.commands.focus();});}
 return <Dialog title="Địa chỉ liên kết" onOpenChange={v=>{if(!v)cancel();}}><form data-ui-block-shortcuts="" className="modal" onSubmit={e=>{e.preventDefault();save();}}><div className="modal-heading"><h2>Địa chỉ liên kết</h2></div><Field label="URL" error={error}><Input autoFocus value={href} onChange={e=>setHref(e.target.value)} placeholder="https://…"/></Field><div className="modal-actions"><Button variant="ghost" onClick={cancel}>Hủy</Button><Button variant="ghost" onClick={()=>save(true)}>Gỡ liên kết</Button><Button variant="primary" type="submit">Lưu</Button></div></form></Dialog>;
}
