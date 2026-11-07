import {INTL_LOCALE,type Locale} from './locales';

export function formatDate(locale:Locale,iso:string|number|Date):string{
 const d=iso instanceof Date?iso:new Date(iso);
 if(Number.isNaN(d.getTime()))return '';
 return d.toLocaleDateString(INTL_LOCALE[locale]);
}

export function formatDateTime(locale:Locale,iso:string|number|Date):string{
 const d=iso instanceof Date?iso:new Date(iso);
 if(Number.isNaN(d.getTime()))return '';
 return d.toLocaleString(INTL_LOCALE[locale]);
}

export function formatTime(locale:Locale,iso:string|number|Date,opts?:Intl.DateTimeFormatOptions):string{
 const d=iso instanceof Date?iso:new Date(iso);
 if(Number.isNaN(d.getTime()))return '';
 return d.toLocaleTimeString(INTL_LOCALE[locale],opts??{hour:'2-digit',minute:'2-digit'});
}

export function formatNumber(locale:Locale,value:number,opts?:Intl.NumberFormatOptions):string{
 return value.toLocaleString(INTL_LOCALE[locale],opts);
}

export function compareText(locale:Locale,a:string,b:string):number{
 return a.localeCompare(b,INTL_LOCALE[locale]);
}

export function lowerText(locale:Locale,value:string):string{
 return value.toLocaleLowerCase(INTL_LOCALE[locale]);
}
