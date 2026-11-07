'use client';
import Workspace from './Workspace';
import {KeymapProvider} from './KeymapProvider';
import {LocaleProvider} from './LocaleProvider';
import type {Locale} from '@/lib/i18n/locales';

export default function Shell({children,initialLocale}:{children:React.ReactNode;initialLocale:Locale}){
 return <LocaleProvider initialLocale={initialLocale}><KeymapProvider><Workspace/>{children}</KeymapProvider></LocaleProvider>;
}
