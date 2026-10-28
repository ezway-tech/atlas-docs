'use client';
import React,{forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {Crop,Pencil,ArrowUpRight,Square,Type,Undo2,Redo2} from 'lucide-react';
import {MAX_ASSET_SIZE} from '@/lib/assets';

type Tool='crop'|'pen'|'arrow'|'rect'|'text';
type Point={x:number;y:number};
type Operation={tool:Tool;points:Point[];color:string;width:number;fontSize:number;text?:string};
export type ImageEditorHandle={requestCancel:()=>void};
type Props={src:string;filename:string;gif:boolean;replace?:boolean;saveLabel?:string;onCancel:()=>void;onSave:(file:File)=>Promise<void>};
const toolItems=[{id:'crop',label:'Cắt',Icon:Crop},{id:'pen',label:'Vẽ',Icon:Pencil},{id:'arrow',label:'Mũi tên',Icon:ArrowUpRight},{id:'rect',label:'Khung',Icon:Square},{id:'text',label:'Chữ',Icon:Type}] as const;

function screenScale(canvas:HTMLCanvasElement){const rect=canvas.getBoundingClientRect();return rect.width?canvas.width/rect.width:1;}
function paintCrop(canvas:HTMLCanvasElement,op:Operation){
 const ctx=canvas.getContext('2d');if(!ctx)return;
 const a=op.points[0],b=op.points.at(-1)!,x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),w=Math.abs(b.x-a.x),h=Math.abs(b.y-a.y),scale=screenScale(canvas);
 ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.fillStyle='#10182844';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.clearRect(x,y,w,h);
 ctx.setLineDash([6*scale,4*scale]);ctx.strokeStyle='#4c68e5';ctx.lineWidth=Math.max(1,2*scale);ctx.strokeRect(x,y,w,h);ctx.restore();
}
function draw(canvas:HTMLCanvasElement,op:Operation){
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Trình duyệt không hỗ trợ vẽ ảnh.');
 const a=op.points[0],b=op.points.at(-1)!;
 if(op.tool==='crop'){
  const x=Math.floor(Math.min(a.x,b.x)),y=Math.floor(Math.min(a.y,b.y));
  const w=Math.max(1,Math.round(Math.abs(b.x-a.x))),h=Math.max(1,Math.round(Math.abs(b.y-a.y)));
  const copy=document.createElement('canvas');copy.width=w;copy.height=h;copy.getContext('2d')!.drawImage(canvas,x,y,w,h,0,0,w,h);
  canvas.width=w;canvas.height=h;ctx.drawImage(copy,0,0);return;
 }
 ctx.save();ctx.strokeStyle=ctx.fillStyle=op.color;ctx.lineWidth=op.width;ctx.lineCap='round';ctx.lineJoin='round';
 if(op.tool==='pen'){ctx.beginPath();ctx.moveTo(a.x,a.y);for(const p of op.points)ctx.lineTo(p.x,p.y);ctx.stroke();if(op.points.length===1){ctx.beginPath();ctx.arc(a.x,a.y,op.width/2,0,Math.PI*2);ctx.fill();}}
 if(op.tool==='rect')ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);
 if(op.tool==='arrow'){const angle=Math.atan2(b.y-a.y,b.x-a.x),size=Math.max(10,op.width*4);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-size*Math.cos(angle-.4),b.y-size*Math.sin(angle-.4));ctx.lineTo(b.x-size*Math.cos(angle+.4),b.y-size*Math.sin(angle+.4));ctx.closePath();ctx.fill();}
 if(op.tool==='text'){ctx.font=`${op.fontSize}px sans-serif`;ctx.textBaseline='top';(op.text||'').split('\n').forEach((line,i)=>ctx.fillText(line,a.x,a.y+i*op.fontSize*1.3));}
 ctx.restore();
}

const ImageEditor=forwardRef<ImageEditorHandle,Props>(function ImageEditor({src,filename,gif,replace=false,saveLabel,onCancel,onSave},ref){
 const root=useRef<HTMLDivElement>(null),base=useRef<HTMLCanvasElement>(null),overlay=useRef<HTMLCanvasElement>(null),checkpoint=useRef<HTMLCanvasElement|null>(null);
 const history=useRef<{past:Operation[];future:Operation[];folded:boolean}>({past:[],future:[],folded:false}),stroke=useRef<{id:number;op:Operation}|null>(null),saveLock=useRef(false);
 const actions=useRef({escape:()=>{},undo:(_redo=false)=>{void _redo;}});
 const [tool,setTool]=useState<Tool>('pen'),[ready,setReady]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const [color,setColor]=useState('#d92d20'),[width,setWidth]=useState(3),[fontSize,setFontSize]=useState(24),[text,setText]=useState(''),[crop,setCrop]=useState<Operation|null>(null),[counts,setCounts]=useState({undo:0,redo:0}),[size,setSize]=useState({w:0,h:0}),[discard,setDiscard]=useState(false);
 const cancelButton=useRef<HTMLButtonElement>(null),continueButton=useRef<HTMLButtonElement>(null),returnCancel=useRef(false);
 function clear(){const c=overlay.current;if(c)c.getContext('2d')?.clearRect(0,0,c.width,c.height);}
 function render(){const canvas=base.current,original=checkpoint.current;if(!canvas||!original||!overlay.current)return;canvas.width=original.width;canvas.height=original.height;canvas.getContext('2d')!.drawImage(original,0,0);for(const op of history.current.past)draw(canvas,op);overlay.current.width=canvas.width;overlay.current.height=canvas.height;setSize({w:canvas.width,h:canvas.height});setCounts({undo:history.current.past.length,redo:history.current.future.length});}
 useEffect(()=>{let cancelled=false;setReady(false);setError('');setCrop(null);setDiscard(false);history.current={past:[],future:[],folded:false};const img=new Image();img.onload=()=>{if(cancelled)return;try{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');if(!ctx||!c.width||!c.height)throw Error('Không thể mở ảnh này.');ctx.drawImage(img,0,0);checkpoint.current=c;render();setReady(true);}catch(e){setError((e as Error).message);}};img.onerror=()=>{if(!cancelled)setError('Không tải được ảnh. Hãy thử lại.');};img.src=src;return()=>{cancelled=true;checkpoint.current=null;stroke.current=null;};},[src,retry]);
 useEffect(()=>{root.current?.focus({preventScroll:true});},[]);
 useEffect(()=>{if(discard)continueButton.current?.focus();else if(returnCancel.current){returnCancel.current=false;cancelButton.current?.focus();}},[discard]);
 useEffect(()=>{if(!crop||!overlay.current)return;const canvas=overlay.current,guide=()=>paintCrop(canvas,crop);guide();const observer=new ResizeObserver(guide);observer.observe(canvas);return()=>observer.disconnect();},[crop]);
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();actions.current.escape();return;}const typing=(e.target as HTMLElement|null)?.closest?.('input,textarea,select');if(!typing&&(e.ctrlKey||e.metaKey)&&!e.altKey&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();e.stopPropagation();actions.current.undo(e.key.toLowerCase()==='y'||e.shiftKey);}};document.addEventListener('keydown',onKey,true);return()=>document.removeEventListener('keydown',onKey,true);},[]);
 function requestCancel(){if(saveLock.current)return;if(history.current.folded||history.current.past.length||crop||text.trim()||stroke.current){if(stroke.current){stroke.current=null;clear();}setDiscard(true);}else onCancel();}
 useImperativeHandle(ref,()=>({requestCancel}));
 function commit(op:Operation){history.current.past.push(op);history.current.future=[];if(history.current.past.length>20){draw(checkpoint.current!,history.current.past.shift()!);history.current.folded=true;}setCrop(null);render();}
 function undo(redo=false){if(saveLock.current||stroke.current)return;const h=history.current,op=(redo?h.future:h.past).pop();if(!op)return;(redo?h.past:h.future).push(op);setCrop(null);render();}
 function point(e:React.PointerEvent):Point{const c=base.current!,r=c.getBoundingClientRect(),sx=r.width?c.width/r.width:1,sy=r.height?c.height/r.height:1;return {x:Math.max(0,Math.min(c.width,(e.clientX-r.left)*sx)),y:Math.max(0,Math.min(c.height,(e.clientY-r.top)*sy))};}
 function preview(op:Operation){if(op.tool==='crop'&&overlay.current)paintCrop(overlay.current,op);else{clear();draw(overlay.current!,op);}}
 function down(e:React.PointerEvent<HTMLCanvasElement>){if(!ready||saveLock.current||discard||stroke.current||!e.isPrimary||e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);setCrop(null);const p=point(e);stroke.current={id:e.pointerId,op:{tool,points:[p],color,width,fontSize,text:text.trim()}};if(tool!=='crop')preview(stroke.current.op);}
 function move(e:React.PointerEvent<HTMLCanvasElement>){const s=stroke.current;if(!s||s.id!==e.pointerId)return;const p=point(e);s.op.points=s.op.tool==='pen'?[...s.op.points,p]:[s.op.points[0],p];preview(s.op);}
 function up(e:React.PointerEvent<HTMLCanvasElement>){const s=stroke.current;if(!s||s.id!==e.pointerId)return;move(e);stroke.current=null;e.currentTarget.releasePointerCapture(e.pointerId);if(s.op.tool==='crop'){const [a,b]=s.op.points;if(Math.abs(a.x-b.x)>=4&&Math.abs(a.y-b.y)>=4)setCrop(s.op);else clear();return;}if(s.op.tool==='text'&&!s.op.text){setError('Nhập chữ chú thích rồi chọn vị trí trên ảnh.');clear();return;}commit(s.op);if(s.op.tool==='text')setText('');setError('');}
 function cancelStroke(e:React.PointerEvent){if(stroke.current?.id!==e.pointerId)return;stroke.current=null;clear();setCrop(null);}
 async function save(){if(!ready||!base.current||saveLock.current||stroke.current)return;saveLock.current=true;setSaving(true);setError('');try{const blob=await new Promise<Blob|null>(resolve=>base.current!.toBlob(resolve,'image/png'));if(!blob)throw Error('Không xuất được ảnh. Hãy thử cắt ảnh nhỏ hơn.');if(blob.size>MAX_ASSET_SIZE)throw Error('Ảnh PNG vượt quá 50 MB. Hãy cắt ảnh nhỏ hơn rồi lưu lại.');const name=filename.replace(/\.[^.]+$/,'').slice(0,169)+'-edited.png';await onSave(new File([blob],name,{type:'image/png'}));}catch(e){setError((e as Error).message||'Không lưu được ảnh. Hãy thử lại.');}finally{saveLock.current=false;setSaving(false);}}
 actions.current.escape=()=>{if(discard){returnCancel.current=true;setDiscard(false);}else requestCancel();};
 actions.current.undo=redo=>{if(!discard)undo(redo);};
 const toolLabel=toolItems.find(t=>t.id===tool)?.label,cropBox=crop?(()=>{const a=crop.points[0],b=crop.points.at(-1)!;return `${Math.max(1,Math.round(Math.abs(b.x-a.x)))} × ${Math.max(1,Math.round(Math.abs(b.y-a.y)))} px`;})():'';
 return <div ref={root} tabIndex={-1} className="image-editor sketch-editor" aria-busy={saving}>
  <p className="sketch-intro">{replace?'Chỉnh sửa ảnh đang dùng trong thư viện.':'Vẽ chú thích rồi lưu một bản mới để chèn vào bài. Ảnh gốc được giữ nguyên.'}</p>
  {gif&&<p className="resource-notice">{replace?'GIF sau khi lưu đè sẽ thành PNG tĩnh ở cùng địa chỉ.':'Bản chỉnh sửa GIF là ảnh PNG tĩnh. GIF gốc được giữ nguyên.'}</p>}
  <fieldset className="sketch-controls" disabled={!ready||saving||discard}>
   <div className="image-tools" aria-label="Công cụ chỉnh sửa">{toolItems.map(({id,label,Icon})=><button type="button" key={id} aria-pressed={tool===id} className={tool===id?'active':''} onClick={()=>{stroke.current=null;setTool(id);setCrop(null);clear();}}><Icon size={16}/>{label}</button>)}<span className="sketch-separator"/><button type="button" aria-label="Hoàn tác" title="Hoàn tác (Ctrl Z)" disabled={!counts.undo} onClick={()=>undo()}><Undo2 size={16}/></button><button type="button" aria-label="Làm lại" title="Làm lại (Ctrl Shift Z)" disabled={!counts.redo} onClick={()=>undo(true)}><Redo2 size={16}/></button></div>
   <div className="sketch-options"><label>Màu<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label><label>Độ dày nét<input type="range" min={1} max={20} value={width} onChange={e=>setWidth(+e.target.value)}/><output>{width} px</output></label>{tool==='text'&&<label>Cỡ chữ<input type="number" min={12} max={72} value={fontSize} onChange={e=>setFontSize(Math.max(12,Math.min(72,+e.target.value||12)))}/></label>}{tool==='crop'&&<button type="button" className="btn ghost" disabled={!crop} onClick={()=>crop&&commit(crop)}>Cắt vùng này</button>}</div>
   {tool==='text'&&<label className="sketch-text">Chữ chú thích<textarea rows={2} value={text} onChange={e=>setText(e.target.value)} placeholder="Nhập chữ, sau đó nhấn vào vị trí trên ảnh"/></label>}
  </fieldset>
  {error&&<div className="resource-notice" role="alert">{error}{!ready&&<button className="btn ghost" onClick={()=>setRetry(v=>v+1)}>Thử tải lại</button>}</div>}
  {!ready&&!error&&<p role="status">Đang tải ảnh…</p>}
  <div className="sketch-workspace"><div className="image-stage" style={size.w?{aspectRatio:`${size.w} / ${size.h}`,width:`min(100%, ${size.w}px, 100cqi, calc(100cqb * ${size.w} / ${size.h}))`}:undefined}><canvas ref={base}/><canvas ref={overlay} className="image-overlay" aria-label="Vùng vẽ trên ảnh" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancelStroke} onLostPointerCapture={cancelStroke}/></div></div>
  <div className="sketch-status"><span>{size.w} × {size.h} px · {toolLabel}{cropBox?` · Vùng cắt ${cropBox}`:''}{saving?' · Đang lưu…':''}</span><span>Hoàn tác tối đa 20 thao tác</span></div>
  {crop&&<p className="resource-notice">Nhấn “Cắt vùng này” để áp dụng vùng đã chọn.</p>}
  {discard&&<div className="resource-confirm" role="alertdialog" aria-label="Bỏ chỉnh sửa ảnh"><strong>Bỏ thay đổi ảnh?</strong><p>Các nét vẽ và chỉnh sửa chưa lưu sẽ bị mất.</p><button ref={continueButton} className="btn ghost" onClick={()=>{returnCancel.current=true;setDiscard(false);}}>Tiếp tục sửa</button><button className="btn danger" onClick={onCancel}>Bỏ thay đổi</button></div>}
  <div className="modal-actions"><button ref={cancelButton} type="button" className="btn ghost" disabled={saving||discard} onClick={requestCancel}>Hủy</button><button type="button" className="btn primary" onClick={()=>void save()} disabled={!ready||saving||discard||!!crop}>{saving?'Đang lưu…':saveLabel||(replace?'Lưu đè ảnh này':'Lưu ảnh mới')}</button></div>
 </div>;
});
export default ImageEditor;
