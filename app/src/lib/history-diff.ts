import {diffWordsWithSpace} from 'diff';

export type Span={text:string;mark:boolean};
export type CellKind='same'|'add'|'del'|'empty';
export type Cell={line:number|null;text:string;spans:Span[];kind:CellKind};
export type Row={left:Cell;right:Cell};
export type Segment={type:'skip';key:string;count:number;rows:Row[]}|{type:'hunk';index:number;adds:number;dels:number;rows:Row[]};
export type HistoryDiff={identical:boolean;tooLarge:boolean;adds:number;dels:number;hunks:number;segments:Segment[]};

const CONTEXT=3;
const WORD_LIMIT=400;
const empty=():Cell=>({line:null,text:'',spans:[],kind:'empty'});
const plain=(line:number|null,text:string,kind:CellKind):Cell=>({line,text,spans:text?[{text,mark:false}]:[],kind});

type Raw={type:'same'|'add'|'del';text:string;oldNo:number|null;newNo:number|null};

function lineDiff(oldText:string,newText:string):Raw[]|null{
 const a=oldText.split('\n'),b=newText.split('\n');
 if(a.length*b.length>300000)return null;
 const dp=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
 for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)dp[i][j]=a[i]===b[j]?1+dp[i+1][j+1]:Math.max(dp[i+1][j],dp[i][j+1]);
 const raw:Raw[]=[];
 let i=0,j=0,oldNo=1,newNo=1;
 while(i<a.length||j<b.length){
  if(i<a.length&&j<b.length&&a[i]===b[j]){raw.push({type:'same',text:a[i],oldNo:oldNo++,newNo:newNo++});i++;j++;}
  else if(j<b.length&&(i>=a.length||dp[i][j+1]>=dp[i+1][j])){raw.push({type:'add',text:b[j],oldNo:null,newNo:newNo++});j++;}
  else{raw.push({type:'del',text:a[i],oldNo:oldNo++,newNo:null});i++;}
 }
 return raw;
}

function wordSpans(oldText:string,newText:string):{left:Span[];right:Span[]}{
 if(oldText.length>WORD_LIMIT||newText.length>WORD_LIMIT)return{left:[{text:oldText,mark:false}],right:[{text:newText,mark:false}]};
 const left:Span[]=[],right:Span[]=[];
 for(const part of diffWordsWithSpace(oldText,newText)){
  if(!part.value)continue;
  if(part.added)right.push({text:part.value,mark:true});
  else if(part.removed)left.push({text:part.value,mark:true});
  else{left.push({text:part.value,mark:false});right.push({text:part.value,mark:false});}
 }
 if(!left.length)left.push({text:oldText,mark:false});
 if(!right.length)right.push({text:newText,mark:false});
 return{left,right};
}

function sameRow(line:Raw):Row{
 return{left:plain(line.oldNo,line.text,'same'),right:plain(line.newNo,line.text,'same')};
}
function delRow(line:Raw):Row{
 return{left:plain(line.oldNo,line.text,'del'),right:empty()};
}
function addRow(line:Raw):Row{
 return{left:empty(),right:plain(line.newNo,line.text,'add')};
}
function changeRow(before:Raw,after:Raw):Row{
 const spans=wordSpans(before.text,after.text);
 return{left:{line:before.oldNo,text:before.text,spans:spans.left,kind:'del'},right:{line:after.newNo,text:after.text,spans:spans.right,kind:'add'}};
}

function rowsFrom(slice:Raw[]):Row[]{
 const rows:Row[]=[];
 for(let i=0;i<slice.length;){
  const line=slice[i];
  if(line.type==='same'){rows.push(sameRow(line));i++;continue;}
  let j=i;while(j<slice.length&&slice[j].type!=='same')j++;
  const dels=slice.slice(i,j).filter(item=>item.type==='del'),adds=slice.slice(i,j).filter(item=>item.type==='add');
  const n=Math.max(dels.length,adds.length);
  for(let p=0;p<n;p++){
   const del=dels[p],add=adds[p];
   if(del&&add)rows.push(changeRow(del,add));
   else if(del)rows.push(delRow(del));
   else if(add)rows.push(addRow(add));
  }
  i=j;
 }
 return rows;
}

export function buildHistoryDiff(oldText:string,newText:string):HistoryDiff{
 if(oldText===newText)return{identical:true,tooLarge:false,adds:0,dels:0,hunks:0,segments:[]};
 const raw=lineDiff(oldText,newText);
 if(!raw)return{identical:false,tooLarge:true,adds:0,dels:0,hunks:0,segments:[]};
 const ranges:[number,number][]=[];
 raw.forEach((line,index)=>{
  if(line.type==='same')return;
  const start=Math.max(0,index-CONTEXT),end=Math.min(raw.length-1,index+CONTEXT);
  const last=ranges[ranges.length-1];
  if(last&&start<=last[1]+1)last[1]=Math.max(last[1],end);
  else ranges.push([start,end]);
 });
 const segments:Segment[]=[];
 let cursor=0,hunk=0,adds=0,dels=0;
 for(const [start,end] of ranges){
  if(start>cursor){
   const hidden=raw.slice(cursor,start);
   segments.push({type:'skip',key:cursor+'-'+start,count:hidden.length,rows:rowsFrom(hidden)});
  }
  const slice=raw.slice(start,end+1);
  let hunkAdds=0,hunkDels=0;
  for(const line of slice){if(line.type==='add')hunkAdds++;else if(line.type==='del')hunkDels++;}
  adds+=hunkAdds;dels+=hunkDels;
  segments.push({type:'hunk',index:hunk++,adds:hunkAdds,dels:hunkDels,rows:rowsFrom(slice)});
  cursor=end+1;
 }
 if(cursor<raw.length){
  const hidden=raw.slice(cursor);
  segments.push({type:'skip',key:cursor+'-'+raw.length,count:hidden.length,rows:rowsFrom(hidden)});
 }
 return{identical:false,tooLarge:false,adds,dels,hunks:hunk,segments};
}
