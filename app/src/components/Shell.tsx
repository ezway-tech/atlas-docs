'use client';
import {usePathname} from 'next/navigation';
import Workspace from './Workspace';
import {KeymapProvider} from './KeymapProvider';
import {LocaleProvider} from './LocaleProvider';
import type {Locale} from '@/lib/i18n/locales';

export default function Shell({children,initialLocale}:{children:React.ReactNode;initialLocale:Locale}){
 const help=usePathname().startsWith('/help');
 return <LocaleProvider initialLocale={initialLocale}><KeymapProvider>{!help&&<Workspace/>}{children}</KeymapProvider></LocaleProvider>;
}
