'use client';

import {ChevronDown, Globe} from 'lucide-react';
import {LOCALES, LOCALE_LABELS, type Locale} from '@/lib/i18n/locales';
import {Button} from './ui/controls';
import {DropdownMenu, MenuItem} from './ui/patterns';
import {useLocale} from './LocaleProvider';

export default function LocaleMenu() {
  const {t, locale, setLocale} = useLocale();
  return (
    <DropdownMenu
      align="end"
      trigger={
        <Button className="top-help" aria-label={t('utilities.menu.language')}>
          <Globe size={16} />
          <span>{t('utilities.menu.language')}</span>
          <ChevronDown size={14} />
        </Button>
      }
    >
      {LOCALES.map((code: Locale) => (
        <MenuItem key={code} onSelect={() => setLocale(code)} disabled={code === locale}>
          <span className="lang-option">
            {LOCALE_LABELS[code]}
            {code === locale ? ' ·' : ''}
          </span>
        </MenuItem>
      ))}
    </DropdownMenu>
  );
}
