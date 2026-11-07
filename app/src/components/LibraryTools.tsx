'use client';
import {useRouter} from 'next/navigation';
import {Archive,ChevronDown,Globe,HardDrive,Keyboard,Moon,Paperclip,Sun,Wrench} from 'lucide-react';
import {Button} from './ui/controls';
import {DropdownMenu,MenuItem,MenuSeparator} from './ui/patterns';
import {useLocale} from './LocaleProvider';
import {LOCALES,LOCALE_LABELS,type Locale} from '@/lib/i18n/locales';

export default function LibraryTools({dark,onBackup,onStorage,onKeymap,onTheme}:{dark:boolean;onBackup:()=>void;onStorage:()=>void;onKeymap:()=>void;onTheme:()=>void}){
 const router=useRouter();
 const {t,locale,setLocale}=useLocale();
 const themeLabel=dark?t('utilities.menu.themeLight'):t('utilities.menu.themeDark');
 return <DropdownMenu align="end" trigger={<Button className="tools-trigger" aria-label={t('utilities.menu.label')}><Wrench size={16}/><span>{t('utilities.menu.label')}</span><ChevronDown size={16}/></Button>}>
  <MenuItem onSelect={()=>router.push('/media')}><Paperclip size={16}/> {t('utilities.menu.attachments')}</MenuItem>
  <MenuItem onSelect={onBackup}><Archive size={16}/> {t('utilities.menu.backup')}</MenuItem>
  <MenuItem onSelect={onStorage}><HardDrive size={16}/> {t('utilities.menu.storage')}</MenuItem>
  <MenuSeparator/>
  <MenuItem onSelect={onKeymap}><Keyboard size={16}/> {t('utilities.menu.keymap')}</MenuItem>
  <MenuSeparator/>
  <div className="ui-menu-label" role="presentation"><Globe size={16}/> {t('utilities.menu.language')}</div>
  {LOCALES.map((code:Locale)=>(
   <MenuItem key={code} onSelect={()=>setLocale(code)} disabled={code===locale}>
    <span className="lang-option">{LOCALE_LABELS[code]}{code===locale?' ·':''}</span>
   </MenuItem>
  ))}
  <MenuSeparator/>
  <MenuItem onSelect={onTheme}>{dark?<Sun size={16}/>:<Moon size={16}/>} {themeLabel}</MenuItem>
 </DropdownMenu>;
}
