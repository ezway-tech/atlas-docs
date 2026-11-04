'use client';
import {useEffect,useMemo,useState} from 'react';
import {ChevronDown,ChevronRight,ChevronsDownUp,ChevronsUpDown,Settings} from 'lucide-react';
import {headingTree,type Heading,type HeadingNode} from '@/lib/headings';
import {Select} from './ui/select';
import {Button,Popover} from './ui/controls';
import {Tooltip} from './Tooltip';

const RANGE_KEY='atlas-toc-range',COLLAPSED_KEY='atlas-toc-collapsed';
export function useTableOfContents(headings:Heading[],docId:string){
 const [range,setRange]=useState<[number,number]>([1,3]);
 const [collapsedByDoc,setCollapsedByDoc]=useState<Record<string,string[]>>({});
 useEffect(()=>{
  try{const saved=JSON.parse(localStorage.getItem(RANGE_KEY)||'null');if(Array.isArray(saved)&&saved.length===2&&saved.every(n=>Number.isInteger(n)&&n>=1&&n<=6)&&saved[0]<=saved[1])setRange(saved as [number,number]);}catch{}
  try{const saved=JSON.parse(sessionStorage.getItem(COLLAPSED_KEY)||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))setCollapsedByDoc(Object.fromEntries(Object.entries(saved).filter(([,ids])=>Array.isArray(ids)&&ids.every(id=>typeof id==='string')) as [string,string[]][]));}catch{}
 },[]);
 const collapsed=new Set(collapsedByDoc[docId]||[]);
 const nodes=useMemo(()=>headingTree(headings,...range),[headings,range]);
 const branches=useMemo(()=>{const ids:string[]=[];function walk(nodes:HeadingNode[]){for(const node of nodes){if(node.children.length)ids.push(node.id);walk(node.children);}}walk(headingTree(headings));return ids;},[headings]);
 function changeRange(next:[number,number]){setRange(next);try{localStorage.setItem(RANGE_KEY,JSON.stringify(next));}catch{}}
 function changeCollapsed(ids:string[]){setCollapsedByDoc(previous=>{const next={...previous,[docId]:ids};try{sessionStorage.setItem(COLLAPSED_KEY,JSON.stringify(next));}catch{}return next;});}
 return {range,collapsed,nodes,branches,changeRange,changeCollapsed};
}
type TocState=ReturnType<typeof useTableOfContents>;
export function TableOfContentsActions({state}:{state:TocState}){
 const {range,collapsed,branches,changeRange,changeCollapsed}=state;
 return <div className="toc-actions">
 <Tooltip content="Thu gọn tất cả"><Button aria-label="Thu gọn tất cả" disabled={!branches.length} onClick={()=>changeCollapsed(branches)}><ChevronsDownUp size={14}/></Button></Tooltip>
 <Tooltip content="Mở tất cả"><Button aria-label="Mở tất cả" disabled={!collapsed.size} onClick={()=>changeCollapsed([])}><ChevronsUpDown size={14}/></Button></Tooltip>
 <Popover label="Cấu hình mục lục" trigger={<Button aria-label="Cấu hình mục lục" title="Cấu hình mục lục"><Settings size={14}/></Button>}><div className="toc-filters">
  <label>Từ cấp<Select label="Từ cấp" value={String(range[0])} onValueChange={v=>changeRange([Number(v),range[1]])} options={[1,2,3,4,5,6].filter(n=>n<=range[1]).map(n=>({value:String(n),label:`H${n}`}))}/></label>
  <label>Đến cấp<Select label="Đến cấp" value={String(range[1])} onValueChange={v=>changeRange([range[0],Number(v)])} options={[1,2,3,4,5,6].filter(n=>n>=range[0]).map(n=>({value:String(n),label:`H${n}`}))}/></label>
 </div></Popover></div>;
}
export default function TableOfContents({headings,state,activeId,onJump}:{headings:Heading[];state:TocState;activeId:string;onJump:(heading:Heading,index:number)=>void}){
 const {nodes,collapsed,changeCollapsed}=state;
 function render(nodes:HeadingNode[]):React.ReactNode{return <ul>{nodes.map(node=>{
  const hasChildren=node.children.length>0,closed=collapsed.has(node.id);
  return <li key={node.id}><div className="toc-row">
   {hasChildren?<Button className="toc-toggle" aria-label={`${closed?'Mở rộng':'Thu gọn'} ${node.title}`} aria-expanded={!closed} onClick={()=>changeCollapsed(closed?[...collapsed].filter(id=>id!==node.id):[...collapsed,node.id])}>{closed?<ChevronRight size={14}/>:<ChevronDown size={14}/>}</Button>:<span className="toc-spacer"/>}
   <a href={'#'+node.id} aria-current={activeId===node.id?'location':undefined} className={activeId===node.id?'active':''} onClick={event=>{event.preventDefault();onJump(node,headings.findIndex(h=>h.id===node.id));}}>{node.title}</a>
  </div>{hasChildren&&!closed&&render(node.children)}</li>;
 })}</ul>;}
 return <div className="toc-panel">
 {nodes.length?<nav className="toc-tree" aria-label="Mục lục tài liệu">{render(nodes)}</nav>:<p className="toc-empty">{headings.length?'Không có tiêu đề trong khoảng đã chọn.':'Bài chưa có tiêu đề.'}</p>}</div>;
}
