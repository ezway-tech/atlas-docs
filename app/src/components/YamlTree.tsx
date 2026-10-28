'use client';
import React from 'react';
import {readYaml} from '@/lib/spec';

function branch(value:unknown){return Array.isArray(value)||(!!value&&typeof value==='object');}

function paint(value:unknown){
  if(value===null)return {cls:'null',text:'null'};
  if(typeof value==='string')return {cls:'str',text:value===''?'""':value};
  if(typeof value==='number')return {cls:'num',text:String(value)};
  if(typeof value==='boolean')return {cls:'bool',text:value?'true':'false'};
  return {cls:'str',text:String(value)};
}

function Rows({entries}:{entries:[string,unknown][]}){
  return <div className="yaml-rows">{entries.map(([key,item])=>{const v=paint(item);return <div className="yaml-row" key={key}><span className="yaml-key">{key}</span><code className={'yaml-val '+v.cls}>{v.text}</code></div>;})}</div>;
}

function Node({name,value,depth}:{name?:string;value:unknown;depth:number}){
  if(Array.isArray(value))return <details className="yaml-card" open={depth<3}><summary><span className="yaml-key">{name??'danh sách'}</span><span className="yaml-count">{value.length}</span></summary><div className="yaml-children">{value.map((item,index)=><Node key={index} name={'#'+(index+1)} value={item} depth={depth+1}/>)}</div></details>;
  if(value&&typeof value==='object'){
    const entries=Object.entries(value as Record<string,unknown>);
    const scalars=entries.filter((pair):pair is [string,unknown]=>!branch(pair[1]));
    const nested=entries.filter((pair):pair is [string,unknown]=>branch(pair[1]));
    return <details className="yaml-card" open={depth<3}><summary><span className="yaml-key">{name??'tài liệu'}</span><span className="yaml-count">{entries.length}</span></summary>{!!scalars.length&&<Rows entries={scalars}/>}{!!nested.length&&<div className="yaml-children">{nested.map(([key,item])=><Node key={key} name={key} value={item} depth={depth+1}/>)}</div>}</details>;
  }
  const v=paint(value);
  return <div className="yaml-row"><span className="yaml-key">{name}</span><code className={'yaml-val '+v.cls}>{v.text}</code></div>;
}

export default function YamlTree({source}:{source:string}){
  const doc=readYaml(source);
  if(doc.error)return <div className="spec-note"><p>{doc.error}</p><pre className="spec-source">{source}</pre></div>;
  if(doc.value===undefined)return <p>File YAML trống.</p>;
  const root=doc.value&&typeof doc.value==='object'&&!Array.isArray(doc.value)?Object.entries(doc.value as Record<string,unknown>):null;
  return <div className="yaml-doc">{root?root.map(([key,item])=><Node key={key} name={key} value={item} depth={0}/>):<Node value={doc.value} depth={0}/>}<details className="yaml-source"><summary>Nguồn</summary><pre className="spec-source">{source}</pre></details></div>;
}
