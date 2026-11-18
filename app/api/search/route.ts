export async function GET(req:Request){
 const q=(new URL(req.url).searchParams.get('q')||'').trim().slice(0,150);
 if(!q)return Response.json({songs:[]});
 try{const r=await fetch('https://itunes.apple.com/search?'+new URLSearchParams({term:q,entity:'song',media:'music',limit:'36',country:'US'}),{signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('Catalogue status '+r.status);const data=await r.json() as any;
 return Response.json({songs:data.results.filter((s:any)=>s.trackId).map((s:any)=>({id:s.trackId,title:s.trackName,artist:s.artistName,album:s.collectionName,art:s.artworkUrl100?.replace('100x100bb','600x600bb'),url:s.trackViewUrl,genre:s.primaryGenreName,year:s.releaseDate?.slice(0,4)}))},{headers:{'Cache-Control':'public, max-age=300'}});
 }catch(e){console.error('Catalogue request failed',String(e));return Response.json({error:'The music catalogue is taking a break. Please try again.'},{status:502})}
}
