export type Folder={path:string;title:string;imageId:string|null;icon:string|null;depth:number};
export type DocKind='md'|'yaml'|'sql';
export type DocInfo={id:string;kind:DocKind;title:string;description:string;category:string;updatedAt:string;order:number;content?:string;raw?:string;text:string;headings:{level:number;title:string;id:string}[]};
export type AssetSource='upload'|'paste'|'edit';
export type Asset={id:string;filename:string;storedName:string;mimeType:string;size:number;alt:string;source:AssetSource;createdAt:string};
export type Comment={id:string;docId:string;content:string;quote:string;blockId:string;createdAt:string;resolved:boolean};
export type Settings={theme:'dark'|'light';leftWidth:number;rightWidth:number;pinnedFolders:string[];hiddenFolders:string[]};
export type DB={assets:Asset[];folders:{path:string;title:string;imageId:string|null;icon?:string|null}[];comments:Comment[];navigationOrder:Record<string,string[]>;settings:Settings;[key:string]:unknown};
