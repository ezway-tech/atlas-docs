'use client';
import React,{useEffect,useRef,useState} from 'react';
import {EditorContent,useEditor} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {Markdown} from '@tiptap/markdown';
import {Bold,Italic,Strikethrough,Heading2,Code2,Link2,List,ListOrdered,Quote,ListChecks} from 'lucide-react';
import {Tooltip} from './Tooltip';

type MdEditor={getMarkdown:()=>string};
const plain=(s:string)=>s.replace(/\s+$/,'');
export type CommentFieldApi={focus:()=>void};

export default function CommentField({value,onChange,label,placeholder,onReady}:{value:string;onChange:(v:string)=>void;label?:string;placeholder?:string;onReady?:(api:CommentFieldApi)=>void}){
 const ready=useRef(onReady);
 ready.current=onReady;
 const [,bump]=useState(0);
 const editor=useEditor({
  immediatelyRender:false,
  extensions:[StarterKit.configure({link:{openOnClick:false}}),Markdown],
  content:value,
  contentType:'markdown',
  onUpdate:({editor:current})=>onChange(plain((current as typeof current & MdEditor).getMarkdown())),
  onSelectionUpdate:()=>bump(n=>n+1),
  editorProps:{attributes:{class:'comment-surface','aria-label':label||'Bình luận'}},
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
 if(!editor)return <div className="comment-field"><div className="comment-surface"/></div>;
 const press=(run:()=>void)=>(e:React.MouseEvent)=>{e.preventDefault();run();};
 const link=()=>{const prev=String(editor.getAttributes('link').href||'https://');const url=window.prompt('Địa chỉ liên kết',prev);if(url===null)return;if(!url.trim())editor.chain().focus().unsetLink().run();else editor.chain().focus().extendMarkRange('link').setLink({href:url.trim()}).run();};
 const tools:[string,React.ReactNode,()=>void,boolean][]=[
  ['Đậm',<Bold size={15}/>,()=>editor.chain().focus().toggleBold().run(),editor.isActive('bold')],
  ['Nghiêng',<Italic size={15}/>,()=>editor.chain().focus().toggleItalic().run(),editor.isActive('italic')],
  ['Gạch ngang',<Strikethrough size={15}/>,()=>editor.chain().focus().toggleStrike().run(),editor.isActive('strike')],
  ['Tiêu đề',<Heading2 size={15}/>,()=>editor.chain().focus().toggleHeading({level:2}).run(),editor.isActive('heading',{level:2})],
  ['Code',<Code2 size={15}/>,()=>editor.chain().focus().toggleCode().run(),editor.isActive('code')],
  ['Liên kết',<Link2 size={15}/>,link,editor.isActive('link')],
  ['Danh sách',<List size={15}/>,()=>editor.chain().focus().toggleBulletList().run(),editor.isActive('bulletList')],
  ['Danh sách số',<ListOrdered size={15}/>,()=>editor.chain().focus().toggleOrderedList().run(),editor.isActive('orderedList')],
  ['Trích dẫn',<Quote size={15}/>,()=>editor.chain().focus().toggleBlockquote().run(),editor.isActive('blockquote')],
  ['Việc cần làm',<ListChecks size={15}/>,()=>editor.chain().focus().insertContent('<p>☐ việc cần làm</p>').run(),false],
 ];
 return <div className={editor.isEmpty&&placeholder?'comment-field is-empty':'comment-field'} data-placeholder={placeholder||''}><div className="comment-bar"><div className="comment-tools">{tools.map(([name,icon,run,on])=><Tooltip key={name} content={name}><button type="button" aria-label={name} aria-pressed={on} className={on?'active':''} onMouseDown={press(run)}>{icon}</button></Tooltip>)}</div></div><EditorContent editor={editor}/></div>;
}
