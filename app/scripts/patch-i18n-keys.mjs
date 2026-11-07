import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const dir=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','src','lib','i18n','messages');
const extras={
 en:{
  'storage.limit.zipEstimate':'Estimated ZIP size',
  'editor.insertSample.col1':'Column 1',
  'editor.insertSample.col2':'Column 2',
  'common.choose':'Choose…',
  'common.hexColor':'HEX color',
  'keymap.provider.missing':'Keymap is not available',
 },
 vi:{
  'storage.limit.zipEstimate':'Ước tính ZIP',
  'editor.insertSample.col1':'Cột 1',
  'editor.insertSample.col2':'Cột 2',
  'common.choose':'Chọn…',
  'common.hexColor':'Mã màu HEX',
  'keymap.provider.missing':'Keymap chưa được bật',
 },
 'zh-Hans':{
  'storage.limit.zipEstimate':'预估 ZIP 大小',
  'editor.insertSample.col1':'列 1',
  'editor.insertSample.col2':'列 2',
  'common.choose':'选择…',
  'common.hexColor':'十六进制颜色',
  'keymap.provider.missing':'快捷键不可用',
  'storage.limit.zip':'ZIP 大小',
 },
 es:{
  'storage.limit.zipEstimate':'Tamaño ZIP estimado',
  'editor.insertSample.col1':'Columna 1',
  'editor.insertSample.col2':'Columna 2',
  'common.choose':'Elegir…',
  'common.hexColor':'Color HEX',
  'keymap.provider.missing':'El mapa de teclas no está disponible',
  'storage.limit.zip':'Tamaño ZIP',
 },
 ja:{
  'storage.limit.zipEstimate':'ZIP 推定サイズ',
  'editor.insertSample.col1':'列 1',
  'editor.insertSample.col2':'列 2',
  'common.choose':'選択…',
  'common.hexColor':'HEX カラー',
  'keymap.provider.missing':'キーマップが利用できません',
 },
};

for(const [locale,keys] of Object.entries(extras)){
 const file=path.join(dir,`${locale}.ts`);
 let src=fs.readFileSync(file,'utf8');
 for(const [key,value] of Object.entries(keys)){
  const line=` ${JSON.stringify(key)}:${JSON.stringify(value)},`;
  if(src.includes(JSON.stringify(key))){
   src=src.replace(new RegExp(` ${JSON.stringify(key)}:[^,]+,`),line);
  }else{
   src=src.replace(/\n\};\n\nexport default messages;\n$/,`\n${line}\n};\n\nexport default messages;\n`);
  }
 }
 fs.writeFileSync(file,src);
 console.log('patched',locale);
}
