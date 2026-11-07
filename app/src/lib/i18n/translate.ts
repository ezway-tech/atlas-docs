import {DEFAULT_LOCALE,type Locale} from './locales';
import {catalogs} from './messages';

export type Messages=Record<string,string>;
export type TranslateParams=Record<string,string|number|undefined|null>;

function lookup(messages:Messages,key:string):string|undefined{
 return Object.prototype.hasOwnProperty.call(messages,key)?messages[key]:undefined;
}

export function interpolate(template:string,params?:TranslateParams):string{
 if(!params)return template;
 return template.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g,(_,a,b)=>{
  const name=a||b;
  const value=params[name];
  return value==null?'':String(value);
 });
}

export function translate(locale:Locale,key:string,params?:TranslateParams):string{
 const primary=lookup(catalogs[locale],key);
 if(primary!=null)return interpolate(primary,params);
 if(locale!==DEFAULT_LOCALE){
  const fallback=lookup(catalogs[DEFAULT_LOCALE],key);
  if(fallback!=null)return interpolate(fallback,params);
 }
 return interpolate(key,params);
}

export function getMessages(locale:Locale):Messages{
 return catalogs[locale]||catalogs[DEFAULT_LOCALE];
}
