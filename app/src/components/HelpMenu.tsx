'use client';
import {useEffect,type ReactNode} from 'react';
import {BookOpen,ChevronDown,CircleHelp,Coffee,History,Info} from 'lucide-react';
import {Button} from './ui/controls';
import {DropdownMenu,MenuItem,MenuLink,MenuSeparator} from './ui/patterns';
import {useLocale} from './LocaleProvider';
import {useUpdateNotice} from './UpdateNoticeProvider';

function useHelpChrome(dirty:boolean){
  const {t}=useLocale();
  const {openVersionDialog,setUpdateDirty}=useUpdateNotice();
  useEffect(()=>{setUpdateDirty(dirty);return()=>setUpdateDirty(false);},[dirty,setUpdateDirty]);
  const items=<>
    <MenuLink href="/help"><BookOpen size={16}/>{t('help.guide')}</MenuLink>
    <MenuLink href="/help/changelog"><History size={16}/>{t('help.releaseNotes')}</MenuLink>
    <MenuItem onSelect={()=>openVersionDialog()}><Info size={16}/><span className="help-version-label">{t('help.version')}</span></MenuItem>
    <MenuSeparator/>
    <MenuLink href="https://atlasdocs.ezway.tech/donate/"><Coffee size={16}/>{t('help.donate')}</MenuLink>
  </>;
  return {items};
}

/** Embed help links inside another menu; version dialog lives in UpdateNoticeProvider. */
export function HelpMenuChrome({dirty,children}:{dirty:boolean;children:(items:ReactNode)=>ReactNode}){
  const {items}=useHelpChrome(dirty);
  return <>{children(items)}</>;
}

/** Shared help / version / update menu used in the top bar. */
export default function HelpMenu({dirty}:{dirty:boolean}){
  const {t}=useLocale();
  const {items}=useHelpChrome(dirty);
  return (
    <DropdownMenu align="end" trigger={<Button className="top-help" aria-label={t('utilities.menu.help')}><CircleHelp size={16}/><span>{t('utilities.menu.help')}</span><ChevronDown size={16}/></Button>}>
      {items}
    </DropdownMenu>
  );
}
