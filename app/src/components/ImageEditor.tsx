'use client';
import React,{forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {MousePointer2,Crop,Pencil,ArrowUpRight,Square,Type,Undo2,Redo2} from 'lucide-react';
import {MAX_ASSET_SIZE} from '@/lib/assets';
import {useKeymap} from './KeymapProvider';

type Tool='select'|'crop'|'pen'|'arrow'|'rect'|'text';
type ShapeTool='pen'|'arrow'|'rect'|'text';
type Point={x:number;y:number};
type Box={x:number;y:number;w:number;h:number};
type Shape={id:string;tool:ShapeTool;points:Point[];color:string;width:number;fontSize:number;text?:string};
type Step=
 |{kind:'add';shape:Shape}
 |{kind:'remove';shape:Shape;index:number}
 |{kind:'change';id:string;before:Shape;after:Shape;coalesce?:'text'|'font'}
 |{kind:'crop';beforeImage:HTMLCanvasElement;afterImage:HTMLCanvasElement;beforeShapes:Shape[];afterShapes:Shape[]};
type Gesture=
 |{kind:'draw';pointerId:number;shape:Shape}
 |{kind:'crop';pointerId:number;points:Point[]}
 |{kind:'move';pointerId:number;id:string;origin:Point;start:Shape;live:Shape}
 |{kind:'resize';pointerId:number;id:string;handle:number;start:Shape;live:Shape};
export type ImageEditorHandle={requestCancel:()=>void};
type Props={src:string;filename:string;gif:boolean;replace?:boolean;saveLabel?:string;keepName?:boolean;onCancel:()=>void;onSave:(file:File)=>Promise<void>};
const toolItems=[{id:'select',label:'Chọn',Icon:MousePointer2},{id:'crop',label:'Cắt',Icon:Crop},{id:'pen',label:'Vẽ',Icon:Pencil},{id:'arrow',label:'Mũi tên',Icon:ArrowUpRight},{id:'rect',label:'Khung',Icon:Square},{id:'text',label:'Chữ',Icon:Type}] as const;
const shapeLabel:Record<ShapeTool,string>={pen:'nét vẽ',arrow:'mũi tên',rect:'khung',text:'chữ'};

function cloneShape(s:Shape):Shape{return {...s,points:s.points.map(p=>({...p}))};}
function copyCanvas(src:HTMLCanvasElement){const c=document.createElement('canvas');c.width=src.width;c.height=src.height;c.getContext('2d')!.drawImage(src,0,0);return c;}
function screenScale(canvas:HTMLCanvasElement){const rect=canvas.getBoundingClientRect();return rect.width?canvas.width/rect.width:1;}
function near(a:Point,b:Point,dist:number){return (a.x-b.x)**2+(a.y-b.y)**2<=dist*dist;}
function distToSegment(p:Point,a:Point,b:Point){const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;const t=len?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len)):0;return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy));}
function tightBox(shape:Shape):Box{const xs=shape.points.map(p=>p.x),ys=shape.points.map(p=>p.y);const x=Math.min(...xs),y=Math.min(...ys);return {x,y,w:Math.max(1,Math.max(...xs)-x),h:Math.max(1,Math.max(...ys)-y)};}
function intersects(a:Box,b:Box){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
function corners(box:Box):Point[]{return [{x:box.x,y:box.y},{x:box.x+box.w,y:box.y},{x:box.x+box.w,y:box.y+box.h},{x:box.x,y:box.y+box.h}];}
function sameShape(a:Shape,b:Shape){return a.fontSize===b.fontSize&&a.text===b.text&&a.color===b.color&&a.width===b.width&&a.points.length===b.points.length&&a.points.every((p,i)=>p.x===b.points[i].x&&p.y===b.points[i].y);}

function textBox(shape:Shape,ctx:CanvasRenderingContext2D|null):Box{
 const lines=(shape.text||'').split('\n');
 let width=Math.max(8,shape.fontSize);
 if(ctx){ctx.save();ctx.font=`${shape.fontSize}px sans-serif`;width=Math.max(width,...lines.map(line=>ctx.measureText(line||' ').width));ctx.restore();}
 else width=Math.max(width,...lines.map(line=>line.length*shape.fontSize*0.6));
 return {x:shape.points[0].x,y:shape.points[0].y,w:width,h:Math.max(shape.fontSize,lines.length*shape.fontSize*1.3)};
}
function boxOf(shape:Shape,ctx:CanvasRenderingContext2D|null):Box{
 if(shape.tool==='text')return textBox(shape,ctx);
 const box=tightBox(shape),pad=shape.width/2+2;
 return {x:box.x-pad,y:box.y-pad,w:box.w+pad*2,h:box.h+pad*2};
}
 function handlePoints(shape:Shape,ctx:CanvasRenderingContext2D|null):Point[]{
 if(shape.tool==='arrow')return [shape.points[0],shape.points[shape.points.length-1]];
 return corners(shape.tool==='text'?textBox(shape,ctx):tightBox(shape));
}
function handleAt(shape:Shape,p:Point,reach:number,ctx:CanvasRenderingContext2D|null){
 const handles=handlePoints(shape,ctx);
 let best=-1,bestD=reach;
 handles.forEach((h,i)=>{const d=Math.hypot(h.x-p.x,h.y-p.y);if(d<=bestD){best=i;bestD=d;}});
 if(best<0||shape.tool==='arrow')return best;
 const box=shape.tool==='text'?textBox(shape,ctx):tightBox(shape);
 const inset=Math.min(reach,Math.min(box.w,box.h)/3);
 if(p.x>box.x+inset&&p.x<box.x+box.w-inset&&p.y>box.y+inset&&p.y<box.y+box.h-inset)return -1;
 return best;
}
function drawShape(canvas:HTMLCanvasElement,shape:Shape){
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Trình duyệt không hỗ trợ vẽ ảnh.');
 const a=shape.points[0],b=shape.points.at(-1)!;
 ctx.save();ctx.strokeStyle=ctx.fillStyle=shape.color;ctx.lineWidth=shape.width;ctx.lineCap='round';ctx.lineJoin='round';
 if(shape.tool==='pen'){ctx.beginPath();ctx.moveTo(a.x,a.y);for(const p of shape.points)ctx.lineTo(p.x,p.y);ctx.stroke();if(shape.points.length===1){ctx.beginPath();ctx.arc(a.x,a.y,shape.width/2,0,Math.PI*2);ctx.fill();}}
 if(shape.tool==='rect')ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);
 if(shape.tool==='arrow'){const angle=Math.atan2(b.y-a.y,b.x-a.x),size=Math.max(10,shape.width*4);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-size*Math.cos(angle-.4),b.y-size*Math.sin(angle-.4));ctx.lineTo(b.x-size*Math.cos(angle+.4),b.y-size*Math.sin(angle+.4));ctx.closePath();ctx.fill();}
 if(shape.tool==='text'){ctx.font=`${shape.fontSize}px sans-serif`;ctx.textBaseline='top';(shape.text||'').split('\n').forEach((line,i)=>ctx.fillText(line,a.x,a.y+i*shape.fontSize*1.3));}
 ctx.restore();
}
function paintCrop(canvas:HTMLCanvasElement,a:Point,b:Point){
 const ctx=canvas.getContext('2d');if(!ctx)return;
 const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),w=Math.abs(b.x-a.x),h=Math.abs(b.y-a.y),scale=screenScale(canvas);
 ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.fillStyle='#10182844';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.clearRect(x,y,w,h);
 ctx.setLineDash([6*scale,4*scale]);ctx.strokeStyle='#4c68e5';ctx.lineWidth=Math.max(1,2*scale);ctx.strokeRect(x,y,w,h);ctx.restore();
}
function paintSelection(canvas:HTMLCanvasElement,shape:Shape){
 const ctx=canvas.getContext('2d');if(!ctx)return;
 const box=boxOf(shape,ctx),scale=screenScale(canvas),radius=5*scale;
 ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.strokeStyle='#4c68e5';ctx.fillStyle='#fff';ctx.lineWidth=Math.max(1,1.5*scale);ctx.setLineDash([5*scale,4*scale]);ctx.strokeRect(box.x,box.y,box.w,box.h);ctx.setLineDash([]);
 for(const handle of handlePoints(shape,ctx)){ctx.beginPath();ctx.arc(handle.x,handle.y,radius,0,Math.PI*2);ctx.fill();ctx.stroke();}
 ctx.restore();
}
function moved(start:Shape,origin:Point,p:Point):Shape{const dx=p.x-origin.x,dy=p.y-origin.y;return {...cloneShape(start),points:start.points.map(q=>({x:q.x+dx,y:q.y+dy}))};}
function resized(start:Shape,handle:number,p:Point,ctx:CanvasRenderingContext2D|null):Shape{
 const next=cloneShape(start);
 if(start.tool==='arrow'){const last=start.points.length-1;next.points=start.points.map(pt=>({...pt}));if(handle===0)next.points[0]={...p};else next.points[last]={...p};return next;}
 const box=start.tool==='text'?textBox(start,ctx):tightBox(start);
 const marks=corners(box),anchor=marks[(handle+2)%4],origin=marks[handle];
 const scale=Math.hypot(p.x-anchor.x,p.y-anchor.y)/Math.max(1,Math.hypot(origin.x-anchor.x,origin.y-anchor.y));
 if(start.tool==='text'){next.fontSize=Math.max(12,Math.min(72,Math.round(start.fontSize*Math.max(0.2,scale))));return next;}
 if(start.tool==='rect'){const x=Math.min(anchor.x,p.x),y=Math.min(anchor.y,p.y),w=Math.max(4,Math.abs(p.x-anchor.x)),h=Math.max(4,Math.abs(p.y-anchor.y));next.points=[{x,y},{x:x+w,y:y+h}];return next;}
 const factor=Math.max(0.15,scale);
 next.points=start.points.map(pt=>({x:anchor.x+(pt.x-anchor.x)*factor,y:anchor.y+(pt.y-anchor.y)*factor}));
 return next;
}

const ImageEditor=forwardRef<ImageEditorHandle,Props>(function ImageEditor({src,filename,gif,replace=false,saveLabel,keepName=false,onCancel,onSave},ref){
 const root=useRef<HTMLDivElement>(null),base=useRef<HTMLCanvasElement>(null),overlay=useRef<HTMLCanvasElement>(null),checkpoint=useRef<HTMLCanvasElement|null>(null);
 const history=useRef<{past:Step[];future:Step[]}>({past:[],future:[]}),gesture=useRef<Gesture|null>(null),saveLock=useRef(false),bakedCrop=useRef(false),seq=useRef(0);
 const shapesRef=useRef<Shape[]>([]),selectedRef=useRef<string|null>(null),cropRef=useRef<Point[]|null>(null),textEdit=useRef<{id:string;before:Shape}|null>(null),fontEdit=useRef<{id:string;before:Shape}|null>(null);
 const actions=useRef({escape:()=>{},undo:(_redo=false)=>{void _redo;},remove:()=>{},pick:(_id:Tool)=>{void _id;}});
 const km=useKeymap();
 const paintRef=useRef(()=>{});
 const [tool,setTool]=useState<Tool>('pen'),[ready,setReady]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const [color,setColor]=useState('#d92d20'),[width,setWidth]=useState(3),[fontSize,setFontSize]=useState(24),[text,setText]=useState(''),[crop,setCrop]=useState<Point[]|null>(null),[counts,setCounts]=useState({undo:0,redo:0}),[size,setSize]=useState({w:0,h:0}),[discard,setDiscard]=useState(false);
 const [shapes,setShapes]=useState<Shape[]>([]),[selected,setSelected]=useState<string|null>(null);
 const cancelButton=useRef<HTMLButtonElement>(null),continueButton=useRef<HTMLButtonElement>(null),returnCancel=useRef(false);
 const textRef=useRef(text);textRef.current=text;
 function remember(next:Shape[],sel:string|null){shapesRef.current=next;selectedRef.current=sel;setShapes(next);setSelected(sel);}
 function paint(list?:Shape[]){
  const canvas=base.current,original=checkpoint.current,layer=overlay.current;if(!canvas||!original||!layer)return;
  const shown=list??(()=>{const g=gesture.current;if(g&&(g.kind==='move'||g.kind==='resize'))return shapesRef.current.map(s=>s.id===g.id?g.live:s);return shapesRef.current;})();
  canvas.width=original.width;canvas.height=original.height;canvas.getContext('2d')!.drawImage(original,0,0);for(const shape of shown)drawShape(canvas,shape);
  layer.width=canvas.width;layer.height=canvas.height;
  const g=gesture.current;
  if(g?.kind==='crop')paintCrop(layer,g.points[0],g.points.at(-1)!);
  else if(cropRef.current)paintCrop(layer,cropRef.current[0],cropRef.current[1]);
  else if(g?.kind==='draw')drawShape(layer,g.shape);
  else{const sel=shown.find(s=>s.id===selectedRef.current);if(sel)paintSelection(layer,sel);}
  setSize(s=>s.w===canvas.width&&s.h===canvas.height?s:{w:canvas.width,h:canvas.height});
 }
 paintRef.current=paint;
 function countsOf(){setCounts({undo:history.current.past.length,redo:history.current.future.length});}
 function pushStep(step:Step){
  const past=history.current.past,last=past.at(-1);
  if(step.kind==='change'&&step.coalesce&&last?.kind==='change'&&last.coalesce===step.coalesce&&last.id===step.id){if(sameShape(step.before,step.after))past.pop();else past[past.length-1]=step;}
  else{if(step.kind==='change'&&step.coalesce&&sameShape(step.before,step.after))return;past.push(step);if(past.length>20){const dropped=past.shift();if(dropped?.kind==='crop')bakedCrop.current=true;}}
  history.current.future=[];countsOf();
 }
 function applyStep(step:Step,reverse:boolean){
  let next=shapesRef.current.map(cloneShape),sel=selectedRef.current;
  if(step.kind==='add'){next=reverse?next.filter(s=>s.id!==step.shape.id):[...next,cloneShape(step.shape)];sel=reverse?null:step.shape.id;}
  else if(step.kind==='remove'){if(reverse){next=[...next];next.splice(Math.min(step.index,next.length),0,cloneShape(step.shape));sel=step.shape.id;}else{next=next.filter(s=>s.id!==step.shape.id);if(sel===step.shape.id)sel=null;}}
  else if(step.kind==='change'){const src=reverse?step.before:step.after;next=next.map(s=>s.id===step.id?cloneShape(src):s);sel=step.id;}
  else{checkpoint.current=copyCanvas(reverse?step.beforeImage:step.afterImage);next=(reverse?step.beforeShapes:step.afterShapes).map(cloneShape);sel=null;}
  textEdit.current=null;fontEdit.current=null;remember(next,sel);paint(next);
 }
 function undo(redo=false){if(saveLock.current||gesture.current)return;const from=redo?history.current.future:history.current.past,step=from.pop();if(!step)return;applyStep(step,!redo);(redo?history.current.past:history.current.future).push(step);countsOf();}
 function hitTest(p:Point,reach:number,includePen:boolean){const ctx=base.current?.getContext('2d')??null;const list=shapesRef.current;for(let i=list.length-1;i>=0;i--){const s=list[i];if(s.tool==='pen'&&!includePen)continue;if(s.tool==='text'||s.tool==='rect'){const b=boxOf(s,ctx);if(p.x>=b.x-reach&&p.x<=b.x+b.w+reach&&p.y>=b.y-reach&&p.y<=b.y+b.h+reach)return s;}else if(s.tool==='arrow'){if(distToSegment(p,s.points[0],s.points.at(-1)!)<=Math.max(s.width,reach))return s;}else{const pts=s.points;for(let k=1;k<pts.length;k++)if(distToSegment(p,pts[k-1],pts[k])<=Math.max(s.width/2+2,reach))return s;if(pts.length===1&&near(p,pts[0],Math.max(s.width,reach)))return s;}}return null;}
 function choose(id:string|null){if(selectedRef.current!==id){textEdit.current=null;fontEdit.current=null;}selectedRef.current=id;setSelected(id);paint();}
 function placeCrop(points:Point[]|null){cropRef.current=points;setCrop(points);paint();}
 function updateShape(id:string,after:Shape,coalesce:'text'|'font',edit:React.MutableRefObject<{id:string;before:Shape}|null>){
  const current=shapesRef.current.find(s=>s.id===id);if(!current)return;
  (coalesce==='text'?fontEdit:textEdit).current=null;
  if(!edit.current||edit.current.id!==id)edit.current={id,before:cloneShape(current)};
  const next=shapesRef.current.map(s=>s.id===id?after:s);
  remember(next,id);pushStep({kind:'change',id,before:edit.current.before,after:cloneShape(after),coalesce});paint(next);
 }
 function removeSelected(){
  const id=selectedRef.current;if(!id||gesture.current||saveLock.current)return;
  const index=shapesRef.current.findIndex(s=>s.id===id);if(index<0)return;
  const shape=cloneShape(shapesRef.current[index]),next=shapesRef.current.filter(s=>s.id!==id);
  textEdit.current=null;fontEdit.current=null;remember(next,null);pushStep({kind:'remove',shape,index});paint(next);setError('');
 }
 function applyCrop(points:Point[]){
  const original=checkpoint.current;if(!original)return;
  const a=points[0],b=points[1],x=Math.floor(Math.min(a.x,b.x)),y=Math.floor(Math.min(a.y,b.y));
  const w=Math.max(1,Math.round(Math.abs(b.x-a.x))),h=Math.max(1,Math.round(Math.abs(b.y-a.y)));
  const beforeImage=copyCanvas(original),beforeShapes=shapesRef.current.map(cloneShape);
  const nextImage=document.createElement('canvas');nextImage.width=w;nextImage.height=h;nextImage.getContext('2d')!.drawImage(original,x,y,w,h,0,0,w,h);
  const area={x:0,y:0,w,h};
  const nextShapes=beforeShapes.map(s=>({...s,points:s.points.map(p=>({x:p.x-x,y:p.y-y}))})).filter(s=>intersects(boxOf(s,nextImage.getContext('2d')),area));
  checkpoint.current=nextImage;cropRef.current=null;setCrop(null);remember(nextShapes,null);
  pushStep({kind:'crop',beforeImage,afterImage:copyCanvas(nextImage),beforeShapes,afterShapes:nextShapes.map(cloneShape)});paint(nextShapes);
 }
 useEffect(()=>{let cancelled=false;setReady(false);setError('');placeCrop(null);setDiscard(false);history.current={past:[],future:[]};bakedCrop.current=false;gesture.current=null;seq.current=0;remember([],null);setText('');const img=new Image();img.onload=()=>{if(cancelled)return;try{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');if(!ctx||!c.width||!c.height)throw Error('Không thể mở ảnh này.');ctx.drawImage(img,0,0);checkpoint.current=c;paint([]);setReady(true);}catch(e){setError((e as Error).message);}};img.onerror=()=>{if(!cancelled)setError('Không tải được ảnh. Hãy thử lại.');};img.src=src;return()=>{cancelled=true;checkpoint.current=null;gesture.current=null;};},[src,retry]);
 useEffect(()=>{root.current?.focus({preventScroll:true});},[]);
 useEffect(()=>{if(discard)continueButton.current?.focus();else if(returnCancel.current){returnCancel.current=false;cancelButton.current?.focus();}},[discard]);
 useEffect(()=>{const canvas=overlay.current;if(!ready||!canvas)return;const observer=new ResizeObserver(()=>paintRef.current());observer.observe(canvas);return()=>observer.disconnect();},[ready]);
 useEffect(()=>{const offs=[...toolItems.map(({id})=>km.register('image.'+id,()=>actions.current.pick(id))),km.register('image.remove',()=>actions.current.remove()),km.register('image.undo',()=>actions.current.undo(false)),km.register('image.redo',()=>actions.current.undo(true)),km.pushLayer('image',80,()=>{actions.current.escape();return true;}),km.enterImage()];return ()=>offs.forEach(off=>off());},[km]);
 function dirty(){return bakedCrop.current||history.current.past.some(s=>s.kind==='crop')||shapesRef.current.length>0||!!cropRef.current||!!gesture.current||(!!textRef.current.trim()&&shapesRef.current.every(s=>s.id!==selectedRef.current||s.tool!=='text'));}
 function requestCancel(){if(saveLock.current)return;if(dirty()){if(gesture.current){gesture.current=null;paint();}setDiscard(true);}else onCancel();}
 useImperativeHandle(ref,()=>({requestCancel}));
 function point(e:React.PointerEvent):Point{const c=base.current!,r=c.getBoundingClientRect(),sx=r.width?c.width/r.width:1,sy=r.height?c.height/r.height:1;return {x:Math.max(0,Math.min(c.width,(e.clientX-r.left)*sx)),y:Math.max(0,Math.min(c.height,(e.clientY-r.top)*sy))};}
 function down(e:React.PointerEvent<HTMLCanvasElement>){
  if(!ready||saveLock.current||discard||gesture.current||!e.isPrimary||e.button!==0||!base.current)return;
  e.preventDefault();
  const p=point(e),reach=8*screenScale(base.current),ctx=base.current.getContext('2d');
  const hold=()=>{try{e.currentTarget.setPointerCapture(e.pointerId);}catch{/* con trỏ giả lập không giữ được */}};
  const includePen=tool==='select';
  if(tool!=='pen'&&tool!=='crop'){
   if(selectedRef.current){const shape=shapesRef.current.find(s=>s.id===selectedRef.current);if(shape&&(includePen||shape.tool!=='pen')){const index=handleAt(shape,p,10*screenScale(base.current!),ctx);if(index>=0){textEdit.current=null;fontEdit.current=null;placeCrop(null);hold();gesture.current={kind:'resize',pointerId:e.pointerId,id:shape.id,handle:index,start:cloneShape(shape),live:cloneShape(shape)};return;}}}
   const hit=hitTest(p,reach,includePen);if(hit){textEdit.current=null;fontEdit.current=null;placeCrop(null);hold();choose(hit.id);setError('');gesture.current={kind:'move',pointerId:e.pointerId,id:hit.id,origin:p,start:cloneShape(hit),live:cloneShape(hit)};return;}
   if(tool==='select'){choose(null);return;}
  }
  textEdit.current=null;fontEdit.current=null;placeCrop(null);hold();
  if(tool==='crop'){gesture.current={kind:'crop',pointerId:e.pointerId,points:[p,p]};paint();return;}
  const active=shapesRef.current.find(s=>s.id===selectedRef.current&&s.tool==='text');
  gesture.current={kind:'draw',pointerId:e.pointerId,shape:{id:'s'+(++seq.current),tool:tool as ShapeTool,points:[p],color,width,fontSize:active?.fontSize??fontSize,text:(active?.text??textRef.current).trim()}};
  paint();
 }
 function move(e:React.PointerEvent<HTMLCanvasElement>){
  const g=gesture.current;if(!g||g.pointerId!==e.pointerId)return;const p=point(e);
  if(g.kind==='crop')g.points=[g.points[0],p];
  else if(g.kind==='draw')g.shape={...g.shape,points:g.shape.tool==='pen'?[...g.shape.points,p]:g.shape.tool==='text'?[p]:[g.shape.points[0],p]};
  else if(g.kind==='move')g.live=moved(g.start,g.origin,p);
  else g.live=resized(g.start,g.handle,p,base.current?.getContext('2d')??null);
  paint();
 }
 function up(e:React.PointerEvent<HTMLCanvasElement>){
  const g=gesture.current;if(!g||g.pointerId!==e.pointerId)return;move(e);gesture.current=null;try{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}catch{/* đã thả */};
  if(g.kind==='crop'){const [a,b]=g.points;if(Math.abs(a.x-b.x)>=4&&Math.abs(a.y-b.y)>=4)placeCrop(g.points);else placeCrop(null);return;}
  if(g.kind==='draw'){const shape=g.shape;if(shape.tool==='text'&&!shape.text){setError('Nhập chữ chú thích rồi chọn vị trí trên ảnh.');paint();return;}if(shape.tool==='arrow'||shape.tool==='rect'){const a=shape.points[0],b=shape.points.at(-1)!;if(shape.points.length<2||Math.hypot(a.x-b.x,a.y-b.y)<4){paint();return;}}const next=[...shapesRef.current,shape];const sel=shape.tool==='pen'?null:shape.id;if(shape.tool==='text')setText('');remember(next,sel);pushStep({kind:'add',shape:cloneShape(shape)});setError('');paint(next);return;}
  if(!sameShape(g.start,g.live)){textEdit.current=null;fontEdit.current=null;const next=shapesRef.current.map(s=>s.id===g.id?g.live:s);remember(next,g.id);pushStep({kind:'change',id:g.id,before:g.start,after:cloneShape(g.live)});paint(next);}else paint();
 }
 function cancelGesture(e:React.PointerEvent){if(gesture.current?.pointerId!==e.pointerId)return;gesture.current=null;paint();}
 async function save(){if(!ready||!base.current||saveLock.current||gesture.current)return;saveLock.current=true;setSaving(true);setError('');try{const blob=await new Promise<Blob|null>(resolve=>base.current!.toBlob(resolve,'image/png'));if(!blob)throw Error('Không xuất được ảnh. Hãy thử cắt ảnh nhỏ hơn.');if(blob.size>MAX_ASSET_SIZE)throw Error('Ảnh PNG vượt quá 50 MB. Hãy cắt ảnh nhỏ hơn rồi lưu lại.');const name=keepName?filename:filename.replace(/\.[^.]+$/,'').slice(0,169)+'-edited.png';await onSave(new File([blob],name,{type:'image/png'}));}catch(e){setError((e as Error).message||'Không lưu được ảnh. Hãy thử lại.');}finally{saveLock.current=false;setSaving(false);}}
 actions.current.escape=()=>{if(discard){returnCancel.current=true;setDiscard(false);}else requestCancel();};
 actions.current.undo=redo=>{if(!discard)undo(redo);};
 actions.current.remove=()=>{if(!discard)removeSelected();};
 actions.current.pick=id=>{if(discard||saveLock.current)return;gesture.current=null;setTool(id);if(id==='pen'||id==='crop')choose(null);placeCrop(null);};
 const activeText=shapes.find(s=>s.id===selected&&s.tool==='text');
 const shownText=activeText?activeText.text||'':text,shownFont=activeText?activeText.fontSize:fontSize;
 const toolLabel=toolItems.find(t=>t.id===tool)?.label,cropBox=crop?(()=>{const a=crop[0],b=crop[1];return `${Math.max(1,Math.round(Math.abs(b.x-a.x)))} × ${Math.max(1,Math.round(Math.abs(b.y-a.y)))} px`;})():'';
 const selectedShape=shapes.find(s=>s.id===selected);
 return <div ref={root} tabIndex={-1} className="image-editor sketch-editor" aria-busy={saving}>
  <p className="sketch-intro">{replace?'Chỉnh sửa ảnh đang dùng trong thư viện.':'Vẽ chú thích rồi lưu một bản mới để chèn vào bài. Ảnh gốc được giữ nguyên.'}</p>
  {gif&&<p className="resource-notice">{replace?'GIF sau khi lưu đè sẽ thành PNG tĩnh ở cùng địa chỉ.':'Bản chỉnh sửa GIF là ảnh PNG tĩnh. GIF gốc được giữ nguyên.'}</p>}
  <fieldset className="sketch-controls" disabled={!ready||saving||discard}>
   <div className="image-tools" aria-label="Công cụ chỉnh sửa">{toolItems.map(({id,label,Icon})=>{const key=km.text('image.'+id);return <button type="button" key={id} aria-pressed={tool===id} className={tool===id?'active':''} onClick={()=>actions.current.pick(id)}><Icon size={16}/>{label}{key&&<kbd>{key}</kbd>}</button>;})}<span className="sketch-separator"/><button type="button" aria-label="Hoàn tác" disabled={!counts.undo} onClick={()=>undo()}><Undo2 size={16}/>{km.text('image.undo')&&<kbd>{km.text('image.undo')}</kbd>}</button><button type="button" aria-label="Làm lại" disabled={!counts.redo} onClick={()=>undo(true)}><Redo2 size={16}/>{km.text('image.redo')&&<kbd>{km.text('image.redo')}</kbd>}</button></div>
   <div className="sketch-options"><label>Màu<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label><label>Độ dày nét<input type="range" min={1} max={20} value={width} onChange={e=>setWidth(+e.target.value)}/><output>{width} px</output></label>{(tool==='text'||activeText)&&<label>Cỡ chữ<input type="number" min={12} max={72} value={shownFont} onChange={e=>{const next=Math.max(12,Math.min(72,+e.target.value||12));const current=shapesRef.current.find(s=>s.id===selectedRef.current&&s.tool==='text');if(current)updateShape(current.id,{...cloneShape(current),fontSize:next},'font',fontEdit);else setFontSize(next);}}/></label>}{tool==='crop'&&<button type="button" className="btn ghost" disabled={!crop} onClick={()=>crop&&applyCrop(crop)}>Cắt vùng này</button>}{selectedShape&&<button type="button" className="btn ghost" onClick={removeSelected}>Xóa hình</button>}</div>
   {(tool==='text'||activeText)&&<label className="sketch-text">{activeText?'Sửa chữ đang chọn':'Chữ chú thích'}<textarea rows={2} value={shownText} onChange={e=>{const value=e.target.value;const current=shapesRef.current.find(s=>s.id===selectedRef.current&&s.tool==='text');if(current)updateShape(current.id,{...cloneShape(current),text:value},'text',textEdit);else setText(value);}} placeholder={activeText?'Sửa chữ, rồi kéo chữ trên ảnh để dời':'Nhập chữ, sau đó nhấn vào vị trí trên ảnh'}/></label>}
  </fieldset>
  {error&&<div className="resource-notice" role="alert">{error}{!ready&&<button className="btn ghost" onClick={()=>setRetry(v=>v+1)}>Thử tải lại</button>}</div>}
  {!ready&&!error&&<p role="status">Đang tải ảnh…</p>}
  <div className="sketch-workspace"><div className="image-stage" style={size.w?{aspectRatio:`${size.w} / ${size.h}`,width:`min(100%, ${size.w}px, 100cqi, calc(100cqb * ${size.w} / ${size.h}))`}:undefined}><canvas ref={base}/><canvas ref={overlay} className="image-overlay" aria-label="Vùng vẽ trên ảnh" style={{cursor:tool==='select'?'default':'crosshair'}} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancelGesture} onLostPointerCapture={cancelGesture}/></div></div>
  <div className="sketch-status"><span>{size.w} × {size.h} px · {toolLabel}{selectedShape?` · Đang chọn ${shapeLabel[selectedShape.tool]}`:''}{cropBox?` · Vùng cắt ${cropBox}`:''}{saving?' · Đang lưu…':''}</span><span>Hoàn tác tối đa 20 thao tác</span></div>
  {crop&&<p className="resource-notice">Nhấn “Cắt vùng này” để áp dụng vùng đã chọn.</p>}
  {discard&&<div className="resource-confirm" role="alertdialog" aria-label="Bỏ chỉnh sửa ảnh"><strong>Bỏ thay đổi ảnh?</strong><p>Các nét vẽ và chỉnh sửa chưa lưu sẽ bị mất.</p><button ref={continueButton} className="btn ghost" onClick={()=>{returnCancel.current=true;setDiscard(false);}}>Tiếp tục sửa</button><button className="btn danger" onClick={onCancel}>Bỏ thay đổi</button></div>}
  <div className="modal-actions"><button ref={cancelButton} type="button" className="btn ghost" disabled={saving||discard} onClick={requestCancel}>Hủy</button><button type="button" className="btn primary" onClick={()=>void save()} disabled={!ready||saving||discard||!!crop}>{saving?'Đang lưu…':saveLabel||(replace?'Lưu đè ảnh này':'Lưu ảnh mới')}</button></div>
 </div>;
});
export default ImageEditor;
