'use client';

import {Moon, Sun} from 'lucide-react';
import {Button} from './ui/controls';
import {useLocale} from './LocaleProvider';

/** Shared top-bar theme control (same chrome as Help / Language). */
export default function ThemeToggle({
  dark,
  onToggle,
  disabled,
}: {
  dark: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const {t} = useLocale();
  const label = dark ? t('utilities.menu.themeLight') : t('utilities.menu.themeDark');
  return (
    <Button className="top-help" aria-label={label} disabled={disabled} onClick={onToggle}>
      {dark ? <Sun size={16} /> : <Moon size={16} />}
      <span>{label}</span>
    </Button>
  );
}
