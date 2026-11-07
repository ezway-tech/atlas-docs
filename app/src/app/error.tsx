'use client';
import {Button} from '@/components/ui/controls';
import {useEffect,useMemo} from 'react';
import {DEFAULT_LOCALE,LOCALE_COOKIE,type Locale,isLocale} from '@/lib/i18n/locales';
import {translate} from '@/lib/i18n/translate';

function readCookieLocale():Locale{
 if(typeof document==='undefined')return DEFAULT_LOCALE;
 const match=document.cookie.match(new RegExp('(?:^|;\\s*)'+LOCALE_COOKIE+'=([^;]+)'));
 const value=match?.[1]?decodeURIComponent(match[1]):'';
 return isLocale(value)?value:DEFAULT_LOCALE;
}

export default function ErrorPage({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
 const locale=useMemo(()=>readCookieLocale(),[]);
 const t=(key:string,params?:Record<string,string|number>)=>translate(locale,key,params);
 useEffect(()=>{console.error('[Atlas Docs]',error);},[error]);
 return <main style={{padding:40,maxWidth:700,margin:'10vh auto',fontFamily:'system-ui'}}>
  <h1>{t('errors.page.title')}</h1>
  <pre style={{whiteSpace:'pre-wrap',padding:20,background:'#f0f3f9',color:'#34435e'}}>{error.message}{error.digest?'\n'+t('errors.page.digest',{digest:error.digest}):''}</pre>
  <Button onClick={reset}>{t('common.retry')}</Button>
  <a href="/"> {t('errors.page.home')}</a>
 </main>;
}
