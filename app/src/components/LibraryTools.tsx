'use client';

import {useRouter} from 'next/navigation';
import {Archive, ChevronDown, HardDrive, Keyboard, Paperclip, Wrench} from 'lucide-react';
import {Button} from './ui/controls';
import {DropdownMenu, MenuItem, MenuSeparator} from './ui/patterns';
import {useLocale} from './LocaleProvider';

export default function LibraryTools({
  onBackup,
  onStorage,
  onKeymap,
}: {
  onBackup: () => void;
  onStorage: () => void;
  onKeymap: () => void;
}) {
  const router = useRouter();
  const {t} = useLocale();
  return (
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
    </DropdownMenu>
  );
}
