import {mkdir,readFile,rename,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {DATA_ROOT} from './data-root';
import {AppError} from './i18n/errors';

export const JOURNAL_PATH=path.join(DATA_ROOT,'.import-journal.json');
const PREVIOUS_DB=path.join(DATA_ROOT,'.db.json.import-previous');
const DEST:Record<string,true>={
 [path.resolve(DATA_ROOT,'docs')]:true,
 [path.resolve(DATA_ROOT,'uploads')]:true,
 [path.resolve(DATA_ROOT,'history')]:true,
 [path.resolve(DATA_ROOT,'db.json')]:true,
};

export type ImportJournal={status:'preparing'|'committed';stage:string;zip:string|null;previousDb:string|null;removed:string[];committed:string[]};

function insideTmp(target:string){
 const root=path.resolve(os.tmpdir());
 const rel=path.relative(root,path.resolve(target));
 return rel!==''&&!rel.startsWith('..')&&!path.isAbsolute(rel);
}

export async function writeImportJournal(journal:ImportJournal){
 const tmp=JOURNAL_PATH+'.'+crypto.randomUUID()+'.tmp';
 await mkdir(DATA_ROOT,{recursive:true});
 await writeFile(tmp,JSON.stringify(journal));
 await rename(tmp,JOURNAL_PATH);
}

export async function recoverInterruptedImport(){
 let raw:string;
 try{raw=await readFile(JOURNAL_PATH,'utf8');}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}
 const journal=JSON.parse(raw) as ImportJournal;
 if(!journal||(journal.status!=='preparing'&&journal.status!=='committed'))throw new AppError('errors.importJournal.invalid');
 if(journal.stage&&!insideTmp(journal.stage))throw new AppError('errors.importJournal.badStage');
 if(journal.zip&&!insideTmp(journal.zip))throw new AppError('errors.importJournal.badZip');
 if(journal.previousDb&&path.resolve(journal.previousDb)!==path.resolve(PREVIOUS_DB))throw new AppError('errors.importJournal.badDb');
 const exact=(items:string[])=>{for(const item of items)if(!DEST[path.resolve(item)])throw new AppError('errors.importJournal.badPath');};
 exact(journal.removed||[]);exact(journal.committed||[]);
 if(journal.status==='preparing'){
  for(const dest of journal.committed||[])await rm(dest,{recursive:true,force:true});
  for(const dest of journal.removed||[])if(path.resolve(dest)!==path.resolve(DATA_ROOT,'db.json'))await mkdir(dest,{recursive:true});
  if(journal.previousDb)await rename(journal.previousDb,path.join(DATA_ROOT,'db.json'));
 }
 if(journal.stage)await rm(journal.stage,{recursive:true,force:true});
 if(journal.zip)await rm(journal.zip,{force:true});
 if(journal.previousDb)await rm(journal.previousDb,{force:true});
 await rm(JOURNAL_PATH,{force:true});
}
