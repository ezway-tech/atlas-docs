'use client';
import React,{useEffect,useRef,useState} from 'react';

type Tool='crop'|'pen'|'arrow'|'rect'|'text';
type Point={x:number;y:number};

export default function ImageEditor({src,filename,gif,onCancel,onSave}:{src:string;filename:string;gif:boolean;onCancel:()=>void;onSave:(file:File)=>Promise<void>}){
  const base=useRef<HTMLCanvasElement>(null),overlay=useRef<HTMLCanvasElement>(null);
  const [tool,setTool]=useState<Tool>('crop'),[ready,setReady]=useState(false),[saving,setSaving]=useState(false),[crop,setCrop]=useState<{a:Point;b:Point}|null>(null);
  const start=useRef<Point|null>(null);
  const ink='#d92d20';

  useEffect(()=>{
    let cancel=false;
    const img=new Image();
    img.onload=()=>{
      if(cancel||!base.current||!overlay.current)return;
      const edge=Math.max(img.naturalWidth,img.naturalHeight),scale=edge>1600?1600/edge:1;
      const w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
      base.current.width=overlay.current.width=w;
      base.current.height=overlay.current.height=h;
      base.current.getContext('2d')?.drawImage(img,0,0,w,h);
      setReady(true);
    };
    img.src=src;
    return()=>{cancel=true;};
  },[src]);

  const point=(e:React.PointerEvent)=>{
    const canvas=base.current!;
    const box=canvas.getBoundingClientRect();
    return {x:(e.clientX-box.left)*(canvas.width/box.width),y:(e.clientY-box.top)*(canvas.height/box.height)};
  };
  const clearOverlay=()=>{const canvas=overlay.current;if(!canvas)return;canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);};
  const paint=(ctx:CanvasRenderingContext2D)=>{ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=ink;ctx.fillStyle=ink;};
  const arrow=(ctx:CanvasRenderingContext2D,a:Point,b:Point)=>{
    paint(ctx);
    const angle=Math.atan2(b.y-a.y,b.x-a.x),size=14;
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-size*Math.cos(angle-0.4),b.y-size*Math.sin(angle-0.4));ctx.lineTo(b.x-size*Math.cos(angle+0.4),b.y-size*Math.sin(angle+0.4));ctx.closePath();ctx.fill();
  };
  const rect=(ctx:CanvasRenderingContext2D,a:Point,b:Point)=>{paint(ctx);ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);};

  const down=(e:React.PointerEvent)=>{
    if(!ready)return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const at=point(e);
    start.current=at;
    if(tool==='pen'){const ctx=base.current?.getContext('2d');if(!ctx)return;paint(ctx);ctx.beginPath();ctx.moveTo(at.x,at.y);}
    if(tool==='crop')setCrop({a:at,b:at});
  };
  const move=(e:React.PointerEvent)=>{
    const from=start.current;if(!from)return;
    const at=point(e);
    if(tool==='pen'){const ctx=base.current?.getContext('2d');if(!ctx)return;ctx.lineTo(at.x,at.y);ctx.stroke();}
    if(tool==='crop'){setCrop({a:from,b:at});clearOverlay();const ctx=overlay.current?.getContext('2d');if(!ctx)return;ctx.setLineDash([6,4]);ctx.strokeStyle='#4c68e5';ctx.lineWidth=2;ctx.strokeRect(from.x,from.y,at.x-from.x,at.y-from.y);ctx.setLineDash([]);}
    if(tool==='arrow'||tool==='rect'){clearOverlay();const ctx=overlay.current?.getContext('2d');if(!ctx)return;if(tool==='arrow')arrow(ctx,from,at);else rect(ctx,from,at);}
  };
  const up=(e:React.PointerEvent)=>{
    const from=start.current;start.current=null;if(!from)return;
    const at=point(e);
    const ctx=base.current?.getContext('2d');
    if(tool==='arrow'&&ctx){clearOverlay();arrow(ctx,from,at);}
    if(tool==='rect'&&ctx){clearOverlay();rect(ctx,from,at);}
    if(tool==='text'&&Math.hypot(at.x-from.x,at.y-from.y)<6){
      const value=window.prompt('Chữ chú thích','');
      if(value&&ctx){ctx.font='20px sans-serif';ctx.lineWidth=4;ctx.strokeStyle='#fff';ctx.strokeText(value,at.x,at.y);ctx.fillStyle=ink;ctx.fillText(value,at.x,at.y);}
    }
  };
  const applyCrop=()=>{
    if(!crop||!base.current||!overlay.current)return;
    const x=Math.min(crop.a.x,crop.b.x),y=Math.min(crop.a.y,crop.b.y),w=Math.abs(crop.b.x-crop.a.x),h=Math.abs(crop.b.y-crop.a.y);
    if(w<4||h<4)return;
    const next=document.createElement('canvas');
    next.width=Math.round(w);next.height=Math.round(h);
    next.getContext('2d')?.drawImage(base.current,x,y,w,h,0,0,next.width,next.height);
    base.current.width=overlay.current.width=next.width;
    base.current.height=overlay.current.height=next.height;
    base.current.getContext('2d')?.drawImage(next,0,0);
    clearOverlay();
    setCrop(null);
  };
  const save=async()=>{
    if(!base.current)return;
    setSaving(true);
    try{
      const blob=await new Promise<Blob|null>(resolve=>base.current?.toBlob(resolve,'image/png'));
      if(!blob)throw Error('Không xuất được ảnh');
      const name=filename.replace(/\.\w+$/,'')+'-edited.png';
      await onSave(new File([blob],name,{type:'image/png'}));
    }finally{setSaving(false);}
  };
  const tools:Tool[]=['crop','pen','arrow','rect','text'];
  const label:Record<Tool,string>={crop:'Cắt',pen:'Vẽ',arrow:'Mũi tên',rect:'Khung',text:'Chữ'};
  return <div className="image-editor">{gif&&<p>GIF sau khi lưu sẽ thành ảnh tĩnh. Ảnh gốc vẫn giữ nguyên.</p>}<div className="image-tools">{tools.map(item=><button type="button" key={item} className={tool===item?'active':''} onClick={()=>{setTool(item);clearOverlay();}}>{label[item]}</button>)}{tool==='crop'&&<button type="button" onClick={applyCrop} disabled={!crop}>Cắt vùng này</button>}</div><div className="image-stage"><canvas ref={base}/><canvas ref={overlay} className="image-overlay" onPointerDown={down} onPointerMove={move} onPointerUp={up}/></div><div className="modal-actions"><button type="button" className="btn ghost" onClick={onCancel}>Hủy</button><button type="button" className="btn primary" onClick={()=>void save()} disabled={!ready||saving}>{saving?'Đang lưu':'Lưu ảnh mới'}</button></div></div>;
}
