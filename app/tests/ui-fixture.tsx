import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Button,NumberInput,ColorPicker} from '../src/components/ui/controls';
import {Dialog,ConfirmDialog} from '../src/components/ui/dialog';
import {Select} from '../src/components/ui/select';
import {Tabs} from '../src/components/ui/patterns';
import {MediaPlayer} from '../src/components/ui/media-player';
import {KeymapProvider} from '../src/components/KeymapProvider';
import {KeymapDialog} from '../src/components/KeymapDialog';
import CommentField from '../src/components/CommentField';
import ResourceLibrary from '../src/components/ResourceLibrary';
import '../src/app/globals.css';import '../src/app/extras.css';import '../src/app/ui.css';
function App(){const [busy,setBusy]=useState(false),[tab,setTab]=useState('one'),[open,setOpen]=useState(false),[confirm,setConfirm]=useState(false),[keys,setKeys]=useState(false),[value,setValue]=useState('all'),[number,setNumber]=useState(24),[color,setColor]=useState('#ff0000'),[md,setMd]=useState('hello world');return <KeymapProvider><main style={{padding:24}}><Button onClick={()=>document.documentElement.classList.toggle('dark')}>Đổi giao diện</Button><Button onClick={()=>setOpen(true)}>Mở hộp thoại</Button><Button onClick={()=>setKeys(true)}>Phím tắt</Button><NumberInput aria-label="Cỡ chữ thử" value={number} min={12} max={72} onValueChange={setNumber}/><output data-testid="number">{number}</output><ColorPicker value={color} onValueChange={setColor}/><CommentField value={md} onChange={setMd}/><output data-testid="markdown">{md}</output><MediaPlayer src={location.search.includes('video')?'/clip.webm':'/tone.wav'} kind={location.search.includes('video')?'video':'audio'} label="Media thử"/><Tabs label="Bảng thử" value={tab} onValueChange={setTab} items={[{value:"one",label:"Tab một",content:<p>Nội dung một</p>},{value:"two",label:"Tab hai",content:<p>Nội dung hai</p>}]}/><ResourceLibrary/>{keys&&<KeymapDialog keymap={{}} onSave={()=>{}} onClose={()=>setKeys(false)}/ >}{open&&<Dialog busy={busy} title="Hộp thử" onOpenChange={setOpen}><div className="modal"><h2>Hộp thử</h2><Select label="Trạng thái thử" value={value} onValueChange={setValue} options={[{value:'all',label:'Tất cả trạng thái'},{value:'custom',label:'Đã tùy chỉnh'}]}/><Button onClick={()=>setConfirm(true)}>Xác nhận thử</Button><Button onClick={()=>setBusy(v=>!v)}>Đổi bận</Button><Button disabled={busy} onClick={()=>setOpen(false)}>Đóng hộp</Button>{confirm&&<ConfirmDialog title="Xác nhận lồng" onCancel={()=>setConfirm(false)} onConfirm={()=>setConfirm(false)}>Nội dung</ConfirmDialog>}</div></Dialog>}</main></KeymapProvider>;}
createRoot(document.getElementById('root')!).render(<App/>);
