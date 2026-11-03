'use client';
import {Button} from '@/components/ui/controls';
export default function GlobalError({error,reset}:{error:Error,reset:()=>void}){return <html lang="vi"><body style={{fontFamily:'system-ui',padding:40}}><h1>Không thể khởi động Atlas Docs</h1><pre>{error.message}</pre><Button onClick={reset}>Thử lại</Button></body></html>;}
