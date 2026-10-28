export type Chord={mod?:boolean;alt?:boolean;shift?:boolean;key:string};
export type Keymap=Record<string,Chord|null>;
export type Scope='global'|'library'|'reader'|'editor'|'source'|'resource'|'image'|'history';
export type GroupId='chung'|'thu-vien'|'doc'|'soan'|'tai-nguyen'|'anh';
export type FieldMode=boolean|'source';
export type Command={id:string;label:string;group:GroupId;scope:Scope;default:Chord|null;allowInField:FieldMode;alias?:Chord};
export type KeyRuntime={dialog:string|null;search:boolean;menu:boolean;resource:boolean;editing:boolean;source:boolean;doc:boolean};

export const groups:{id:GroupId;label:string}[]=[
 {id:'chung',label:'Chung'},
 {id:'thu-vien',label:'Thư viện'},
 {id:'doc',label:'Đọc bài'},
 {id:'soan',label:'Soạn thảo'},
 {id:'tai-nguyen',label:'Tài nguyên'},
 {id:'anh',label:'Chỉnh ảnh'},
];

const mod=(key:string,extra:Partial<Chord>={}):Chord=>({mod:true,key,...extra});
const bare=(key:string):Chord=>({key});

export const commands:Command[]=[
 {id:'search',label:'Tìm thư viện',group:'chung',scope:'global',default:mod('k'),allowInField:true},
 {id:'keymap',label:'Mở phím tắt',group:'chung',scope:'global',default:bare('?'),allowInField:false},
 {id:'theme',label:'Đổi giao diện',group:'chung',scope:'global',default:null,allowInField:false},
 {id:'panel.left',label:'Ẩn hoặc hiện thư viện',group:'chung',scope:'global',default:null,allowInField:false},
 {id:'panel.right',label:'Ẩn hoặc hiện bình luận',group:'chung',scope:'global',default:null,allowInField:false},
 {id:'home',label:'Về trang chủ',group:'chung',scope:'global',default:null,allowInField:false},
 {id:'media',label:'Mở tài nguyên',group:'chung',scope:'global',default:null,allowInField:false},
 {id:'export',label:'Xuất ZIP',group:'chung',scope:'global',default:null,allowInField:false},
 {id:'import',label:'Import ZIP',group:'chung',scope:'global',default:null,allowInField:false},
 {id:'topic.new',label:'Tạo chủ đề',group:'thu-vien',scope:'library',default:null,allowInField:false},
 {id:'doc.new',label:'Bài viết mới',group:'thu-vien',scope:'library',default:null,allowInField:false},
 {id:'folder.child',label:'Folder con',group:'thu-vien',scope:'library',default:null,allowInField:false},
 {id:'folder.edit',label:'Sửa folder',group:'thu-vien',scope:'library',default:null,allowInField:false},
 {id:'tree.expand',label:'Mở tất cả thư mục',group:'thu-vien',scope:'library',default:null,allowInField:false},
 {id:'tree.collapse',label:'Thu gọn tất cả thư mục',group:'thu-vien',scope:'library',default:null,allowInField:false},
 {id:'branch.expand',label:'Mở nhánh hiện tại',group:'thu-vien',scope:'library',default:null,allowInField:false},
 {id:'branch.collapse',label:'Thu gọn nhánh hiện tại',group:'thu-vien',scope:'library',default:null,allowInField:false},
 {id:'folder.pin',label:'Ghim hoặc bỏ ghim',group:'thu-vien',scope:'library',default:null,allowInField:false},
 {id:'folder.hide',label:'Ẩn hoặc hiện khỏi sidebar',group:'thu-vien',scope:'library',default:null,allowInField:false},
 {id:'search.folder',label:'Tìm trong thư mục',group:'thu-vien',scope:'library',default:null,allowInField:false},
 {id:'folder.delete',label:'Xóa folder',group:'thu-vien',scope:'library',default:null,allowInField:false},
 {id:'find',label:'Tìm trong bài',group:'doc',scope:'reader',default:mod('f'),allowInField:false},
 {id:'comment',label:'Bình luận vùng chọn',group:'doc',scope:'reader',default:mod('m',{alt:true}),allowInField:false},
 {id:'doc.edit',label:'Sửa bài',group:'doc',scope:'reader',default:null,allowInField:false},
 {id:'history',label:'Lịch sử',group:'doc',scope:'reader',default:null,allowInField:false},
 {id:'history.restore',label:'Khôi phục phiên bản',group:'doc',scope:'history',default:null,allowInField:false},
 {id:'tab.comments',label:'Tab bình luận',group:'doc',scope:'reader',default:null,allowInField:false},
 {id:'tab.toc',label:'Tab mục lục',group:'doc',scope:'reader',default:null,allowInField:false},
 {id:'doc.delete',label:'Xóa bài',group:'doc',scope:'reader',default:null,allowInField:false},
 {id:'comment.delete',label:'Xóa bình luận',group:'doc',scope:'reader',default:null,allowInField:false},
 {id:'save',label:'Lưu',group:'soan',scope:'editor',default:mod('s'),allowInField:true},
 {id:'edit.close',label:'Đóng bài đang sửa',group:'soan',scope:'editor',default:null,allowInField:false},
 {id:'insert.asset',label:'Chèn tài nguyên',group:'soan',scope:'editor',default:null,allowInField:false},
 {id:'mode.visual',label:'Chế độ Visual',group:'soan',scope:'editor',default:null,allowInField:false},
 {id:'mode.source',label:'Chế độ Source',group:'soan',scope:'editor',default:null,allowInField:false},
 {id:'mode.split',label:'Chế độ Split',group:'soan',scope:'editor',default:null,allowInField:false},
 {id:'mode.preview',label:'Chế độ Preview',group:'soan',scope:'editor',default:null,allowInField:false},
 {id:'format.h2',label:'Tiêu đề 2',group:'soan',scope:'source',default:null,allowInField:'source'},
 {id:'format.h3',label:'Tiêu đề 3',group:'soan',scope:'source',default:null,allowInField:'source'},
 {id:'format.bold',label:'Đậm',group:'soan',scope:'source',default:null,allowInField:'source'},
 {id:'format.italic',label:'Nghiêng',group:'soan',scope:'source',default:null,allowInField:'source'},
 {id:'format.link',label:'Liên kết',group:'soan',scope:'source',default:null,allowInField:'source'},
 {id:'format.list',label:'Danh sách',group:'soan',scope:'source',default:null,allowInField:'source'},
 {id:'format.number',label:'Danh sách số',group:'soan',scope:'source',default:null,allowInField:'source'},
 {id:'format.task',label:'Việc cần làm',group:'soan',scope:'source',default:null,allowInField:'source'},
 {id:'format.quote',label:'Trích dẫn',group:'soan',scope:'source',default:null,allowInField:'source'},
 {id:'format.code',label:'Code',group:'soan',scope:'source',default:null,allowInField:'source'},
 {id:'format.table',label:'Bảng',group:'soan',scope:'source',default:null,allowInField:'source'},
 {id:'format.mermaid',label:'Sơ đồ',group:'soan',scope:'source',default:null,allowInField:'source'},
 {id:'format.divider',label:'Đường kẻ',group:'soan',scope:'source',default:null,allowInField:'source'},
 {id:'resource.find',label:'Tìm tài nguyên',group:'tai-nguyen',scope:'resource',default:null,allowInField:false},
 {id:'resource.upload',label:'Tải tệp lên',group:'tai-nguyen',scope:'resource',default:null,allowInField:false},
 {id:'resource.view',label:'Đổi dạng lưới hoặc danh sách',group:'tai-nguyen',scope:'resource',default:null,allowInField:false},
 {id:'resource.copy',label:'Sao chép liên kết',group:'tai-nguyen',scope:'resource',default:null,allowInField:false},
 {id:'resource.download',label:'Tải xuống',group:'tai-nguyen',scope:'resource',default:null,allowInField:false},
 {id:'resource.rename',label:'Đổi tên tệp',group:'tai-nguyen',scope:'resource',default:null,allowInField:false},
 {id:'resource.delete',label:'Xóa tệp',group:'tai-nguyen',scope:'resource',default:null,allowInField:false},
 {id:'image.select',label:'Chọn',group:'anh',scope:'image',default:bare('v'),allowInField:false},
 {id:'image.crop',label:'Cắt',group:'anh',scope:'image',default:bare('c'),allowInField:false},
 {id:'image.pen',label:'Vẽ',group:'anh',scope:'image',default:bare('b'),allowInField:false},
 {id:'image.arrow',label:'Mũi tên',group:'anh',scope:'image',default:bare('a'),allowInField:false},
 {id:'image.rect',label:'Khung',group:'anh',scope:'image',default:bare('r'),allowInField:false},
 {id:'image.text',label:'Chữ',group:'anh',scope:'image',default:bare('t'),allowInField:false},
 {id:'image.remove',label:'Xóa nét',group:'anh',scope:'image',default:bare('Delete'),allowInField:false},
 {id:'image.undo',label:'Hoàn tác ảnh',group:'anh',scope:'image',default:mod('z'),allowInField:true},
 {id:'image.redo',label:'Làm lại ảnh',group:'anh',scope:'image',default:mod('z',{shift:true}),alias:mod('y'),allowInField:true},
];

export const fixedKeys:{label:string;keys:string}[]=[
 {label:'Đóng lớp trên cùng',keys:'Escape'},
 {label:'Kết quả sau trong ô tìm',keys:'Enter'},
 {label:'Kết quả trước trong ô tìm',keys:'Shift+Enter'},
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
 if(reserved(chord))return 'Phím này dành cho trình duyệt';
 if(command.scope==='image')return '';
 if(command.id==='keymap'&&sameChord(chord,bare('?')))return '';
 if(!chord.mod&&!chord.alt)return 'Lệnh này cần Ctrl hoặc Alt';
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
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Keymap không hợp lệ');
 const next:Keymap={};
 for(const [id,value] of Object.entries(input as Record<string,unknown>)){
  const command=commandById(id);
  if(!command)continue;
  if(value===null){next[id]=null;continue;}
  const chord=parseChord(value);
  if(!chord)throw Error('Phím không hợp lệ');
  const reason=chordAllowed(command,chord);
  if(reason)throw Error(reason);
  const other=conflictWith(id,chord,next);
  if(other)throw Error('Đang dùng cho '+other.label);
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
