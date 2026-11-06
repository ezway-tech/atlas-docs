'use client';
import {useRouter} from 'next/navigation';
import {Archive,ChevronDown,HardDrive,Keyboard,Moon,Paperclip,Sun,Wrench} from 'lucide-react';
import {Button} from './ui/controls';
import {DropdownMenu,MenuItem,MenuSeparator} from './ui/patterns';

export default function LibraryTools({dark,onBackup,onStorage,onKeymap,onTheme}:{dark:boolean;onBackup:()=>void;onStorage:()=>void;onKeymap:()=>void;onTheme:()=>void}){
 const router=useRouter();
 const themeLabel=dark?'Chuyển sang giao diện sáng':'Chuyển sang giao diện tối';
 return <DropdownMenu align="end" trigger={<Button className="tools-trigger" aria-label="Tiện ích"><Wrench size={16}/><span>Tiện ích</span><ChevronDown size={16}/></Button>}>
  <MenuItem onSelect={()=>router.push('/media')}><Paperclip size={16}/> Tệp đính kèm</MenuItem>
  <MenuItem onSelect={onBackup}><Archive size={16}/> Sao lưu & khôi phục</MenuItem>
  <MenuItem onSelect={onStorage}><HardDrive size={16}/> Dung lượng & dọn dẹp</MenuItem>
  <MenuSeparator/>
  <MenuItem onSelect={onKeymap}><Keyboard size={16}/> Phím tắt</MenuItem>
  <MenuItem onSelect={onTheme}>{dark?<Sun size={16}/>:<Moon size={16}/>} {themeLabel}</MenuItem>
 </DropdownMenu>;
}
