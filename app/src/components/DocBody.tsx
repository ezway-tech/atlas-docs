'use client';
import React from 'react';
import type {DocKind} from '@/lib/types';
import {looksLikeOpenApi} from '@/lib/spec';
import OpenApiView from './OpenApiView';
import YamlTree from './YamlTree';
import SqlView from './SqlView';

export default function DocBody({kind,source,dark,compact}:{kind:DocKind;source:string;dark:boolean;compact?:boolean}){
  if(kind==='sql')return <SqlView source={source} dark={dark} diagramOnly={compact}/>;
  if(looksLikeOpenApi(source))return <OpenApiView source={source} dark={dark}/>;
  return <YamlTree source={source}/>;
}
