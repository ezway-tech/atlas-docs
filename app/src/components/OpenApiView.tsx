'use client';
import React, {useMemo} from 'react';
import dynamic from 'next/dynamic';
import {parse} from 'yaml';
import 'swagger-ui-react/swagger-ui.css';
import {modelCollapsePlugin} from './ModelCollapse';

const SwaggerUI = dynamic(() => import('swagger-ui-react'), {ssr: false, loading: () => <p>Đang mở Swagger…</p>});
const plugins=[modelCollapsePlugin];

export default function OpenApiView({source,dark}:{source:string;dark?:boolean}){
  const parsed=useMemo(():{spec:Record<string,unknown>}|{error:string}=>{
    try{
      const value=parse(source);
      if(!value||typeof value!=='object'||Array.isArray(value))return {error:'YAML không phải một tài liệu'};
      return {spec:value as Record<string,unknown>};
    }catch(e){
      return {error:e instanceof Error?e.message:'YAML không hợp lệ'};
    }
  },[source]);
  if('error' in parsed)return <div className="spec-note"><p>{parsed.error}</p><pre className="spec-source">{source}</pre></div>;
  return <div className={dark?'openapi-view dark':'openapi-view'}><SwaggerUI spec={parsed.spec} docExpansion="list" defaultModelsExpandDepth={1} deepLinking={false} tryItOutEnabled plugins={plugins}/></div>;
}
