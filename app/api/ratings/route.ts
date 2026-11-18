import {getChatGPTUser} from '../../chatgpt-auth';
import {getDb} from '../../../db';
import {ratings} from '../../../db/schema';
import {eq,and,desc} from 'drizzle-orm';
export async function GET(){const u=await getChatGPTUser();if(!u)return Response.json({error:'Sign in to see your collection'},{status:401});const rows=await getDb().select().from(ratings).where(eq(ratings.userId,u.userId)).orderBy(desc(ratings.updatedAt));return Response.json({ratings:rows.map(r=>({...r,song:JSON.parse(r.song),userId:undefined}))},{headers:{'Cache-Control':'no-store'}})}
export async function POST(req:Request){
 const u=await getChatGPTUser();if(!u)return Response.json({error:'Sign in to save your rating'},{status:401});
 if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 let b:any;try{if(Number(req.headers.get('content-length')||0)>20000)throw Error();b=await req.json()}catch{return Response.json({error:'Invalid request'},{status:400})}
 const s=b.song;if(!s||!Number.isSafeInteger(s.id)||s.id<1||typeof s.title!=='string'||typeof s.artist!=='string'||typeof b.score!=='number'||!Number.isFinite(b.score)||b.score<0||b.score>10||typeof b.note!=='string'||b.note.length>1000)return Response.json({error:'Invalid rating'},{status:400});
 const safe={id:s.id,title:s.title.slice(0,250),artist:s.artist.slice(0,250),album:String(s.album||'').slice(0,250),art:typeof s.art==='string'&&/^https:\/\/[^/]+\.mzstatic\.com\//.test(s.art)?s.art:'',url:typeof s.url==='string'&&/^https:\/\/(music|itunes)\.apple\.com\//.test(s.url)?s.url:'',genre:String(s.genre||'').slice(0,80),year:String(s.year||'').slice(0,4)};
 const values={userId:u.userId,trackId:s.id,song:JSON.stringify(safe),score:Math.round(b.score*10)/10,note:b.note,updatedAt:new Date().toISOString()};
 await getDb().insert(ratings).values(values).onConflictDoUpdate({target:[ratings.userId,ratings.trackId],set:{song:values.song,score:values.score,note:values.note,updatedAt:values.updatedAt}});return Response.json({ok:true})
}
export async function DELETE(req:Request){const u=await getChatGPTUser();if(!u)return Response.json({error:'Sign in required'},{status:401});if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Invalid origin'},{status:403});const id=Number(new URL(req.url).searchParams.get('id'));if(!Number.isSafeInteger(id))return Response.json({error:'Invalid ID'},{status:400});await getDb().delete(ratings).where(and(eq(ratings.userId,u.userId),eq(ratings.trackId,id)));return Response.json({ok:true})}
