'use client';
import {extractHeadings,headingEdit} from '@/lib/headings';
import React,{useEffect,useRef} from 'react';
import dynamic from 'next/dynamic';
import type {OnMount} from '@monaco-editor/react';
import type {editor as MonacoEditor} from 'monaco-editor';
import {useLocale} from './LocaleProvider';

const Monaco=dynamic(()=>import('@monaco-editor/react'),{ssr:false});

export type Format='paragraph'|'h1'|'h2'|'h3'|'h4'|'h5'|'h6'|'bold'|'italic'|'link'|'list'|'number'|'task'|'quote'|'code'|'table'|'mermaid'|'divider';
export type SourceLang='markdown'|'yaml'|'sql'|'json';
export type FormatSamples={text:string;listItem:string;task:string;col1:string;col2:string};
const DEFAULT_SAMPLES:FormatSamples={text:'Text',listItem:'Item 1',task:'To do',col1:'Column 1',col2:'Column 2'};
export function formatting(kind:Format,text='',samples:FormatSamples=DEFAULT_SAMPLES){const body=text||samples.text;switch(kind){case'paragraph':return body;case'h1':return '# '+body;case'h4':return '#### '+body;case'h5':return '##### '+body;case'h6':return '###### '+body;case'h2':return '## '+body;case'h3':return '### '+body;case'bold':return `**${body}**`;case'italic':return `*${body}*`;case'link':return `[${body}](https://example.com)`;case'list':return '- '+(text||samples.listItem);case'number':return '1. '+(text||samples.listItem);case'task':return '- [ ] '+(text||samples.task);case'quote':return '> '+body;case'code':return '\n```bash\n'+(text||'echo hello')+'\n```\n';case'table':return `\n| ${samples.col1} | ${samples.col2} |\n| --- | --- |\n| A | B |\n`;case'mermaid':return '\n```mermaid\nflowchart LR\n A --> B\n```\n';case'divider':return '\n---\n';}}
export type EditorRef={insert:(value:string)=>void;format:(value:Format)=>void;jumpToLine:(line:number)=>void};
export type ImagePaste=(file:File,insert:(markdown:string)=>void)=>void;

function clipboardImage(data:DataTransfer|null){
  if(!data)return null;
  const file=[...data.files].find(item=>item.type.startsWith('image/'));
  if(file)return file;
  return [...data.items].find(item=>item.kind==='file'&&item.type.startsWith('image/'))?.getAsFile()??null;
}

const langMap:Record<SourceLang,string>={markdown:'markdown',yaml:'yaml',sql:'sql',json:'json'};

export function monacoLanguage(fence:string):string|null{
  const key=fence.trim().toLowerCase();
  if(!key||key==='text'||key==='plain'||key==='plaintext')return null;
  const aliases:Record<string,string>={
    yml:'yaml',yaml:'yaml',json:'json',sql:'sql',md:'markdown',markdown:'markdown',
    js:'javascript',javascript:'javascript',ts:'typescript',typescript:'typescript',
    bash:'shell',sh:'shell',shell:'shell',zsh:'shell',
    py:'python',python:'python',html:'html',css:'css',xml:'xml',
    graphql:'graphql',gql:'graphql',dockerfile:'dockerfile'
  };
  return aliases[key]??(/^[a-z0-9_+#-]+$/i.test(key)?key:null);
}

function replaceSelection(ed:MonacoEditor.IStandaloneCodeEditor,text:string){
  const model=ed.getModel();
  if(!model)return;
  const sel=ed.getSelection()??model.getFullModelRange();
  const start=model.getOffsetAt({lineNumber:sel.startLineNumber,column:sel.startColumn});
  ed.executeEdits('atlas',[ {range:sel,text,forceMoveMarkers:true} ]);
  ed.setPosition(model.getPositionAt(start+text.length));
  ed.focus();
}

export function embedHeight(source:string,max=360,min=120,line=18){
  const lines=Math.max(1,source.replace(/\n$/,'').split('\n').length);
  return Math.min(max,Math.max(min,lines*line+24))+'px';
}

export default function SourceEditor({value,onChange,apiRef,dark,lang='markdown',language,readOnly=false,height='68vh',onImagePaste,onHeadingChange}:{value:string;onChange:(v:string)=>void;apiRef:React.MutableRefObject<EditorRef|null>;dark:boolean;lang?:SourceLang;language?:string;readOnly?:boolean;height?:string;onImagePaste?:ImagePaste;onHeadingChange?:(level:number)=>void}){
  const {t}=useLocale();
  const samplesRef=useRef<FormatSamples>(DEFAULT_SAMPLES);
  samplesRef.current={text:t('editor.insertSample.text'),listItem:t('editor.insertSample.listItem'),task:t('editor.insertSample.task'),col1:t('editor.insertSample.col1'),col2:t('editor.insertSample.col2')};
  const headingChangeRef=useRef(onHeadingChange);headingChangeRef.current=onHeadingChange;
  const editor=useRef<MonacoEditor.IStandaloneCodeEditor|null>(null);
  const pasteRef=useRef(onImagePaste);
  const valueRef=useRef(value);
  const onChangeRef=useRef(onChange);
  const readOnlyRef=useRef(readOnly);
  pasteRef.current=onImagePaste;
  valueRef.current=value;
  onChangeRef.current=onChange;
  readOnlyRef.current=readOnly;
  const monacoLang=language||langMap[lang];
  const wrap=monacoLang==='markdown';

  useEffect(()=>{
    apiRef.current={
      jumpToLine:line=>{const ed=editor.current;if(!ed)return;ed.setPosition({lineNumber:line,column:1});ed.revealLineInCenter(line);ed.focus();},
      insert:text=>{
        if(readOnlyRef.current)return;
        const ed=editor.current;
        if(!ed){onChangeRef.current(valueRef.current+text);return;}
        replaceSelection(ed,text);
      },
      format:name=>{
        if(readOnlyRef.current)return;
        const ed=editor.current;
        const samples=samplesRef.current;
        if(!ed){onChangeRef.current(valueRef.current+'\n'+formatting(name,'',samples));return;}
        const model=ed.getModel();
        const sel=ed.getSelection();
        if(model&&sel&&(name==='paragraph'||/^h[1-6]$/.test(name))){
          const end=sel.endColumn===1&&sel.endLineNumber>sel.startLineNumber?sel.endLineNumber-1:sel.endLineNumber;
          const change=headingEdit(model.getValue(),sel.startLineNumber,end,name==='paragraph'?0:Number(name[1]));
          const range={startLineNumber:change.first,startColumn:1,endLineNumber:change.last,endColumn:model.getLineMaxColumn(change.last)};
          if(model.getValueInRange(range)===change.text){ed.focus();return;}
          ed.pushUndoStop();ed.executeEdits('atlas-heading',[{range,text:change.text,forceMoveMarkers:true}]);ed.pushUndoStop();
          const inserted=change.text.split('\n');ed.setPosition({lineNumber:change.first+inserted.length-1,column:inserted[inserted.length-1].length+1});ed.focus();return;
        }
        const picked=model&&sel?model.getValueInRange(sel):'';
        replaceSelection(ed,formatting(name,picked,samples));
      }
    };
  },[apiRef]);

  const onMount:OnMount=(ed)=>{
    editor.current=ed;
    if(monacoLang==='markdown'&&headingChangeRef.current){
      let headings=extractHeadings(ed.getValue());
      const updateHeading=()=>{const line=ed.getPosition()?.lineNumber||1;headingChangeRef.current?.(headings.find(h=>h.line<=line&&h.endLine>=line)?.level||0);};
      const cursor=ed.onDidChangeCursorPosition(updateHeading),content=ed.onDidChangeModelContent(()=>{headings=extractHeadings(ed.getValue());updateHeading();});updateHeading();
      ed.onDidDispose(()=>{cursor.dispose();content.dispose();});
    }
    if(monacoLang!=='markdown'||readOnly)return;
    const node=ed.getDomNode();
    if(!node)return;
    const onPaste=(event:ClipboardEvent)=>{
      const file=clipboardImage(event.clipboardData),cb=pasteRef.current;
      if(!file||!cb)return;
      event.preventDefault();
      event.stopPropagation();
      const at=ed.getPosition();
      cb(file,text=>{
        const model=ed.getModel();
        if(!model||!at){onChangeRef.current(valueRef.current+text);return;}
        const range={startLineNumber:at.lineNumber,startColumn:at.column,endLineNumber:at.lineNumber,endColumn:at.column};
        const start=model.getOffsetAt(at);
        ed.executeEdits('atlas',[ {range,text,forceMoveMarkers:true} ]);
        ed.setPosition(model.getPositionAt(start+text.length));
        ed.focus();
      });
    };
    node.addEventListener('paste',onPaste,true);
    ed.onDidDispose(()=>node.removeEventListener('paste',onPaste,true));
  };

  return <Monaco
    value={value}
    language={monacoLang}
    theme={dark?'vs-dark':'light'}
    height={height}
    onChange={readOnly?undefined:v=>onChange(v??'')}
    onMount={onMount}
    options={{
      readOnly,
      automaticLayout:true,
      fontSize:14,
      fontFamily:'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
      minimap:{enabled:false},
      scrollBeyondLastLine:false,
      wordWrap:wrap?'on':'off',
      lineNumbers:'on',
      folding:true,
      renderLineHighlight:readOnly?'none':'line',
      padding:{top:12,bottom:12},
      tabSize:2,
      stickyScroll:{enabled:false},
      domReadOnly:readOnly,
      overviewRulerLanes:0
    }}
  />;
}
