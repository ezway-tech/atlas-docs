'use client';
import React,{useEffect,useMemo,useState} from 'react';
import {Background,Controls,ReactFlow,type Edge,type Node} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import '@xyflow/react/dist/style.css';
import {readSqlSchema,type SqlSchema} from '@/lib/sql-schema';
import SourceEditor,{type EditorRef} from './SourceEditor';

function TableNode({data}:{data:{name:string;columns:{name:string;type:string;pk:boolean}[]}}){
  return <div className="sql-table"><strong>{data.name}</strong><ul>{data.columns.map(column=><li key={column.name}><span>{column.pk?'PK':''}</span><b>{column.name}</b><em>{column.type}</em></li>)}{!data.columns.length&&<li>Bảng được tham chiếu</li>}</ul></div>;
}
const nodeTypes={table:TableNode};

function layout(schema:SqlSchema){
  const graph=new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(()=>({}));
  graph.setGraph({rankdir:'LR',nodesep:48,ranksep:80});
  const size=new Map<string,{width:number;height:number}>();
  for(const table of schema.tables){
    const width=240,height=42+Math.max(1,table.columns.length)*28;
    size.set(table.name,{width,height});
    graph.setNode(table.name,{width,height});
  }
  for(const edge of schema.edges)if(size.has(edge.from)&&size.has(edge.to))graph.setEdge(edge.from,edge.to);
  dagre.layout(graph);
  const nodes:Node[]=schema.tables.map(table=>{
    const box=size.get(table.name)!;
    const pos=graph.node(table.name);
    return {id:table.name,type:'table',position:{x:(pos?.x||0)-box.width/2,y:(pos?.y||0)-box.height/2},data:{name:table.name,columns:table.columns},style:{padding:0,border:'none',background:'transparent',width:box.width},width:box.width,height:box.height};
  });
  const edges:Edge[]=schema.edges.filter(edge=>size.has(edge.from)&&size.has(edge.to)).map(edge=>({id:`${edge.from}.${edge.fromColumn}-${edge.to}.${edge.toColumn}`,source:edge.from,target:edge.to,label:edge.fromColumn+(edge.toColumn?` → ${edge.toColumn}`:''),animated:false}));
  return {nodes,edges};
}

export default function SqlView({source,dark,diagramOnly}:{source:string;dark:boolean;diagramOnly?:boolean}){
  const [schema,setSchema]=useState<SqlSchema|null>(null),[tab,setTab]=useState<'diagram'|'source'>('diagram');
  const apiRef=React.useRef<EditorRef|null>(null);
  useEffect(()=>{let cancel=false;const timer=setTimeout(()=>{void readSqlSchema(source).then(next=>{if(!cancel)setSchema(next);});},250);return()=>{cancel=true;clearTimeout(timer);};},[source]);
  const laid=useMemo(()=>schema&&schema.tables.length?layout(schema):null,[schema]);
  if(!schema)return <div className="empty">Đang đọc SQL...</div>;
  if(!schema.tables.length)return <div className="spec-note"><p>File này không có lệnh CREATE TABLE, nên không vẽ sơ đồ.</p>{schema.error&&<p>{schema.error}</p>}{!diagramOnly&&<SourceEditor value={source} onChange={()=>{}} apiRef={apiRef} dark={dark} lang="sql" readOnly/>}</div>;
  const canvas=laid?<div className="sql-canvas"><ReactFlow nodes={laid.nodes} edges={laid.edges} nodeTypes={nodeTypes} fitView minZoom={0.2} maxZoom={2} colorMode={dark?'dark':'light'} proOptions={{hideAttribution:false}}><Background/><Controls/></ReactFlow></div>:null;
  if(diagramOnly)return canvas;
  return <div><div className="mode-tabs sql-tabs"><button type="button" className={tab==='diagram'?'active':''} onClick={()=>setTab('diagram')}>Sơ đồ</button><button type="button" className={tab==='source'?'active':''} onClick={()=>setTab('source')}>Nguồn</button></div>{tab==='diagram'?canvas:<SourceEditor value={source} onChange={()=>{}} apiRef={apiRef} dark={dark} lang="sql" readOnly/>}</div>;
}
