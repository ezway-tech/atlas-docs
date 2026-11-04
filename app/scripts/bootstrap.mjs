import {mkdir,open} from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(process.env.DATA_DIR||path.join(process.cwd(),'..','data'));
for(const name of ['docs','uploads','history'])await mkdir(path.join(root,name),{recursive:true});

{
  const file=path.join(root,'db.json');
  try{
    const handle=await open(file,'wx');
    try{await handle.writeFile(JSON.stringify({assets:[],folders:[],comments:[],navigationOrder:{},settings:{theme:'dark',leftWidth:265,rightWidth:335,pinnedFolders:[],hiddenFolders:[],keymap:{}}},null,2));}
    finally{await handle.close();}
  }catch(e){if(e.code!=='EEXIST')throw e;}
}

console.log('[Atlas Docs] data:',root);
