import {NextResponse,type NextRequest} from 'next/server';
import {localeFromCookie,parseAcceptLanguage} from '@/lib/i18n/detect';
import {LOCALE_COOKIE,type Locale} from '@/lib/i18n/locales';
import {localeCookieHeader} from '@/lib/i18n/request-locale';

export const LOCALE_HEADER='x-atlas-locale';

export function middleware(req:NextRequest){
 const fromCookie=localeFromCookie(req.cookies.get(LOCALE_COOKIE)?.value);
 const locale:Locale=fromCookie||parseAcceptLanguage(req.headers.get('accept-language'));
 const requestHeaders=new Headers(req.headers);
 requestHeaders.set(LOCALE_HEADER,locale);
 const res=NextResponse.next({request:{headers:requestHeaders}});
 if(!fromCookie)res.headers.append('Set-Cookie',localeCookieHeader(locale));
 return res;
}

export const config={
 matcher:['/((?!_next/static|_next/image|favicon.ico).*)'],
};
