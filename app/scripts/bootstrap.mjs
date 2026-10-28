import {mkdir,open,readdir,cp,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(process.env.DATA_DIR||path.join(process.cwd(),'..','data'));
const here=path.dirname(fileURLToPath(import.meta.url));
const candidates=[
  path.resolve(here,'..','..','examples','stockroom'),
  path.resolve(here,'..','examples','stockroom'),
  '/opt/stockroom',
];

async function exists(file){
  try{await stat(file);return true;}catch{return false;}
}

async function exampleRoot(){
  for(const dir of candidates){
    if(await exists(path.join(dir,'db.json')))return dir;
  }
  return null;
}

async function libraryEmpty(){
  let names=[];
  try{names=await readdir(path.join(root,'docs'));}catch{names=[];}
  if(names.some(name=>!name.startsWith('.')))return false;
  const file=path.join(root,'db.json');
  if(!(await exists(file)))return true;
  let db;
  try{db=JSON.parse(await readFile(file,'utf8'));}catch{return false;}
  const folders=Array.isArray(db.folders)?db.folders.length:0;
  const assets=Array.isArray(db.assets)?db.assets.length:0;
  const comments=Array.isArray(db.comments)?db.comments.length:0;
  return folders===0&&assets===0&&comments===0;
}

for(const name of ['docs','uploads','history'])await mkdir(path.join(root,name),{recursive:true});

const sample=await exampleRoot();
if(sample&&await libraryEmpty()){
  await cp(sample,root,{recursive:true});
  console.log('[Atlas Docs] seeded Stockroom sample into',root);
}else{
  const file=path.join(root,'db.json');
  try{
    const handle=await open(file,'wx');
    try{await handle.writeFile(JSON.stringify({assets:[],folders:[],comments:[],navigationOrder:{},settings:{theme:'dark',leftWidth:265,rightWidth:335,pinnedFolders:[],hiddenFolders:[]}},null,2));}
    finally{await handle.close();}
  }catch(e){if(e.code!=='EEXIST')throw e;}
}

console.log('[Atlas Docs] data:',root);
