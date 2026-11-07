/** Guard complex documents against lossy WYSIWYG round trips. */
const blocks:[RegExp,string][]=[
 [/```\s*mermaid\b/i,'editor.visual.blocked.mermaid'],
 [/```\s*sql\b/i,'editor.visual.blocked.sql'],
 [/```\s*(ya?ml|json)\b/i,'editor.visual.blocked.yamlJson'],
 [/^\s*\|.*\|\s*\n\s*\|[-:| ]+\|/m,'editor.visual.blocked.table'],
 [/^\s*- \[[ xX]\]/m,'editor.visual.blocked.checklist'],
 [/<\/?[A-Z][\w.]*/,'editor.visual.blocked.mdx'],
 [/^:::/m,'editor.visual.blocked.admonition'],
 [/\$\$[\s\S]*?\$\$/,'editor.visual.blocked.math'],
];
export function visualBlock(value:string){return blocks.find(([re])=>re.test(value))?.[1]??null;}
export function visualSafe(value:string){return !visualBlock(value);}
