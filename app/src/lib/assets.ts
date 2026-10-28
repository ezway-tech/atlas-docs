export const MAX_ASSET_SIZE = 50 * 1024 * 1024;
export const ASSET_TYPES: Record<string, string> = {
  png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', gif:'image/gif',
  pdf:'application/pdf', doc:'application/msword', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls:'application/vnd.ms-excel', xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt:'application/vnd.ms-powerpoint', pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt:'text/plain', csv:'text/csv', json:'application/json', zip:'application/zip',
  mp4:'video/mp4', webm:'video/webm', mp3:'audio/mpeg', wav:'audio/wav',
};
export const assetExtension = (name:string) => name.split('.').pop()?.toLowerCase() || '';
export function assetKind(mime:string) {
  if(mime.startsWith('image/')) return 'image';
  if(mime.startsWith('video/')) return 'video';
  if(mime.startsWith('audio/')) return 'audio';
  if(mime==='application/zip') return 'archive';
  return 'document';
}
export const assetAccept = (imagesOnly=false) => Object.entries(ASSET_TYPES).filter(([,mime])=>!imagesOnly||assetKind(mime)==='image').map(([ext])=>'.'+ext).join(',');
export function validateAsset(file:{name:string;size:number;type:string},imagesOnly=false){
  if(!file.size) throw Error('Tệp rỗng.');
  if(file.size>MAX_ASSET_SIZE) throw Error('Tệp vượt quá 50 MB.');
  const ext=assetExtension(file.name), mime=ASSET_TYPES[ext];
  if(!mime || (imagesOnly&&assetKind(mime)!=='image')) throw Error('Định dạng tệp không được hỗ trợ.');
  const aliases:Record<string,string[]>={zip:['application/x-zip-compressed'],wav:['audio/x-wav','audio/wave'],csv:['application/vnd.ms-excel','text/plain'],json:['text/plain']};
  if(file.type && file.type!=='application/octet-stream' && file.type!==mime && !aliases[ext]?.includes(file.type)) throw Error('Đuôi tệp không khớp loại nội dung.');
  if(file.name.length>180 || /[\x00-\x1f/\\]/.test(file.name)) throw Error('Tên tệp không hợp lệ.');
  return {ext:'.'+ext,mime};
}
export const assetSize=(size:number)=>size<1024?`${size} B`:size<1024*1024?`${(size/1024).toFixed(1)} KB`:`${(size/1024/1024).toFixed(1)} MB`;
