'use client';
import React,{createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import {LOCALE_COOKIE,LOCALES,type Locale} from '@/lib/i18n/locales';
import {translate,type TranslateParams} from '@/lib/i18n/translate';
import {compareText,formatDate,formatDateTime,formatNumber,formatTime,lowerText} from '@/lib/i18n/format';

type LocaleContextValue={
 locale:Locale;
 setLocale:(next:Locale)=>void;
 t:(key:string,params?:TranslateParams)=>string;
 formatDate:(iso:string|number|Date)=>string;
 formatDateTime:(iso:string|number|Date)=>string;
 formatTime:(iso:string|number|Date,opts?:Intl.DateTimeFormatOptions)=>string;
 formatNumber:(value:number,opts?:Intl.NumberFormatOptions)=>string;
 compareText:(a:string,b:string)=>number;
 lowerText:(value:string)=>string;
};

const LocaleContext=createContext<LocaleContextValue|null>(null);

function writeLocaleCookie(locale:Locale){
 document.cookie=`${LOCALE_COOKIE}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function LocaleProvider({initialLocale,children}:{initialLocale:Locale;children:React.ReactNode}){
 const router=useRouter();
 const [locale,setLocaleState]=useState<Locale>(initialLocale);
 useEffect(()=>{setLocaleState(initialLocale);},[initialLocale]);

 const setLocale=useCallback((next:Locale)=>{
  if(!(LOCALES as readonly string[]).includes(next)||next===locale)return;
  writeLocaleCookie(next);
  setLocaleState(next);
  document.documentElement.lang=next;
  router.refresh();
 },[locale,router]);

 const value=useMemo<LocaleContextValue>(()=>({
  locale,
  setLocale,
  t:(key,params)=>translate(locale,key,params),
  formatDate:(iso)=>formatDate(locale,iso),
  formatDateTime:(iso)=>formatDateTime(locale,iso),
  formatTime:(iso,opts)=>formatTime(locale,iso,opts),
  formatNumber:(n,opts)=>formatNumber(locale,n,opts),
  compareText:(a,b)=>compareText(locale,a,b),
  lowerText:(v)=>lowerText(locale,v),
 }),[locale,setLocale]);

 return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(){
 const ctx=useContext(LocaleContext);
 if(!ctx)throw new Error('useLocale requires LocaleProvider');
 return ctx;
}

export function useT(){
 return useLocale().t;
}

/** Translate an API error payload for display. */
export function useApiError(){
 const {t}=useLocale();
 return useCallback((data:unknown,fallbackKey='errors.request.failed')=>{
  if(data&&typeof data==='object'){
   const row=data as {errorKey?:string;error?:string;params?:TranslateParams};
   if(row.errorKey){
    const params=row.params?{...row.params}:undefined;
    if(row.errorKey==='keymap.validation.conflict'&&params&&typeof params.label==='string'){
     const cmd=t(`keymap.commands.${params.label}`);
     if(cmd!==`keymap.commands.${params.label}`)params.label=cmd;
    }
    return t(row.errorKey,params);
   }
   if(typeof row.error==='string'&&row.error){
    const translated=t(row.error,row.params);
    if(translated!==row.error)return translated;
    return row.error;
   }
  }
  if(data instanceof Error&&data.message){
   const translated=t(data.message);
   return translated!==data.message?translated:data.message;
  }
  return t(fallbackKey);
 },[t]);
}
