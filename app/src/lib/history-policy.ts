import {AppError} from './i18n/errors';

export const HISTORY_DEFAULTS={maxCount:50,maxBytes:10*1024*1024};
export const HISTORY_CEILING={maxCount:500,maxBytes:64*1024*1024};

export type HistoryLimits={maxCount:number;maxBytes:number};
export type RevisionSize={name:string;size:number};

function finiteInt(n:unknown):n is number{return typeof n==='number'&&Number.isInteger(n)&&n>=1;}

export function effectiveHistoryLimits(settings:{history?:Partial<HistoryLimits>}|null|undefined):HistoryLimits{
 const h=settings?.history;
 const maxCount=finiteInt(h?.maxCount)&&h.maxCount<=HISTORY_CEILING.maxCount?h.maxCount:HISTORY_DEFAULTS.maxCount;
 const maxBytes=finiteInt(h?.maxBytes)&&h.maxBytes<=HISTORY_CEILING.maxBytes?h.maxBytes:HISTORY_DEFAULTS.maxBytes;
 return {maxCount,maxBytes};
}

export function parseHistoryLimits(input:unknown):HistoryLimits{
 if(!input||typeof input!=='object')throw new AppError('errors.history.limitsInvalid');
 const o=input as Record<string,unknown>;
 if(!finiteInt(o.maxCount)||o.maxCount>HISTORY_CEILING.maxCount)throw new AppError('errors.history.maxCountRange',400,{max:HISTORY_CEILING.maxCount});
 if(!finiteInt(o.maxBytes)||o.maxBytes>HISTORY_CEILING.maxBytes)throw new AppError('errors.history.maxBytesRange',400,{max:HISTORY_CEILING.maxBytes});
 return {maxCount:o.maxCount,maxBytes:o.maxBytes};
}

/** Newest-first list. Never removes `protect`. Over-limit remainder is reported, not forced. */
export function selectHistoryPrune(newestFirst:RevisionSize[],limits:HistoryLimits,protect?:string){
 let count=newestFirst.length,total=0;
 for(const item of newestFirst)total+=item.size;
 const remove:string[]=[];
 for(let i=newestFirst.length-1;i>=0&&(count>limits.maxCount||total>limits.maxBytes);i--){
  const item=newestFirst[i];
  if(protect&&item.name===protect)continue;
  remove.push(item.name);total-=item.size;count--;
 }
 return {remove,kept:count,bytes:total,overCount:Math.max(0,count-limits.maxCount),overBytes:Math.max(0,total-limits.maxBytes)};
}
