/** Shrink a photo before upload. GIF stays intact so the animation survives. */
export async function fitImageFile(file:File,maxEdge=1600):Promise<File>{
  if(file.type==='image/gif'||!file.type.startsWith('image/'))return file;
  const bmp=await createImageBitmap(file);
  try{
    const edge=Math.max(bmp.width,bmp.height);
    if(edge<=maxEdge)return file;
    const scale=maxEdge/edge;
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bmp.width*scale));
    canvas.height=Math.max(1,Math.round(bmp.height*scale));
    const ctx=canvas.getContext('2d');
    if(!ctx)return file;
    ctx.drawImage(bmp,0,0,canvas.width,canvas.height);
    const type=file.type==='image/png'||file.type==='image/webp'||file.type==='image/jpeg'?file.type:'image/png';
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,type,0.92));
    if(!blob)return file;
    return new File([blob],file.name,{type});
  }finally{bmp.close();}
}
