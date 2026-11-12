import Image from '@tiptap/extension-image';
import {mergeAttributes} from '@tiptap/core';
import {peekAtlasSession} from '@/lib/atlas-client';
import {withMediaSession} from '@/lib/media-url';

/** TipTap image: stamp rt/lib on DOM only; attrs/Markdown stay bare. */
export const MediaImage = Image.extend({
  renderHTML({HTMLAttributes}) {
    const session = peekAtlasSession() || {};
    const src = withMediaSession(String(HTMLAttributes.src || ''), session);
    return ['img', mergeAttributes(this.options.HTMLAttributes, {...HTMLAttributes, src})];
  },
});
