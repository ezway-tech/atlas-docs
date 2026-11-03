'use client';
import React,{useRef} from 'react';
import type {DocKind} from '@/lib/types';
import {looksLikeOpenApi} from '@/lib/spec';
import OpenApiView from './OpenApiView';
import SourceEditor,{type EditorRef} from './SourceEditor';
import SqlView from './SqlView';

export default function DocBody({kind,source,dark,compact}:{kind:DocKind;source:string;dark:boolean;compact?:boolean}){
  const apiRef=useRef<EditorRef|null>(null);
  if(kind==='sql')return <SqlView source={source} dark={dark} diagramOnly={compact}/>;
  if(kind==='json')return <SourceEditor value={source} onChange={()=>{}} apiRef={apiRef} dark={dark} lang="json" readOnly/>;
  if(looksLikeOpenApi(source))return <OpenApiView source={source} dark={dark}/>;
  return <SourceEditor value={source} onChange={()=>{}} apiRef={apiRef} dark={dark} lang="yaml" readOnly/>;
}
