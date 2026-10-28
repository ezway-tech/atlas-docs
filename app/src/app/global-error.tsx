'use client';
export default function GlobalError({error,reset}:{error:Error,reset:()=>void}){return <html lang="vi"><body style={{fontFamily:'system-ui',padding:40}}><h1>Không thể khởi động Atlas Docs</h1><pre>{error.message}</pre><button onClick={reset}>Thử lại</button></body></html>;}
