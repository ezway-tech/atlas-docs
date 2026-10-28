'use client';
import Workspace from './Workspace';
import {KeymapProvider} from './KeymapProvider';
export default function Shell({children}:{children:React.ReactNode}){return <KeymapProvider><Workspace/>{children}</KeymapProvider>;}
