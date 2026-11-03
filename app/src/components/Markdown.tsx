'use client';
import {Button as UiButton} from './ui/controls';

import React,{useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';import remarkGfm from 'remark-gfm';import rehypeSlug from 'rehype-slug';
import {MessageCircle,Copy,Check,Expand} from 'lucide-react';
import type {Comment} from '@/lib/types';
import {looksLikeOpenApi} from '@/lib/spec';
import {Tooltip} from './Tooltip';
import ZoomLayer,{type ZoomMode} from './ZoomLayer';
import SourceEditor,{embedHeight,monacoLanguage,type EditorRef} from './SourceEditor';
import OpenApiView from './OpenApiView';
import SqlView from './SqlView';

function hash(t:string){let n=2166136261;for(const c of t){n=Math.imul(n^c.charCodeAt(0),16777619);}return (n>>>0).toString(36);}
export function plain(node:React.ReactNode):string{if(typeof node==='string'||typeof node==='number')return String(node);if(Array.isArray(node))return node.map(plain).join('');if(React.isValidElement<{children?:React.ReactNode}>(node))return plain(node.props.children);return '';}
export function blockId(value:string){return 'block-'+hash(value.slice(0,1000));}

function cssVar(name:string,fallback:string){
  const value=getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value||fallback;
}

function atlasTheme(dark:boolean){
  return {
    darkMode:dark,
    background:cssVar('--bg',dark?'#0f1724':'#f7f9fd'),
    primaryColor:cssVar('--surface',dark?'#172132':'#ffffff'),
    primaryTextColor:cssVar('--ink',dark?'#eaf0fb':'#1e2c44'),
    primaryBorderColor:cssVar('--line',dark?'#293b54':'#e1e7f0'),
    secondaryColor:cssVar('--soft',dark?'#1e2d42':'#f1f4fa'),
    secondaryTextColor:cssVar('--body',dark?'#bdcade':'#455570'),
    secondaryBorderColor:cssVar('--line',dark?'#293b54':'#e1e7f0'),
    tertiaryColor:cssVar('--accentsoft',dark?'#253557':'#ebefff'),
    tertiaryTextColor:cssVar('--ink',dark?'#eaf0fb':'#1e2c44'),
    tertiaryBorderColor:cssVar('--accent',dark?'#9baeff':'#4c68e5'),
    lineColor:cssVar('--muted',dark?'#879ab5':'#8290a6'),
    textColor:cssVar('--body',dark?'#bdcade':'#455570'),
    mainBkg:cssVar('--surface',dark?'#172132':'#ffffff'),
    nodeBorder:cssVar('--line',dark?'#293b54':'#e1e7f0'),
    clusterBkg:cssVar('--soft',dark?'#1e2d42':'#f1f4fa'),
    clusterBorder:cssVar('--line',dark?'#293b54':'#e1e7f0'),
    titleColor:cssVar('--ink',dark?'#eaf0fb':'#1e2c44'),
    edgeLabelBackground:cssVar('--bg',dark?'#0f1724':'#f7f9fd'),
    fontFamily:"Inter,'Segoe UI',system-ui,sans-serif",
    fontSize:'16px'
  };
}

function Diagram({code,onZoom,dark}:{code:string;onZoom:(svg:string,mode:ZoomMode)=>void;dark:boolean}){
  const ref=useRef<HTMLDivElement>(null),[error,setError]=useState('');
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try{
        setError('');
        if(ref.current)ref.current.innerHTML='';
        const mermaid=(await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad:false,
          securityLevel:'strict',
          theme:'base',
          themeVariables:atlasTheme(dark),
          themeCSS:'.node rect,.node polygon,.node circle,.node ellipse{rx:8px;ry:8px}',
          flowchart:{htmlLabels:false,curve:'basis'}
        });
        const result=await mermaid.render('chart-'+crypto.randomUUID().replaceAll('-',''),code);
        if(ref.current&&!cancelled){
          ref.current.innerHTML=result.svg;
          const svg=ref.current.querySelector('svg');
          const vb=svg?.viewBox.baseVal;
          if(svg&&vb?.width&&vb?.height){
            svg.style.width=vb.width+'px';svg.style.height=vb.height+'px';svg.style.maxWidth='none';
          }
        }
      }catch(e){
        if(!cancelled)setError(String(e));
      }
    })();
    return()=>{cancelled=true;};
  },[code,dark]);
  const open=(mode:ZoomMode)=>{const html=ref.current?.innerHTML||'';if(html.includes('<svg'))onZoom(html,mode);};
  return <div className="diagram zoom-preview">{error?<pre>{error}</pre>:<><UiButton type="button" className="diagram-open" aria-label="Phóng to sơ đồ" onClick={()=>open('medium')}><div className="diagram-scroll"><div ref={ref}/></div></UiButton><UiButton className="preview-fullscreen" aria-label="Xem sơ đồ toàn màn hình" onClick={()=>open('fullscreen')}><Expand size={18}/></UiButton></>}</div>;
}

function FenceMonaco({value,language,dark}:{value:string;language:string;dark:boolean}){
  const apiRef=useRef<EditorRef|null>(null);
  return <div className="md-monaco"><SourceEditor value={value} onChange={()=>{}} apiRef={apiRef} dark={dark} language={language} readOnly height={embedHeight(value)}/></div>;
}

function Code({children,language,onZoom,dark}:{children:React.ReactNode;language:string;onZoom:(svg:string,mode:ZoomMode)=>void;dark:boolean}){
  const [copied,setCopied]=useState(false),value=String(children||'').replace(/\n$/,'');
  const lang=language.trim().toLowerCase();
  if(lang==='mermaid')return <Diagram code={value} onZoom={onZoom} dark={dark}/>;
  if(lang==='sql')return <div className="md-embed md-sql"><SqlView source={value} dark={dark} diagramOnly compact/></div>;
  if((lang==='yaml'||lang==='yml')&&looksLikeOpenApi(value))return <div className="md-embed md-openapi"><OpenApiView source={value} dark={dark}/></div>;
  const monacoLang=monacoLanguage(lang);
  if(monacoLang)return <div className="code-block md-code-monaco"><div className="code-heading"><span>{language.toUpperCase()||'TEXT'}</span><Tooltip content={copied?'Đã sao chép':'Sao chép'}><UiButton type="button" aria-label="Sao chép" onClick={async()=>{await navigator.clipboard.writeText(value);setCopied(true);setTimeout(()=>setCopied(false),1100);}}>{copied?<Check size={14}/>:<Copy size={14}/>}</UiButton></Tooltip></div><FenceMonaco value={value} language={monacoLang} dark={dark}/></div>;
  return <div className="code-block"><div className="code-heading"><span>{language.toUpperCase()||'TEXT'}</span><Tooltip content={copied?'Đã sao chép':'Sao chép'}><UiButton type="button" aria-label="Sao chép" onClick={async()=>{await navigator.clipboard.writeText(value);setCopied(true);setTimeout(()=>setCopied(false),1100);}}>{copied?<Check size={14}/>:<Copy size={14}/>}</UiButton></Tooltip></div><pre><code>{value}</code></pre></div>;
}

function highlight(children:React.ReactNode,comments:Comment[],open:(id:string)=>void):React.ReactNode{
  if(typeof children==='string'){
    const matches=comments.filter(c=>c.quote&&children.includes(c.quote));if(!matches.length)return children;
    let cursor=0;const result:React.ReactNode[]=[];while(cursor<children.length){const first=matches.map(c=>({c,i:children.indexOf(c.quote,cursor)})).filter(x=>x.i>=0).sort((a,b)=>a.i-b.i)[0];if(!first){result.push(children.slice(cursor));break;}result.push(children.slice(cursor,first.i));result.push(<Tooltip key={`${cursor}-${first.c.id}`} content="Đi tới bình luận"><mark onClick={()=>open(first.c.id)} className="comment-mark">{first.c.quote}</mark></Tooltip>);cursor=first.i+first.c.quote.length;}return result;
  }
  if(Array.isArray(children))return children.map((x,i)=><React.Fragment key={i}>{highlight(x,comments,open)}</React.Fragment>);
  if(React.isValidElement<{children?:React.ReactNode}>(children))return React.cloneElement(children,{},highlight(children.props.children,comments,open));return children;
}

const SPEC_EXT=/\.(md|ya?ml|sql|json)$/i;

function resolveDocHref(docId:string,href:string){
  let url=String(href||'');
  if(!SPEC_EXT.test(url))return null;
  const parts=docId.split('/');parts.pop();
  const combined=url.startsWith('/')?url.replace(/^\//,''):parts.join('/')+'/'+url;
  const pieces:string[]=[];
  for(const bit of combined.split('/')){if(bit==='..')pieces.pop();else if(bit!=='.')pieces.push(bit);}
  let id=pieces.join('/');
  if(id.endsWith('.md'))id=id.slice(0,-3);
  return '/docs/'+id;
}

export default function Markdown({content,docId,comments=[],activeId,onComment,findBlock,dark=false}:{content:string;docId:string;comments?:Comment[];activeId?:string|null;onComment?:(id:string)=>void;findBlock?:string;dark?:boolean}){
  const [zoom,setZoom]=useState<{image?:{src:string;alt:string};svg?:string;mode:ZoomMode}|null>(null);
  const articleRef=useRef<HTMLElement>(null),openerIndex=useRef(-1);
  const openZoom=(value:NonNullable<typeof zoom>)=>{
    openerIndex.current=Array.from(articleRef.current?.querySelectorAll('button')||[]).indexOf(document.activeElement as HTMLButtonElement);
    setZoom(value);
  };
  const closeZoom=()=>{
    setZoom(null);
    requestAnimationFrame(()=>articleRef.current?.querySelectorAll('button')[openerIndex.current]?.focus());
  };
  const annotate=(tag:'p'|'h1'|'h2'|'h3'|'li'|'blockquote',children:React.ReactNode,rest:Record<string,unknown>)=>{const text=plain(children),id=blockId(text);const found=comments.filter(c=>c.blockId===id||(!!c.quote&&text.includes(c.quote))),active=found.some(c=>c.id===activeId);const result=highlight(children,found,onComment||(()=>{}));const pins=onComment&&found.length>0?<span className="comment-pins">{found.map((c,i)=><Tooltip key={c.id} content={`Bình luận ${i+1}`}><UiButton type="button" onClick={()=>onComment(c.id)} aria-label={`Bình luận ${i+1}`} className={c.id===activeId?'focused':''}><MessageCircle size={13}/>{i+1}</UiButton></Tooltip>)}</span>:null;const props={...rest,'data-block':id,className:`md-block ${found.length?'has-comment':''} ${active?'active-comment':''} ${id===findBlock?'find-current':''}`};switch(tag){case'p':return <p {...props}>{result}{pins}</p>;case'h1':return <h1 {...props}>{result}{pins}</h1>;case'h2':return <h2 {...props}>{result}{pins}</h2>;case'h3':return <h3 {...props}>{result}{pins}</h3>;case'li':return <li {...props}>{result}{pins}</li>;default:return <blockquote {...props}>{result}{pins}</blockquote>;}};
  const components={
    p:({children,...rest}:any)=>annotate('p',children,rest),
    h1:({children,...rest}:any)=>annotate('h1',children,rest),
    h2:({children,...rest}:any)=>annotate('h2',children,rest),
    h3:({children,...rest}:any)=>annotate('h3',children,rest),
    li:({children,...rest}:any)=>annotate('li',children,rest),
    blockquote:({children,...rest}:any)=>annotate('blockquote',children,rest),
    pre:({children}:any)=>{
      const code=children as React.ReactElement<{children:React.ReactNode;className?:string}>;
      return React.isValidElement(code)?<Code language={code.props.className?.replace('language-','')||'text'} onZoom={(svg,mode)=>openZoom({svg,mode})} dark={dark}>{code.props.children}</Code>:<pre>{children}</pre>;
    },
    a:({href,children}:any)=>{
      const docs=resolveDocHref(docId,String(href||''));
      if(docs)return <Link href={docs}>{children}</Link>;
      const url=String(href||'');
      return <a href={url} target={url.startsWith('http')?'_blank':undefined} rel="noreferrer">{children}</a>;
    },
    img:({src,alt}:any)=><span className="zoom-preview image-preview"><UiButton type="button" className="zoom-hit" aria-label={alt?`Phóng to ảnh: ${alt}`:"Phóng to ảnh"} onClick={()=>openZoom({mode:'medium',image:{src:String(src||''),alt:String(alt||'Ảnh minh họa')}})}><img className="md-image" src={src} alt={alt||'Ảnh minh họa'}/></UiButton><UiButton className="preview-fullscreen" aria-label={alt?`Xem ảnh toàn màn hình: ${alt}`:'Xem ảnh toàn màn hình'} onClick={()=>openZoom({mode:'fullscreen',image:{src:String(src||''),alt:String(alt||'Ảnh minh họa')}})}><Expand size={18}/></UiButton></span>,
    code:({children,className,...rest}:any)=><code className={className} {...rest}>{children}</code>
  };
  const wiki=content.split('\n').map(line=>line.includes('```')?line:line.replace(/\[\[([\w/-]+)\]\]/g,'[$1](/docs/$1)')).join('\n');
  return <><article ref={articleRef} className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={components}>{wiki}</ReactMarkdown></article>{zoom&&<ZoomLayer initialMode={zoom.mode} image={zoom.image} svg={zoom.svg} onClose={closeZoom}/>}</>;
}
