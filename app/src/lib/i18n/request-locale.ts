import {localeFromCookie,parseAcceptLanguage} from './detect';
import {DEFAULT_LOCALE,LOCALE_COOKIE,type Locale} from './locales';

/** Resolve UI locale from a request cookie, then Accept-Language, then default. */
export function localeFromRequest(req:Request):Locale{
 const cookieHeader=req.headers.get('cookie')||'';
 const re=new RegExp('(?:^|;\\s*)'+LOCALE_COOKIE+'=([^;]+)');
 const match=cookieHeader.match(re);
 const fromCookie=localeFromCookie(match?.[1]?decodeURIComponent(match[1]):null);
 if(fromCookie)return fromCookie;
 return parseAcceptLanguage(req.headers.get('accept-language'));
}

export function localeCookieHeader(locale:Locale):string{
 return `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export {DEFAULT_LOCALE,LOCALE_COOKIE};
