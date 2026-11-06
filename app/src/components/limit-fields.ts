export function parsePositiveInt(raw:string,max:number,label:string):{value?:number;error?:string}{
 const text=raw.trim();
 if(!/^\d+$/.test(text))return {error:`${label} phải là số nguyên.`};
 const value=Number(text);
 if(value<1||value>max)return {error:`${label} từ 1 đến ${max}.`};
 return {value};
}

export function parseMib(raw:string,maxBytes:number,label:string):{value?:number;error?:string}{
 const text=raw.trim().replace(',','.');
 if(!/^\d+(\.\d+)?$/.test(text))return {error:`${label} phải là số MiB.`};
 const mib=Number(text);
 const value=Math.round(mib*1024*1024);
 if(!(mib>0)||value<1||value>maxBytes)return {error:`${label} từ 1 byte đến ${Math.floor(maxBytes/1024/1024)} MiB.`};
 return {value};
}

export function mibText(bytes:number){return String(Math.round(bytes/1024/1024*1000)/1000);}
