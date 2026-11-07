import {DEFAULT_LOCALE,isLocale,type Locale} from './locales';

/** Map common language tags onto supported Atlas locales. */
export function normalizeLanguageTag(tag:string):Locale|null{
 const raw=tag.trim().replace(/_/g,'-');
 if(!raw)return null;
 if(isLocale(raw))return raw;
 const lower=raw.toLowerCase();
 if(lower==='zh-hans'||lower==='zh-cn'||lower==='zh-sg'||lower==='zh')return 'zh-Hans';
 if(lower.startsWith('zh-hans'))return 'zh-Hans';
 if(lower.startsWith('zh-cn')||lower.startsWith('zh-sg'))return 'zh-Hans';
 // Traditional Chinese and other zh variants are unsupported → null (caller falls back to en)
 if(lower.startsWith('zh'))return null;
 const primary=lower.split('-')[0];
 if(primary==='vi'||primary==='en'||primary==='es'||primary==='ja')return primary as Locale;
 return null;
}

export function parseAcceptLanguage(header:string|null|undefined):Locale{
 if(!header)return DEFAULT_LOCALE;
 const parts=header.split(',').map(part=>{
  const [tag, ...params]=part.trim().split(';');
  let q=1;
  for(const p of params){
   const m=/^q\s*=\s*([\d.]+)$/i.exec(p.trim());
   if(m)q=Number(m[1])||0;
  }
  return {tag:tag.trim(),q};
 }).filter(p=>p.tag).sort((a,b)=>b.q-a.q);
 for(const {tag} of parts){
  const locale=normalizeLanguageTag(tag);
  if(locale)return locale;
 }
 return DEFAULT_LOCALE;
}

export function localeFromCookie(value:string|null|undefined):Locale|null{
 if(!value)return null;
 return isLocale(value)?value:null;
}
