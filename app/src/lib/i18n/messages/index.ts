import type {Locale} from '../locales';
import type {Messages} from '../translate';
import en from './en';
import vi from './vi';
import zhHans from './zh-Hans';
import es from './es';
import ja from './ja';
export const catalogs:Record<Locale,Messages>={en,vi,'zh-Hans':zhHans,es,ja};
