'use client';
import {Button} from '@/components/ui/controls';
import {DEFAULT_LOCALE,LOCALE_COOKIE,isLocale,type Locale} from '@/lib/i18n/locales';
import {translate} from '@/lib/i18n/translate';

function readCookieLocale():Locale{
 if(typeof document==='undefined')return DEFAULT_LOCALE;
 const match=document.cookie.match(new RegExp('(?:^|;\\s*)'+LOCALE_COOKIE+'=([^;]+)'));
 const value=match?.[1]?decodeURIComponent(match[1]):'';
 return isLocale(value)?value:DEFAULT_LOCALE;
}

export default function GlobalError({error,reset}:{error:Error;reset:()=>void}){
 const locale=readCookieLocale();
 const t=(key:string)=>translate(locale,key);
 return <html lang={locale}><body style={{fontFamily:'system-ui',padding:40}}>
  <h1>{t('errors.page.globalTitle')}</h1>
  <pre>{error.message}</pre>
  <Button onClick={reset}>{t('common.retry')}</Button>
 </body></html>;
}
