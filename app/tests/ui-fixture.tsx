import Markdown from '../src/components/Markdown';
import {prefixSvgIds,zoomView} from '../src/components/ZoomLayer';
Object.assign(window,{diagramTest:{prefixSvgIds,zoomView}});
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Button,NumberInput,ColorPicker} from '../src/components/ui/controls';
import {Dialog,ConfirmDialog} from '../src/components/ui/dialog';
import {Select} from '../src/components/ui/select';
import {Tabs} from '../src/components/ui/patterns';
import {MediaPlayer} from '../src/components/ui/media-player';
import {KeymapProvider} from '../src/components/KeymapProvider';
import {LocaleProvider} from '../src/components/LocaleProvider';
import {KeymapDialog} from '../src/components/KeymapDialog';
import CommentField from '../src/components/CommentField';
import ResourceLibrary from '../src/components/ResourceLibrary';
import '../src/app/globals.css';import '../src/app/extras.css';import '../src/app/ui.css';
function Shell({children}:{children:React.ReactNode}){return <LocaleProvider initialLocale="vi"><KeymapProvider>{children}</KeymapProvider></LocaleProvider>;}
function DiagramFixture(){const [dark,setDark]=useState(false);const wide=location.search.includes('wide'),tall=location.search.includes('tall');const code=wide||tall?`flowchart ${tall?'TD':'LR'}\n`+Array.from({length:18},(_,i)=>`N${i}[Step ${i}] --> N${i+1}[Step ${i+1}]`).join('\n'):'flowchart LR\n A[Receive at dock] --> B[Put on a shelf] --> C[Issue to a job]';return <Shell><button onClick={()=>{document.documentElement.classList.toggle('dark');setDark(v=>!v);}}>Theme</button><Markdown docId="test" dark={dark} content={'```mermaid\n'+code+'\n```\n\n```mermaid\nflowchart TD\n A --> B\n```\n\n![test](/test-image.svg)'}/></Shell>;}
function App(){const [busy,setBusy]=useState(false),[tab,setTab]=useState('one'),[open,setOpen]=useState(false),[confirm,setConfirm]=useState(false),[keys,setKeys]=useState(false),[value,setValue]=useState('all'),[number,setNumber]=useState(24),[color,setColor]=useState('#ff0000'),[md,setMd]=useState('hello world');return <Shell><main style={{padding:24}}><Button onClick={()=>document.documentElement.classList.toggle('dark')}>Đổi giao diện</Button><Button onClick={()=>setOpen(true)}>Mở hộp thoại</Button><Button onClick={()=>setKeys(true)}>Phím tắt</Button><NumberInput aria-label="Cỡ chữ thử" value={number} min={12} max={72} onValueChange={setNumber}/><output data-testid="number">{number}</output><ColorPicker value={color} onValueChange={setColor}/><CommentField value={md} onChange={setMd}/><output data-testid="markdown">{md}</output><MediaPlayer src={location.search.includes('video')?'/clip.webm':'/tone.wav'} kind={location.search.includes('video')?'video':'audio'} label="Media thử"/><Tabs label="Bảng thử" value={tab} onValueChange={setTab} items={[{value:"one",label:"Tab một",content:<p>Nội dung một</p>},{value:"two",label:"Tab hai",content:<p>Nội dung hai</p>}]}/><ResourceLibrary/>{keys&&<KeymapDialog keymap={{}} onSave={()=>{}} onClose={()=>setKeys(false)}/ >}{open&&<Dialog busy={busy} title="Hộp thử" onOpenChange={setOpen}><div className="modal"><h2>Hộp thử</h2><Select label="Trạng thái thử" value={value} onValueChange={setValue} options={[{value:'all',label:'Tất cả trạng thái'},{value:'custom',label:'Đã tùy chỉnh'}]}/><Button onClick={()=>setConfirm(true)}>Xác nhận thử</Button><Button onClick={()=>setBusy(v=>!v)}>Đổi bận</Button><Button disabled={busy} onClick={()=>setOpen(false)}>Đóng hộp</Button>{confirm&&<ConfirmDialog title="Xác nhận lồng" onCancel={()=>setConfirm(false)} onConfirm={()=>setConfirm(false)}>Nội dung</ConfirmDialog>}</div></Dialog>}</main></Shell>;}
createRoot(document.getElementById('root')!).render(location.search.includes('diagram')?<DiagramFixture/>:<App/>);
