'use client';
import React,{useMemo} from 'react';
export function compare(oldText:string,newText:string){
 const a=oldText.split('\n'),b=newText.split('\n');
 if(a.length*b.length>300000)return [{type:'info',text:'Tài liệu quá dài để tính diff từng dòng. Xem toàn văn trong Source Editor.'}];
 const dp=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
 for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)dp[i][j]=a[i]===b[j]?1+dp[i+1][j+1]:Math.max(dp[i+1][j],dp[i][j+1]);
 let i=0,j=0;const out:{type:string;text:string}[]=[];
 while(i<a.length||j<b.length){if(i<a.length&&j<b.length&&a[i]===b[j]){out.push({type:'same',text:a[i]});i++;j++;}else if(j<b.length&&(i>=a.length||dp[i][j+1]>=dp[i+1][j]))out.push({type:'add',text:b[j++]});else out.push({type:'del',text:a[i++]});}
 return out;
}
export default function Diff({before,after}:{before:string;after:string}){const lines=useMemo(()=>compare(before,after),[before,after]);return <pre className="history-code">{lines.map((line,i)=><div className={'diff-line diff-'+line.type} key={i}>{line.type==='add'?'+':line.type==='del'?'-':' '}{line.text||' '}</div>)}</pre>;}
