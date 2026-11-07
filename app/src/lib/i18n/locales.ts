export const LOCALES=['vi','en','zh-Hans','es','ja'] as const;
export type Locale=(typeof LOCALES)[number];
export const DEFAULT_LOCALE:Locale='en';
export const LOCALE_COOKIE='atlas-locale';

export const LOCALE_LABELS:Record<Locale,string>={
 vi:'Tiếng Việt',
 en:'English',
 'zh-Hans':'简体中文',
 es:'Español',
 ja:'日本語',
};

/** BCP 47 tags for Intl / localeCompare */
export const INTL_LOCALE:Record<Locale,string>={
 vi:'vi',
 en:'en',
 'zh-Hans':'zh-Hans',
 es:'es',
 ja:'ja',
};

export function isLocale(value:unknown):value is Locale{
 return typeof value==='string'&&(LOCALES as readonly string[]).includes(value);
}
