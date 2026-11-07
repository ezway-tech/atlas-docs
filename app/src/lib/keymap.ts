import {AppError} from './i18n/errors';
import {DEFAULT_LOCALE} from './i18n/locales';
import {translate} from './i18n/translate';

export type Chord={mod?:boolean;alt?:boolean;shift?:boolean;key:string};
export type Keymap=Record<string,Chord|null>;
export type Scope='global'|'library'|'reader'|'editor'|'source'|'resource'|'image'|'history';
export type GroupId='chung'|'thu-vien'|'doc'|'soan'|'tai-nguyen'|'anh';
export type FieldMode=boolean|'source';
export type Command={id:string;label:string;group:GroupId;scope:Scope;default:Chord|null;allowInField:FieldMode;alias?:Chord};
export type KeyRuntime={dialog:string|null;search:boolean;menu:boolean;resource:boolean;editing:boolean;source:boolean;doc:boolean};

const t=(key:string)=>translate(DEFAULT_LOCALE,key);

export const groups:{id:GroupId;label:string}[]=[
 {id:'chung',label:t('keymap.groups.chung')},
 {id:'thu-vien',label:t('keymap.groups.thu-vien')},
 {id:'doc',label:t('keymap.groups.doc')},
 {id:'soan',label:t('keymap.groups.soan')},
 {id:'tai-nguyen',label:t('keymap.groups.tai-nguyen')},
 {id:'anh',label:t('keymap.groups.anh')},
];

const mod=(key:string,extra:Partial<Chord>={}):Chord=>({mod:true,key,...extra});
const bare=(key:string):Chord=>({key});

function command(id:string,group:GroupId,scope:Scope,defaults:Chord|null,allowInField:FieldMode,alias?:Chord):Command{
 return {id,label:t(`keymap.commands.${id}`),group,scope,default:defaults,allowInField,alias};
}

export const commands:Command[]=[
 command('search','chung','global',mod('k'),true),
 command('keymap','chung','global',bare('?'),false),
 command('theme','chung','global',null,false),
 command('panel.left','chung','global',null,false),
 command('panel.right','chung','global',null,false),
 command('home','chung','global',null,false),
 command('media','chung','global',null,false),
 command('export','chung','global',null,false),
 command('import','chung','global',null,false),
 command('topic.new','thu-vien','library',null,false),
 command('doc.new','thu-vien','library',null,false),
 command('folder.child','thu-vien','library',null,false),
 command('folder.edit','thu-vien','library',null,false),
 command('tree.expand','thu-vien','library',null,false),
 command('tree.collapse','thu-vien','library',null,false),
 command('branch.expand','thu-vien','library',null,false),
 command('branch.collapse','thu-vien','library',null,false),
 command('folder.pin','thu-vien','library',null,false),
 command('folder.hide','thu-vien','library',null,false),
 command('search.folder','thu-vien','library',null,false),
 command('folder.delete','thu-vien','library',null,false),
 command('find','doc','reader',mod('f'),false),
 command('comment','doc','reader',mod('m',{alt:true}),false),
 command('doc.edit','doc','reader',null,false),
 command('history','doc','reader',null,false),
 command('history.restore','doc','history',null,false),
 command('tab.comments','doc','reader',null,false),
 command('tab.toc','doc','reader',null,false),
 command('doc.delete','doc','reader',null,false),
 command('comment.delete','doc','reader',null,false),
 command('save','soan','editor',mod('s'),true),
 command('edit.close','soan','editor',null,false),
 command('insert.asset','soan','editor',null,false),
 command('mode.visual','soan','editor',null,false),
 command('mode.source','soan','editor',null,false),
 command('mode.split','soan','editor',null,false),
 command('mode.preview','soan','editor',null,false),
 command('format.paragraph','soan','source',null,'source'),
 command('format.h1','soan','source',null,'source'),
 command('format.h4','soan','source',null,'source'),
 command('format.h5','soan','source',null,'source'),
 command('format.h6','soan','source',null,'source'),
 command('format.h2','soan','source',null,'source'),
 command('format.h3','soan','source',null,'source'),
 command('format.bold','soan','source',null,'source'),
 command('format.italic','soan','source',null,'source'),
 command('format.link','soan','source',null,'source'),
 command('format.list','soan','source',null,'source'),
 command('format.number','soan','source',null,'source'),
 command('format.task','soan','source',null,'source'),
 command('format.quote','soan','source',null,'source'),
 command('format.code','soan','source',null,'source'),
 command('format.table','soan','source',null,'source'),
 command('format.mermaid','soan','source',null,'source'),
 command('format.divider','soan','source',null,'source'),
 command('resource.find','tai-nguyen','resource',null,false),
 command('resource.upload','tai-nguyen','resource',null,false),
 command('resource.view','tai-nguyen','resource',null,false),
 command('resource.copy','tai-nguyen','resource',null,false),
 command('resource.download','tai-nguyen','resource',null,false),
 command('resource.rename','tai-nguyen','resource',null,false),
 command('resource.delete','tai-nguyen','resource',null,false),
 command('image.select','anh','image',bare('v'),false),
 command('image.crop','anh','image',bare('c'),false),
 command('image.pen','anh','image',bare('b'),false),
 command('image.arrow','anh','image',bare('a'),false),
 command('image.rect','anh','image',bare('r'),false),
 command('image.text','anh','image',bare('t'),false),
 command('image.remove','anh','image',bare('Delete'),false),
 command('image.undo','anh','image',mod('z'),true),
 command('image.redo','anh','image',mod('z',{shift:true}),true,bare('y')),
];

export const fixedKeys:{label:string;keys:string}[]=[
 {label:t('keymap.fixed.closeTop'),keys:'Escape'},
 {label:t('keymap.fixed.findNext'),keys:'Enter'},
 {label:t('keymap.fixed.findPrev'),keys:'Shift+Enter'},
];

const byId=new Map(commands.map(command=>[command.id,command]));
export const commandById=(id:string)=>byId.get(id);

const named=/^(Delete|Backspace|Enter|Escape|Tab|Space|Arrow(Up|Down|Left|Right)|F([1-9]|1[0-2])|Home|End|PageUp|PageDown)$/;

export function canonicalKey(key:string):string|null{
 if(key==='?')return '?';
 if(/^[a-z0-9]$/.test(key))return key;
 if(/^[A-Z]$/.test(key))return key.toLowerCase();
 if(named.test(key))return key;
 if(key.length===1&&key.trim())return key;
 return null;
}

export function sameChord(a:Chord,b:Chord){return !!a.mod===!!b.mod&&!!a.alt===!!b.alt&&!!a.shift===!!b.shift&&a.key===b.key;}

export function chordLabel(chord:Chord){
 const parts:string[]=[];
 if(chord.mod)parts.push('Ctrl');
 if(chord.alt)parts.push('Alt');
 if(chord.shift)parts.push('Shift');
 parts.push(chord.key.length===1?chord.key.toUpperCase():chord.key);
 return parts.join('+');
}

export function eventChord(event:KeyboardEvent):Chord|null{
 if(event.isComposing||event.key==='Dead'||event.key==='Process'||event.key==='Unidentified')return null;
 if(event.key==='Control'||event.key==='Shift'||event.key==='Alt'||event.key==='Meta')return null;
 const raw=event.key===' '?'Space':event.key;
 const letter=/^[a-zA-Z]$/.test(raw);
 const key=canonicalKey(letter?raw.toLowerCase():raw);
 if(!key)return null;
 const chord:Chord={key};
 if(event.ctrlKey||event.metaKey)chord.mod=true;
 if(event.altKey)chord.alt=true;
 if(letter&&event.shiftKey)chord.shift=true;
 return chord;
}

function reserved(chord:Chord){
 const key=chord.key;
 if(key==='F5'||(chord.alt&&key==='F4')||(chord.mod&&key==='Tab'))return true;
 if(!chord.mod)return false;
 if(key==='w'||key==='t'||key==='n')return !chord.alt;
 if(chord.shift&&key==='t')return !chord.alt;
 return false;
}

function chordAllowed(command:Command,chord:Chord){
 if(reserved(chord))return 'keymap.validation.browserReserved';
 if(command.scope==='image')return '';
 if(command.id==='keymap'&&sameChord(chord,bare('?')))return '';
 if(!chord.mod&&!chord.alt)return 'keymap.validation.needsModifier';
 return '';
}

export function resolveChord(id:string,overrides:Keymap):Chord|null{
 if(Object.prototype.hasOwnProperty.call(overrides,id))return overrides[id];
 return commandById(id)?.default??null;
}

export function chordList(id:string,overrides:Keymap):Chord[]{
 const command=commandById(id);
 const chord=resolveChord(id,overrides);
 if(!command||!chord)return [];
 const list=[chord];
 if(command.alias&&command.default&&sameChord(chord,command.default))list.push(command.alias);
 if(id==='image.remove'&&command.default&&sameChord(chord,command.default))list.push(bare('Backspace'));
 return list;
}

const together:Record<Scope,Scope[]>={
 image:['image'],
 history:['history'],
 source:['source','editor','library','global'],
 editor:['source','editor','library','global'],
 reader:['reader','library','global'],
 resource:['resource','library','global'],
 library:['source','editor','reader','resource','library','global'],
 global:['source','editor','reader','resource','library','global'],
};

function overlaps(a:Scope,b:Scope){return together[a].includes(b);}

export function conflictWith(id:string,chord:Chord,overrides:Keymap):Command|null{
 const command=commandById(id);
 if(!command)return null;
 for(const other of commands){
  if(other.id===id||!overlaps(command.scope,other.scope))continue;
  if(chordList(other.id,overrides).some(item=>sameChord(item,chord)))return other;
 }
 return null;
}

function parseChord(value:unknown):Chord|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const raw=value as Record<string,unknown>;
 if(typeof raw.key!=='string')return null;
 const key=canonicalKey(raw.key);
 if(!key)return null;
 const chord:Chord={key};
 if(raw.mod||raw.ctrl||raw.meta)chord.mod=true;
 if(raw.alt)chord.alt=true;
 if(raw.shift)chord.shift=true;
 return chord;
}

export function sanitizeKeymap(input:unknown):Keymap{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new AppError('keymap.validation.invalidMap');
 const next:Keymap={};
 for(const [id,value] of Object.entries(input as Record<string,unknown>)){
  const command=commandById(id);
  if(!command)continue;
  if(value===null){next[id]=null;continue;}
  const chord=parseChord(value);
  if(!chord)throw new AppError('keymap.validation.invalidKey');
  const reason=chordAllowed(command,chord);
  if(reason)throw new AppError(reason);
  const other=conflictWith(id,chord,next);
  if(other)throw new AppError('keymap.validation.conflict',400,{label:other.id});
  next[id]=chord;
 }
 return next;
}

export function cleanKeymap(input:unknown):Keymap{
 if(!input||typeof input!=='object'||Array.isArray(input))return {};
 const next:Keymap={};
 for(const [id,value] of Object.entries(input as Record<string,unknown>)){
  const command=commandById(id);
  if(!command)continue;
  if(value===null){next[id]=null;continue;}
  const chord=parseChord(value);
  if(!chord||chordAllowed(command,chord)||conflictWith(id,chord,next))continue;
  next[id]=chord;
 }
 return next;
}

export function activeScopes(runtime:KeyRuntime,image:boolean):Scope[]{
 if(image)return ['image'];
 if(runtime.dialog==='history')return ['history'];
 if(runtime.dialog&&runtime.dialog!=='media')return [];
 if(runtime.search||runtime.menu)return [];
 const scopes:Scope[]=[];
 if(runtime.resource)scopes.push('resource');
 if(runtime.dialog==='media')return scopes;
 if(runtime.editing&&runtime.source)scopes.push('source');
 if(runtime.editing)scopes.push('editor');
 else if(runtime.doc)scopes.push('reader');
 scopes.push('library','global');
 return scopes;
}

export function fieldKind(target:EventTarget|null):'source'|'field'|null{
 if(!(target instanceof Element))return null;
 if(target.closest('.cm-editor'))return 'source';
 if(target.closest('input,textarea,select,[contenteditable="true"]'))return 'field';
 return null;
}

export function allowsField(command:Command,where:'source'|'field'|null,target:EventTarget|null){
 if(!where)return true;
 if(command.allowInField===true)return true;
 if(command.allowInField==='source')return where==='source';
 return target instanceof Element&&!!target.closest(`[data-keymap-allow~="${command.id}"]`);
}
