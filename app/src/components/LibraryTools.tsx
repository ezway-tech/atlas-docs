'use client';

import type {ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {
  Archive,
  ChevronDown,
  Globe,
  HardDrive,
  Keyboard,
  Moon,
  Paperclip,
  Sun,
  Wrench,
} from 'lucide-react';
import {LOCALES, LOCALE_LABELS, type Locale} from '@/lib/i18n/locales';
import {Button} from './ui/controls';
import {DropdownMenu, MenuItem, MenuSeparator, MenuSub} from './ui/patterns';
import {useLocale} from './LocaleProvider';
import {HelpMenuChrome} from './HelpMenu';

export default function LibraryTools({
  onBackup,
  onStorage,
  onKeymap,
  includeChrome = false,
  dark,
  onToggleTheme,
  themeDisabled,
  dirty = false,
}: {
  onBackup?: () => void;
  onStorage?: () => void;
  onKeymap?: () => void;
  /** When true, help also lives in this menu (compact header hides the Help button). */
  includeChrome?: boolean;
  dark: boolean;
  onToggleTheme: () => void;
  themeDisabled?: boolean;
  dirty?: boolean;
}) {
  const router = useRouter();
  const {t, locale, setLocale} = useLocale();
  const themeLabel = dark ? t('utilities.menu.themeLight') : t('utilities.menu.themeDark');
  const workspaceTools = !!(onBackup && onStorage && onKeymap);

  const menu = (helpItems: ReactNode = null) => (
    <DropdownMenu
      align="end"
      trigger={
        <Button className="tools-trigger" aria-label={t('utilities.menu.label')}>
          <Wrench size={16} />
          <span>{t('utilities.menu.label')}</span>
          <ChevronDown size={16} />
        </Button>
      }
    >
      {workspaceTools && (
        <>
          <MenuItem onSelect={() => router.push('/media')}>
            <Paperclip size={16} /> {t('utilities.menu.attachments')}
          </MenuItem>
          <MenuItem onSelect={onBackup}>
            <Archive size={16} /> {t('utilities.menu.backup')}
          </MenuItem>
          <MenuItem onSelect={onStorage}>
            <HardDrive size={16} /> {t('utilities.menu.storage')}
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={onKeymap}>
            <Keyboard size={16} /> {t('utilities.menu.keymap')}
          </MenuItem>
          <MenuSeparator />
        </>
      )}
      {helpItems}
      <MenuSub
        trigger={
          <>
            <Globe size={16} /> {t('utilities.menu.language')}
          </>
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
      </MenuSub>
      <MenuItem onSelect={onToggleTheme} disabled={themeDisabled}>
        {dark ? <Sun size={16} /> : <Moon size={16} />} {themeLabel}
      </MenuItem>
    </DropdownMenu>
  );

  if (!includeChrome) return menu();

  return (
    <HelpMenuChrome dirty={dirty}>
      {(items) => menu(<>{items}<MenuSeparator /></>)}
    </HelpMenuChrome>
  );
}
