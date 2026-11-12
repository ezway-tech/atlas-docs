'use client';

import {BookOpen} from 'lucide-react';
import {useLocale} from './LocaleProvider';
import styles from './WorkspaceLoading.module.css';

export default function WorkspaceLoading(){
 const {t}=useLocale();
 return <div className={styles.screen}>
  <div className={styles.content} role="status" aria-live="polite">
   <div className={styles.art} aria-hidden="true">
    <div className={styles.halo}/>
    <div className={`${styles.page} ${styles.back}`}/>
    <div className={`${styles.page} ${styles.front}`}>
     <span className={styles.icon}><BookOpen size={30} strokeWidth={1.6}/></span>
     <span className={styles.line}/><span className={styles.line}/><span className={styles.line}/>
    </div>
    <span className={styles.spark}/>
   </div>
   <h1 className={styles.title}>Atlas <span>Docs</span></h1>
   <p className={styles.label}>{t('common.loading')}</p>
   <div className={styles.track} aria-hidden="true"><span/></div>
  </div>
 </div>;
}
