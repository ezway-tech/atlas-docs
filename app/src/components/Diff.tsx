'use client';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {Button as UiButton} from './ui/controls';
import {buildHistoryDiff,type Cell,type Row,type Segment} from '@/lib/history-diff';

export type DiffMode='split'|'unified';

function textOf(cell:Cell){
 return cell.spans.map((span,index)=><span key={index} className={span.mark?'diff-mark':undefined}>{span.text}</span>);
}
function Line({cell}:{cell:Cell}){
 const sign=cell.kind==='del'?'−':cell.kind==='add'?'+':' ';
 return <div className={'diff-line diff-'+cell.kind}><span className="diff-no">{cell.line??''}</span><span className="diff-sign">{sign}</span><span className="diff-text">{textOf(cell)}</span></div>;
}
function unifiedLines(rows:Row[]){
 const out:React.ReactNode[]=[];
 rows.forEach((row,index)=>{
  if(row.left.kind==='same')out.push(<Line key={index+'s'} cell={row.right}/>);
  else{
   if(row.left.kind==='del')out.push(<Line key={index+'d'} cell={row.left}/>);
   if(row.right.kind==='add')out.push(<Line key={index+'a'} cell={row.right}/>);
  }
 });
 return out;
}
function SplitRows({rows}:{rows:Row[]}){
 return rows.map((row,index)=><div className="diff-split-row" key={index}><div className={'diff-cell diff-'+row.left.kind}>{row.left.kind==='empty'?null:<><span className="diff-no">{row.left.line??''}</span><span className="diff-sign">{row.left.kind==='del'?'−':' '}</span><span className="diff-text">{textOf(row.left)}</span></>}</div><div className={'diff-cell diff-'+row.right.kind}>{row.right.kind==='empty'?null:<><span className="diff-no">{row.right.line??''}</span><span className="diff-sign">{row.right.kind==='add'?'+':' '}</span><span className="diff-text">{textOf(row.right)}</span></>}</div></div>);
}
function scrollToHunk(root:HTMLDivElement|null,index:number){
 const el=root?.querySelector<HTMLElement>(`[data-hunk="${index}"]`);
 if(!root||!el)return;
 const head=root.querySelector('.diff-split-head');
 const headH=head?.getBoundingClientRect().height??0;
 const top=el.getBoundingClientRect().top-root.getBoundingClientRect().top+root.scrollTop-headH-4;
 root.scrollTo({top:Math.max(0,top)});
}
function Block({segment,mode,open,onToggle}:{segment:Segment;mode:DiffMode;open:boolean;onToggle:()=>void}){
 if(segment.type==='skip'){
  if(!open)return <UiButton type="button" className="diff-skip" onClick={onToggle}>⋯ {segment.count} dòng không đổi — mở rộng</UiButton>;
  return <div className="diff-expanded">{mode==='split'?<SplitRows rows={segment.rows}/>:<div className="diff-unified">{unifiedLines(segment.rows)}</div>}<UiButton type="button" className="diff-skip" onClick={onToggle}>Thu gọn {segment.count} dòng không đổi</UiButton></div>;
 }
 return <div className="diff-hunk" data-hunk={segment.index}>{mode==='split'?<SplitRows rows={segment.rows}/>:<div className="diff-unified">{unifiedLines(segment.rows)}</div>}</div>;
}

export default function Diff({before,after,mode,canSplit,onMode,onShowContent}:{before:string;after:string;mode:DiffMode;canSplit:boolean;onMode:(mode:DiffMode)=>void;onShowContent?:()=>void}){
 const result=useMemo(()=>buildHistoryDiff(before,after),[before,after]);
 const [hunk,setHunk]=useState(0);
 const [open,setOpen]=useState<Record<string,boolean>>({});
 const scroller=useRef<HTMLDivElement>(null);
 const hunkRef=useRef(0);
 const modeScroll=useRef(false);
 hunkRef.current=hunk;
 useEffect(()=>{setHunk(0);setOpen({});if(scroller.current)scroller.current.scrollTop=0;},[before,after]);
 useEffect(()=>{
  if(!modeScroll.current){modeScroll.current=true;return;}
  scrollToHunk(scroller.current,hunkRef.current);
 },[mode]);
 function go(next:number){
  const index=Math.max(0,Math.min(result.hunks-1,next));
  setHunk(index);
  scrollToHunk(scroller.current,index);
 }
 if(result.identical)return <div className="history-empty">Nội dung giống bản hiện tại</div>;
 if(result.tooLarge)return <div className="history-empty">Tài liệu quá dài để tính diff từng dòng.<div className="history-diff-actions">{onShowContent&&<UiButton className="btn ghost" type="button" onClick={onShowContent}>Xem nội dung bản này</UiButton>}</div></div>;
 return <div className="history-diff">
  <div className="history-diff-bar">
   {result.hunks>1&&<span className="history-diff-nav">
    <UiButton type="button" aria-label="Vùng trước" disabled={hunk<=0} onClick={()=>go(hunk-1)}><ChevronLeft size={16}/></UiButton>
    <span className="history-diff-pos">Vùng {hunk+1}/{result.hunks}</span>
    <UiButton type="button" aria-label="Vùng sau" disabled={hunk>=result.hunks-1} onClick={()=>go(hunk+1)}><ChevronRight size={16}/></UiButton>
   </span>}
   <span className="history-mode">
    <UiButton type="button" className={mode==='split'?'active':''} aria-pressed={mode==='split'} disabled={!canSplit} onClick={()=>onMode('split')}>Song song</UiButton>
    <UiButton type="button" className={mode==='unified'?'active':''} aria-pressed={mode==='unified'} onClick={()=>onMode('unified')}>Gộp</UiButton>
   </span>
  </div>
  <div className="history-diff-view" ref={scroller}>
   {mode==='split'&&<div className="diff-split-row diff-split-head"><div>Bản đã chọn</div><div>Hiện tại</div></div>}
   {result.segments.map(segment=><Block key={segment.type==='skip'?segment.key:'h'+segment.index} segment={segment} mode={mode} open={segment.type==='skip'?!!open[segment.key]:false} onToggle={()=>segment.type==='skip'&&setOpen(state=>({...state,[segment.key]:!state[segment.key]}))}/>)}
  </div>
 </div>;
}
