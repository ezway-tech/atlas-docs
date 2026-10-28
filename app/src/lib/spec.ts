import {parse} from 'yaml';

export function looksLikeOpenApi(source:string){return /(^|\n)\s*(openapi|swagger)\s*:/.test(source);}

export function readYaml(source:string):{value?:unknown;error?:string}{
  try{return {value:parse(source)};}catch(e){return {error:e instanceof Error?e.message:'YAML không hợp lệ'};}
}
