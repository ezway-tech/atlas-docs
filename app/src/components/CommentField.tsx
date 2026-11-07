'use client';
import {Button as UiButton} from './ui/controls';

import React,{useEffect,useRef,useState} from 'react';
import {EditorContent,useEditor} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {Markdown} from '@tiptap/markdown';
import {Bold,Italic,Strikethrough,Heading2,Code2,Link2,List,ListOrdered,Quote,ListChecks} from 'lucide-react';
import {LinkDialog} from './ui/link-dialog';
import {Tooltip} from './Tooltip';
import {useLocale} from './LocaleProvider';

type MdEditor={getMarkdown:()=>string};
const plain=(s:string)=>s.replace(/\s+$/,'');
export type CommentFieldApi={focus:()=>void};

export default function CommentField({value,onChange,label,placeholder,onReady}:{value:string;onChange:(v:string)=>void;label?:string;placeholder?:string;onReady?:(api:CommentFieldApi)=>void}){
 const {t}=useLocale();
 const ready=useRef(onReady);
 ready.current=onReady;
 const [,bump]=useState(0);
 const fieldLabel=label??t('comments.field.defaultLabel');
 const editor=useEditor({
  immediatelyRender:false,
  extensions:[StarterKit.configure({link:{openOnClick:false}}),Markdown],
  content:value,
  contentType:'markdown',
  onUpdate:({editor:current})=>onChange(plain((current as typeof current & MdEditor).getMarkdown())),
  onSelectionUpdate:()=>bump(n=>n+1),
  editorProps:{attributes:{class:'comment-surface','aria-label':fieldLabel}},
 });
 useEffect(()=>{
  if(!editor)return;
  const md=plain((editor as typeof editor & MdEditor).getMarkdown());
  if(md!==plain(value))editor.commands.setContent(value,{contentType:'markdown',emitUpdate:false});
 },[editor,value]);
 useEffect(()=>{
  if(!editor)return;
  ready.current?.({focus:()=>editor.commands.focus()});
 },[editor]);
 const [linkOpen,setLinkOpen]=useState(false);
 if(!editor)return <div className="comment-field"><div className="comment-surface"/></div>;
 const link=()=>{setLinkOpen(true);};
 const tools:[string,React.ReactNode,()=>void,boolean][]=[
  [t('comments.toolbar.bold'),<Bold size={15}/>,()=>editor.chain().focus().toggleBold().run(),editor.isActive('bold')],
  [t('comments.toolbar.italic'),<Italic size={15}/>,()=>editor.chain().focus().toggleItalic().run(),editor.isActive('italic')],
  [t('comments.toolbar.strike'),<Strikethrough size={15}/>,()=>editor.chain().focus().toggleStrike().run(),editor.isActive('strike')],
  [t('comments.toolbar.heading'),<Heading2 size={15}/>,()=>editor.chain().focus().toggleHeading({level:2}).run(),editor.isActive('heading',{level:2})],
  ['Code',<Code2 size={15}/>,()=>editor.chain().focus().toggleCode().run(),editor.isActive('code')],
  [t('editor.format.link'),<Link2 size={15}/>,link,editor.isActive('link')],
  [t('editor.format.list'),<List size={15}/>,()=>editor.chain().focus().toggleBulletList().run(),editor.isActive('bulletList')],
  [t('editor.format.number'),<ListOrdered size={15}/>,()=>editor.chain().focus().toggleOrderedList().run(),editor.isActive('orderedList')],
  [t('editor.format.quote'),<Quote size={15}/>,()=>editor.chain().focus().toggleBlockquote().run(),editor.isActive('blockquote')],
  [t('editor.format.task'),<ListChecks size={15}/>,()=>editor.chain().focus().insertContent('<p>'+t('comments.toolbar.taskDefault')+'</p>').run(),false],
 ];
 return <div className={editor.isEmpty&&placeholder?'comment-field is-empty':'comment-field'} data-placeholder={placeholder||''}><div className="comment-bar"><div className="comment-tools">{tools.map(([name,icon,run,on])=><Tooltip key={name} content={name}><UiButton type="button" aria-label={name} aria-pressed={on} className={on?'active':''} onMouseDown={e=>e.preventDefault()} onClick={run}>{icon}</UiButton></Tooltip>)}</div></div><EditorContent editor={editor}/>{linkOpen&&<LinkDialog editor={editor} onClose={()=>setLinkOpen(false)}/>}</div>;
}
