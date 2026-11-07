import type {Metadata} from 'next';
import {cookies,headers} from 'next/headers';
import './globals.css';
import './extras.css';
import './ui.css';
import Shell from '@/components/Shell';
import {localeFromCookie,normalizeLanguageTag} from '@/lib/i18n/detect';
import {DEFAULT_LOCALE,LOCALE_COOKIE,type Locale} from '@/lib/i18n/locales';
import {translate} from '@/lib/i18n/translate';

const LOCALE_HEADER='x-atlas-locale';

async function readLocale():Promise<Locale>{
 const jar=await cookies();
 const fromCookie=localeFromCookie(jar.get(LOCALE_COOKIE)?.value);
 if(fromCookie)return fromCookie;
 const h=await headers();
 const fromHeader=normalizeLanguageTag(h.get(LOCALE_HEADER)||'');
 if(fromHeader)return fromHeader;
 return DEFAULT_LOCALE;
}

export async function generateMetadata():Promise<Metadata>{
 const locale=await readLocale();
 return {title:'Atlas Docs',description:translate(locale,'meta.description')};
}

export default async function RootLayout({children}:{children:React.ReactNode}){
 const locale=await readLocale();
 return <html lang={locale} suppressHydrationWarning><body><Shell initialLocale={locale}>{children}</Shell></body></html>;
}
