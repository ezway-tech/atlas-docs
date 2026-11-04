'use client';
import {Button as UiButton} from './ui/controls';

import React,{useEffect,useRef,useState} from 'react';
import {EditorContent,useEditor} from '@tiptap/react';
import {closeHistory} from '@tiptap/pm/history';
import StarterKit from '@tiptap/starter-kit';import {Markdown} from '@tiptap/markdown';import Image from '@tiptap/extension-image';
import {Bold,Italic,Strikethrough,List,ListOrdered,Quote,Code,Code2,Link2,Minus,Undo2,Redo2,ImagePlus} from 'lucide-react';
import HeadingSelect from './HeadingSelect';
import {headingSelector} from '@/lib/headings';
import {LinkDialog} from './ui/link-dialog';
import {Tooltip} from './Tooltip';
import {CommandTip} from './Keys';
import type {ImagePaste} from './SourceEditor';
function clipboardImage(data:DataTransfer|null){if(!data)return null;const file=[...data.files].find(item=>item.type.startsWith('image/'));if(file)return file;return [...data.items].find(item=>item.kind==='file'&&item.type.startsWith('image/'))?.getAsFile()??null;}
export type VisualEditorRef={jumpToHeading:(index:number)=>void};
export default function VisualEditor({content,onChange,onImage,onImagePaste,apiRef}:{content:string;onChange:(v:string)=>void;onImage:()=>void;onImagePaste?:ImagePaste;apiRef?:React.MutableRefObject<VisualEditorRef|null>}){
 const pasteRef=useRef(onImagePaste),editorHold=useRef<ReturnType<typeof useEditor>>(null);pasteRef.current=onImagePaste;
 const editor=useEditor({immediatelyRender:false,shouldRerenderOnTransaction:true,extensions:[StarterKit.configure({link:{openOnClick:false}}),Markdown,Image],content,contentType:'markdown',onCreate:({editor:created})=>{editorHold.current=created;},onUpdate:({editor:e})=>onChange((e as typeof e & {getMarkdown:()=>string}).getMarkdown()),editorProps:{attributes:{class:'tiptap-content'},handlePaste(view,event){const file=clipboardImage(event.clipboardData);if(!file||!pasteRef.current)return false;const pos=view.state.selection.from;pasteRef.current(file,markdown=>{const match=markdown.match(/!\[([^\]]*)\]\(([^)]+)\)/),current=editorHold.current;if(!current||!match)return;current.chain().focus().setTextSelection(pos).setImage({alt:match[1],src:match[2]}).run();});return true;}}});
 useEffect(()=>{if(editor&&(editor as typeof editor & {getMarkdown:()=>string}).getMarkdown()!==content)editor.commands.setContent(content,{contentType:'markdown',emitUpdate:false});},[editor,content]);
 useEffect(()=>{
  if(!apiRef||!editor)return;
  apiRef.current={jumpToHeading:index=>{
   let count=0,target:number|undefined;
   editor.state.doc.descendants((node,pos)=>{if(node.type.name==='heading'&&count++===index)target=pos+1;});
   if(target===undefined)return;
   editor.chain().focus().setTextSelection(target).run();
   editor.view.dom.querySelectorAll<HTMLElement>(headingSelector)[index]?.scrollIntoView({behavior:'smooth',block:'center'});
  }};
  return()=>{apiRef.current=null;};
 },[editor,apiRef]);
 const [linkOpen,setLinkOpen]=useState(false);
 if(!editor)return <div className="empty">Đang tải Visual Editor...</div>;
 const actions=[{name:'Đậm',icon:<Bold/>,run:()=>editor.chain().focus().toggleBold().run()},{name:'Nghiêng',icon:<Italic/>,run:()=>editor.chain().focus().toggleItalic().run()},{name:'Gạch ngang',icon:<Strikethrough/>,run:()=>editor.chain().focus().toggleStrike().run()},{name:'Danh sách',icon:<List/>,run:()=>editor.chain().focus().toggleBulletList().run()},{name:'Danh sách số',icon:<ListOrdered/>,run:()=>editor.chain().focus().toggleOrderedList().run()},{name:'Trích dẫn',icon:<Quote/>,run:()=>editor.chain().focus().toggleBlockquote().run()},{name:'Code trong dòng',icon:<Code/>,run:()=>editor.chain().focus().toggleCode().run()},{name:'Khối code',icon:<Code2/>,run:()=>editor.chain().focus().toggleCodeBlock().run()},{name:'Liên kết',icon:<Link2/>,run:()=>{setLinkOpen(true);}},{name:'Đường kẻ',icon:<Minus/>,run:()=>editor.chain().focus().setHorizontalRule().run()},{name:'Hoàn tác',icon:<Undo2/>,run:()=>editor.chain().focus().undo().run()},{name:'Làm lại',icon:<Redo2/>,run:()=>editor.chain().focus().redo().run()}];
 return <div className="visual-editor"><div className="format-bar"><HeadingSelect level={editor.isActive('heading')?Number(editor.getAttributes('heading').level):0} onChange={level=>{editor.view.dispatch(closeHistory(editor.state.tr));if(level)editor.chain().focus().setHeading({level:level as 1|2|3|4|5|6}).run();else editor.chain().focus().setParagraph().run();editor.view.dispatch(closeHistory(editor.state.tr));}}/>{actions.map(a=><Tooltip key={a.name} content={a.name}><UiButton type="button" aria-label={a.name} onMouseDown={e=>e.preventDefault()} onClick={a.run}>{a.icon}</UiButton></Tooltip>)}<CommandTip id="insert.asset" label="Chèn tài nguyên"><UiButton type="button" aria-label="Chèn tài nguyên" onClick={onImage}><ImagePlus size={17}/></UiButton></CommandTip></div><EditorContent editor={editor}/>{linkOpen&&<LinkDialog editor={editor} onClose={()=>setLinkOpen(false)}/>}</div>;
}
