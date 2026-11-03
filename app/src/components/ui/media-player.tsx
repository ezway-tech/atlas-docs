'use client';
import {useEffect,useRef,useState} from 'react';
import {Play,Pause,Volume2,VolumeX,Maximize} from 'lucide-react';
import {Button,IconButton,Slider} from './controls';
import {Select} from './select';
const time=(s:number)=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
export function MediaPlayer({src,kind,label}:{src:string;kind:'audio'|'video';label:string}){
 const media=useRef<HTMLVideoElement&HTMLAudioElement>(null),box=useRef<HTMLDivElement>(null);
 const [playing,setPlaying]=useState(false),[duration,setDuration]=useState(0),[position,setPosition]=useState(0),[volume,setVolume]=useState(1),[muted,setMuted]=useState(false),[speed,setSpeed]=useState('1'),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{setPlaying(false);setDuration(0);setPosition(0);setError('');setLoading(true);if(media.current){media.current.volume=volume;media.current.muted=muted;media.current.playbackRate=Number(speed);}},[src]);
 const Tag=kind==='video'?'video':'audio';
 async function toggle(){const el=media.current;if(!el)return;if(!el.paused)el.pause();else try{await el.play();setError('');}catch{setError('Không thể phát tệp này.');}}
 return <div ref={box} className="ui-media" aria-label={label}>
 <Tag ref={media} src={src} preload="metadata" playsInline onLoadedMetadata={e=>{setDuration(Number.isFinite(e.currentTarget.duration)?e.currentTarget.duration:0);setLoading(false);}} onDurationChange={e=>setDuration(Number.isFinite(e.currentTarget.duration)?e.currentTarget.duration:0)} onTimeUpdate={e=>setPosition(e.currentTarget.currentTime)} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onWaiting={()=>setLoading(true)} onCanPlay={()=>setLoading(false)} onPlaying={()=>setLoading(false)} onVolumeChange={e=>{setVolume(e.currentTarget.volume);setMuted(e.currentTarget.muted);}} onError={()=>{setLoading(false);setPlaying(false);setError('Không thể tải hoặc định dạng không được hỗ trợ.');}}/>
 <div className="ui-media-controls"><IconButton label={playing?'Tạm dừng':'Phát'} onClick={()=>void toggle()}>{playing?<Pause size={18}/>:<Play size={18}/>}</IconButton><span>{time(position)} / {time(duration)}</span><Slider label="Vị trí phát" min={0} max={duration||1} step={0.1} value={position} disabled={!duration} onValueChange={v=>{if(media.current){media.current.currentTime=v;setPosition(v);}}}/><IconButton label={muted?'Bật tiếng':'Tắt tiếng'} onClick={()=>{if(media.current)media.current.muted=!muted;}}>{muted?<VolumeX size={18}/>:<Volume2 size={18}/>}</IconButton><Slider className="ui-media-volume" label="Âm lượng" min={0} max={1} step={0.05} value={muted?0:volume} onValueChange={v=>{if(media.current){media.current.volume=v;media.current.muted=false;}}}/><Select label="Tốc độ phát" value={speed} onValueChange={v=>{setSpeed(v);if(media.current)media.current.playbackRate=Number(v);}} options={['0.5','1','1.25','1.5','2'].map(v=>({value:v,label:v+'×'}))}/>{kind==='video'&&<IconButton label="Toàn màn hình" onClick={()=>{const action=document.fullscreenElement?document.exitFullscreen():box.current?.requestFullscreen();action?.catch(()=>setError('Không thể mở toàn màn hình.'));}}><Maximize size={18}/></IconButton>}</div>
 {loading&&<small role="status">Đang tải…</small>}{error&&<div role="alert">{error}<Button onClick={()=>{setError('');setLoading(true);media.current?.load();}}>Thử lại</Button></div>}
 </div>;
}
