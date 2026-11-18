import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Sleeve — Your music, on record',description:'Find a song. Feel something. Put it on record. Your personal music rating journal.',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
