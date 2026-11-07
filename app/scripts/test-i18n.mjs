import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';

const locales=await loadTs('src/lib/i18n/locales.ts');
const detect=await loadTs('src/lib/i18n/detect.ts');
const translateMod=await loadTs('src/lib/i18n/translate.ts');
const messages=await loadTs('src/lib/i18n/messages/index.ts');
const format=await loadTs('src/lib/i18n/format.ts');

const {LOCALES,DEFAULT_LOCALE,isLocale}=locales;
const {normalizeLanguageTag,parseAcceptLanguage,localeFromCookie}=detect;
const {translate}=translateMod;
const {catalogs}=messages;
const {compareText,formatDate}=format;

assert.equal(DEFAULT_LOCALE,'en');
assert.deepEqual([...LOCALES],['vi','en','zh-Hans','es','ja']);
assert.equal(normalizeLanguageTag('vi-VN'),'vi');
assert.equal(normalizeLanguageTag('zh-CN'),'zh-Hans');
assert.equal(normalizeLanguageTag('zh-TW'),null);
assert.equal(parseAcceptLanguage('fr-FR,fr;q=0.9'),'en');
assert.equal(parseAcceptLanguage('vi,en;q=0.8'),'vi');
assert.equal(localeFromCookie('ja'),'ja');
assert.equal(localeFromCookie('nope'),null);
assert.ok(isLocale('zh-Hans'));

const enKeys=Object.keys(catalogs.en).sort();
assert.ok(enKeys.length>500,'expected a full English catalog, got '+enKeys.length);
for(const locale of LOCALES){
 const keys=Object.keys(catalogs[locale]).sort();
 const missing=enKeys.filter(k=>!Object.prototype.hasOwnProperty.call(catalogs[locale],k));
 const extra=keys.filter(k=>!Object.prototype.hasOwnProperty.call(catalogs.en,k));
 assert.equal(missing.length,0,locale+' missing keys: '+missing.slice(0,10).join(', '));
 assert.equal(extra.length,0,locale+' extra keys: '+extra.slice(0,10).join(', '));
}

assert.equal(translate('en','utilities.menu.label'),'Utilities');
assert.equal(translate('vi','utilities.menu.label'),'Tiện ích');
assert.equal(translate('en','missing.key.definitely'),'missing.key.definitely');
assert.equal(translate('ja','missing.key.definitely'),'missing.key.definitely');
assert.equal(translate('en','comments.tab.commentsCount',{count:3}),'Comments (3)');
assert.ok(compareText('en','a','b')<0);
assert.ok(formatDate('en','2024-01-15T00:00:00Z'));

console.log('i18n checks passed ('+enKeys.length+' keys × '+LOCALES.length+' locales)');
