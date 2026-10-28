/** Guard complex documents against lossy WYSIWYG round trips. */
const blocks:[RegExp,string][]=[
 [/```\s*mermaid\b/i,'Bài có sơ đồ Mermaid. Visual có thể làm mất cú pháp.'],
 [/^\s*\|.*\|\s*\n\s*\|[-:| ]+\|/m,'Bài có bảng. Visual có thể làm mất cú pháp.'],
 [/^\s*- \[[ xX]\]/m,'Bài có checklist. Visual có thể làm mất cú pháp.'],
 [/<\/?[A-Z][\w.]*/,'Bài có MDX. Visual có thể làm mất cú pháp.'],
 [/^:::/m,'Bài có khối đặc biệt. Visual có thể làm mất cú pháp.'],
 [/\$\$[\s\S]*?\$\$/,'Bài có công thức. Visual có thể làm mất cú pháp.'],
];
export function visualBlock(value:string){return blocks.find(([re])=>re.test(value))?.[1]??null;}
export function visualSafe(value:string){return !visualBlock(value);}
