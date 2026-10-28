'use client';
import {useEffect} from 'react';
export default function ErrorPage({error,reset}:{error:Error&{digest?:string};reset:()=>void}){useEffect(()=>{console.error('[Atlas Docs]',error);},[error]);return <main style={{padding:40,maxWidth:700,margin:'10vh auto',fontFamily:'system-ui'}}><h1>Atlas Docs gặp lỗi</h1><pre style={{whiteSpace:'pre-wrap',padding:20,background:'#f0f3f9',color:'#34435e'}}>{error.message}{error.digest?'\nDigest: '+error.digest:''}</pre><button onClick={reset}>Thử lại</button><a href="/"> Về trang chủ</a></main>;}
