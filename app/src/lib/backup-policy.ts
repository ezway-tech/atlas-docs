export const MIB=1024*1024;

export type BackupLimits={maxUncompressedBytes:number;maxZipBytes:number;maxDataFiles:number};

/** Measured 2026-11-05: 11,001 files and a 130 MiB stored archive imported with about 60 MiB RSS growth. */
export const DEFAULT_BACKUP_LIMITS:BackupLimits={maxUncompressedBytes:140*MIB,maxZipBytes:140*MIB,maxDataFiles:12000};

/** Highest values a user may save. Same as the measured defaults; not raised beyond that run. */
export const BACKUP_LIMIT_CEILING:BackupLimits={maxUncompressedBytes:140*MIB,maxZipBytes:140*MIB,maxDataFiles:12000};

export type BackupManifest={format:'atlas-docs';version:1;createdAt:string;files:Record<string,string>};

const DATA_ROOTS=['docs','uploads','history'] as const;

export function formatBytes(n:number){if(!Number.isFinite(n)||n<0)return '0 B';if(n<1024)return Math.round(n)+' B';if(n<MIB)return Math.round(n/1024)+' KiB';const mib=n/MIB;return (Math.round(mib*10)/10)+' MiB';}

export function tooManyFiles(actual:number,limit:number){return new Error(`Vượt quá ${limit} tệp dữ liệu (đang có ${actual}).`);}
export function tooManyBytes(actual:number,limit:number){return new Error(`Vượt quá ${formatBytes(limit)} dữ liệu chưa nén (đang có ${formatBytes(actual)}).`);}
export function zipTooBig(actual:number,limit:number){return new Error(`Vượt quá ${formatBytes(limit)} dung lượng ZIP (đang có ${formatBytes(actual)}).`);}

function finiteInt(n:unknown):n is number{return typeof n==='number'&&Number.isInteger(n)&&n>=1;}

export function effectiveBackupLimits(settings:{backup?:Partial<BackupLimits>}|null|undefined):BackupLimits{
 const b=settings?.backup;
 const pick=(key:keyof BackupLimits)=>{const n=b?.[key];return finiteInt(n)&&n<=BACKUP_LIMIT_CEILING[key]?n:DEFAULT_BACKUP_LIMITS[key];};
 return {maxUncompressedBytes:pick('maxUncompressedBytes'),maxZipBytes:pick('maxZipBytes'),maxDataFiles:pick('maxDataFiles')};
}

export function parseBackupLimits(input:unknown):BackupLimits{
 if(!input||typeof input!=='object')throw Error('Giới hạn backup không hợp lệ.');
 const o=input as Record<string,unknown>;
 const limits={maxUncompressedBytes:o.maxUncompressedBytes,maxZipBytes:o.maxZipBytes,maxDataFiles:o.maxDataFiles};
 const labels:Record<keyof BackupLimits,string>={maxUncompressedBytes:'Dung lượng chưa nén',maxZipBytes:'Dung lượng ZIP',maxDataFiles:'Số tệp dữ liệu'};
 for(const key of Object.keys(labels) as (keyof BackupLimits)[]){
  const n=limits[key];
  if(!finiteInt(n)||n>BACKUP_LIMIT_CEILING[key])throw Error(`${labels[key]} phải là số nguyên từ 1 đến ${key==='maxDataFiles'?BACKUP_LIMIT_CEILING[key]:formatBytes(BACKUP_LIMIT_CEILING[key])}.`);
 }
 return limits as BackupLimits;
}

export function assertLimits(fileCount:number,uncompressed:number,limits:BackupLimits){
 if(fileCount>limits.maxDataFiles)throw tooManyFiles(fileCount,limits.maxDataFiles);
 if(uncompressed>limits.maxUncompressedBytes)throw tooManyBytes(uncompressed,limits.maxUncompressedBytes);
}

/** Data file, manifest, directory entry, or rejected name. Directory entries are not data files. */
export function classifyEntry(name:string):'data'|'manifest'|'directory'|'invalid'{
 if(!name||name.includes('\\')||name.includes('\0')||name.startsWith('/')||/^[a-zA-Z]:/.test(name))return 'invalid';
 if(name.split('/').some(part=>part==='..'))return 'invalid';
 const directory=name.endsWith('/');
 const trimmed=directory?name.slice(0,-1):name;
 if(!trimmed||trimmed.split('/').some(part=>!part||part==='.'||part==='..'||part.startsWith('.')))return 'invalid';
 if(!directory&&trimmed==='atlas-manifest.json')return 'manifest';
 if(trimmed==='db.json')return directory?'invalid':'data';
 const top=trimmed.split('/')[0];
 if(!DATA_ROOTS.includes(top as typeof DATA_ROOTS[number]))return 'invalid';
 if(directory)return trimmed===top||trimmed.startsWith(top+'/')?'directory':'invalid';
 return 'data';
}

export function assertManifest(manifest:unknown,actual:Map<string,string>){
 if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))throw Error('Không phải bản sao lưu Atlas.');
 const m=manifest as {format?:unknown;version?:unknown;files?:unknown};
 if(m.format!=='atlas-docs'||m.version!==1||!m.files||typeof m.files!=='object'||Array.isArray(m.files))throw Error('Không phải bản sao lưu Atlas.');
 if(!actual.has('db.json'))throw Error('Không phải bản sao lưu Atlas.');
 const files=m.files as Record<string,unknown>;
 const keys=Object.keys(files);
 if(new Set(keys).size!==keys.length)throw Error('Tên tệp trùng trong manifest.');
 if(keys.length!==actual.size)throw Error(`Danh sách tệp không khớp manifest (${actual.size} tệp, manifest ghi ${keys.length}).`);
 for(const key of keys){
  if(typeof files[key]!=='string'||!actual.has(key))throw Error('Danh sách tệp không khớp manifest: '+key);
  if(files[key]!==actual.get(key))throw Error('Checksum không khớp: '+key);
 }
 for(const key of actual.keys())if(!(key in files))throw Error('Danh sách tệp không khớp manifest: '+key);
}

export function assertDatabaseShape(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Cơ sở dữ liệu không hợp lệ.');
 const db=value as Record<string,unknown>;
 if(!Array.isArray(db.comments)||!Array.isArray(db.folders)||!Array.isArray(db.assets))throw Error('Cơ sở dữ liệu không hợp lệ.');
 for(const asset of db.assets){
  if(!asset||typeof asset!=='object')throw Error('Cơ sở dữ liệu không hợp lệ.');
  const row=asset as Record<string,unknown>;
  if(typeof row.id!=='string'||typeof row.storedName!=='string')throw Error('Cơ sở dữ liệu không hợp lệ.');
  if(!row.storedName||row.storedName.includes('/')||row.storedName.includes('\\')||row.storedName.includes('..')||row.storedName.startsWith('.'))throw Error('Liên kết tệp đính kèm không hợp lệ.');
 }
 for(const folder of db.folders){
  if(!folder||typeof folder!=='object')throw Error('Cơ sở dữ liệu không hợp lệ.');
  const row=folder as Record<string,unknown>;
  if(typeof row.path!=='string'||row.path.includes('..')||row.path.includes('\\'))throw Error('Liên kết thư mục không hợp lệ.');
  if(row.imageId!=null&&typeof row.imageId!=='string')throw Error('Liên kết ảnh bìa không hợp lệ.');
 }
 for(const comment of db.comments){
  if(!comment||typeof comment!=='object')throw Error('Cơ sở dữ liệu không hợp lệ.');
  const row=comment as Record<string,unknown>;
  if(typeof row.content!=='string'||typeof row.docId!=='string')throw Error('Liên kết bình luận không hợp lệ.');
 }
}
