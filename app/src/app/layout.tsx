import type {Metadata} from 'next';import './globals.css';import './extras.css';
import Shell from '@/components/Shell';
export const metadata:Metadata={title:'Atlas Docs',description:'Kho kiến thức Markdown cá nhân'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="vi" suppressHydrationWarning><body><Shell>{children}</Shell></body></html>;}
