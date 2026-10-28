/** Guard complex documents against lossy WYSIWYG round trips. */
export function visualSafe(value:string){return !(/```\s*mermaid\b/i.test(value)||/^\s*\|.*\|\s*\n\s*\|[-:| ]+\|/m.test(value)||/^\s*- \[[ xX]\]/m.test(value)||/<\/?[A-Z][\w.]*/.test(value)||/^:::/m.test(value)||/\$\$[\s\S]*?\$\$/.test(value));}
