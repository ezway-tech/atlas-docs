import Help from '@/components/Help';
import docs from '@/generated/help.json';
import {notFound} from 'next/navigation';
export function generateStaticParams(){return docs.map(d=>({slug:d.slug}));}
export default async function Page({params}:{params:Promise<{slug:string}>}){const {slug}=await params;if(!docs.some(d=>d.slug===slug))notFound();return <Help slug={slug}/>;}
