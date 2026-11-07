import type {TranslateParams} from '@/lib/i18n/translate';

export type LimitFieldError={errorKey:string;errorParams?:TranslateParams};

export function parsePositiveInt(raw:string,max:number,label:string):{value?:number;error?:LimitFieldError}{
 const text=raw.trim();
 if(!/^\d+$/.test(text))return {error:{errorKey:'limits.validation.mustBeInteger',errorParams:{label}}};
 const value=Number(text);
 if(value<1||value>max)return {error:{errorKey:'limits.validation.integerRange',errorParams:{label,max}}};
 return {value};
}

export function parseMib(raw:string,maxBytes:number,label:string):{value?:number;error?:LimitFieldError}{
 const text=raw.trim().replace(',','.');
 if(!/^\d+(\.\d+)?$/.test(text))return {error:{errorKey:'limits.validation.mustBeMib',errorParams:{label}}};
 const mib=Number(text);
 const value=Math.round(mib*1024*1024);
 const maxMib=Math.floor(maxBytes/1024/1024);
 if(!(mib>0)||value<1||value>maxBytes)return {error:{errorKey:'limits.validation.mibRange',errorParams:{label,maxMib}}};
 return {value};
}

export function mibText(bytes:number){return String(Math.round(bytes/1024/1024*1000)/1000);}

export function formatLimitFieldError(t:(key:string,params?:TranslateParams)=>string,error?:LimitFieldError):string|undefined{
 return error?t(error.errorKey,error.errorParams):undefined;
}
