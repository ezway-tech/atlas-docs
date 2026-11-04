import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import {toString} from 'hast-util-to-string';
import type {Root,RootContent} from 'hast';

export type Heading={level:number;title:string;id:string;line:number;endLine:number};
export const headingSelector='h1,h2,h3,h4,h5,h6';
export function splitMarkdown(raw:string){
 const opening=/^---\r?\n/.exec(raw),closing=/^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/gm;
 closing.lastIndex=opening?.[0].length||0;
 const end=opening?closing.exec(raw):null;
 const meta=end?raw.slice(0,end.index+end[0].length):'';
 return {meta,body:raw.slice(meta.length)};
}
// Keep wiki expansion identical in the reader and heading parser.
export function markdownWiki(content:string){return content.split('\n').map(line=>line.includes('```')?line:line.replace(/\[\[([\w/-]+)\]\]/g,'[$1](/docs/$1)')).join('\n');}
const parser=unified().use(remarkParse).use(remarkGfm);
const processor=unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeSlug);
export function extractHeadings(raw:string):Heading[]{
 const {meta,body}=splitMarkdown(raw),offset=(meta.match(/\n/g)||[]).length;
 const input=markdownWiki(body),tree=processor.runSync(processor.parse(input)) as Root;
 const result:Heading[]=[];
 function walk(node:Root|RootContent){
  if(node.type==='element'&&/^h[1-6]$/.test(node.tagName)){
   result.push({level:Number(node.tagName[1]),title:toString(node)||'(Tiêu đề trống)',id:String(node.properties.id),line:(node.position?.start.line||1)+offset,endLine:(node.position?.end.line||1)+offset});
  }
  if('children' in node)for(const child of node.children)walk(child as RootContent);
 }
 walk(tree);return result;
}
export type HeadingNode=Heading&{children:HeadingNode[]};
export function headingTree(headings:Heading[],min=1,max=6){
 const roots:HeadingNode[]=[],stack:HeadingNode[]=[];
 for(const heading of headings){
  const node={...heading,children:[] as HeadingNode[]};
  while(stack.length&&stack[stack.length-1].level>=node.level)stack.pop();
  (stack.length?stack[stack.length-1].children:roots).push(node);stack.push(node);
 }
 function filter(nodes:HeadingNode[]):HeadingNode[]{return nodes.flatMap(node=>{
  const children=filter(node.children);
  return node.level>=min&&node.level<=max?[{...node,children}]:children;
 });}
 return filter(roots);
}
// A single range replacement keeps heading changes in one undo step.
export function headingEdit(raw:string,startLine:number,endLine:number,level:number){
 const {meta,body}=splitMarkdown(raw),offset=(meta.match(/\n/g)||[]).length;
 const lines=raw.split('\n'),blocked=new Set<number>(),underlines=new Set<number>();
 const tree=parser.parse(body);
 function inspect(node:any){
  if(node.type==='code'||node.type==='html')for(let i=node.position.start.line;i<=node.position.end.line;i++)blocked.add(i+offset);
  if(node.type==='heading'&&node.position.end.line>node.position.start.line){
   const last=node.position.end.line+offset;
   if(/^ {0,3}(?:=+|-+)\s*$/.test(lines[last-1]||''))underlines.add(last);
  }
  node.children?.forEach(inspect);
 }
 inspect(tree);
 let first=Math.max(1,startLine),last=Math.min(lines.length,endLine);
 if(underlines.has(first))first--;
 if(underlines.has(last+1))last++;
 const replacement=lines.slice(first-1,last).flatMap((line,i)=>{
  const at=first+i;if(at<=offset||blocked.has(at))return [line];
  if(underlines.has(at))return [];
  const match=/^( {0,3})#{1,6}(?:[ \t]+|$)(.*)$/.exec(line);
  const text=match?match[1]+match[2].replace(/[ \t]+#+[ \t]*$/,''):line;
  return [level?'#'.repeat(level)+' '+text.trimStart():text];
 }).join('\n');
 return {first,last,text:replacement};
}
