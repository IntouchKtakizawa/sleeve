export type Song={id:number,title:string,artist:string,album:string,art:string,url:string,genre:string,year:string};
export type Rating={trackId:number,song:Song,score:number,note:string,updatedAt:string,favourite?:boolean};
export const STORAGE_KEY='sleeve.library.v1';
const fail=()=>{throw new Error('This is not a valid Sleeve backup. Your collection has not changed.')};
export function validateRatings(value:unknown):Rating[]{
 if(!Array.isArray(value)||value.length>10000)return fail();
 return value.map((r:any)=>{
 const s=r?.song;
 if(!s||!Number.isSafeInteger(s.id)||s.id<1||r.trackId!==s.id||typeof s.title!=='string'||!s.title.trim()||typeof s.artist!=='string'||typeof r.score!=='number'||!Number.isFinite(r.score)||r.score<0||r.score>10||typeof r.note!=='string'||r.note.length>1000||typeof r.updatedAt!=='string'||!Number.isFinite(Date.parse(r.updatedAt)))return fail();
 const safe=(u:unknown,domain:RegExp)=>{if(typeof u!=='string')return '';try{const v=new URL(u);return v.protocol==='https:'&&domain.test(v.hostname)?v.href:''}catch{return ''}};
 return {trackId:s.id,song:{id:s.id,title:s.title.slice(0,250),artist:s.artist.slice(0,250),album:String(s.album||'').slice(0,250),art:safe(s.art,/(^|\.)mzstatic\.com$/),url:safe(s.url,/^(music|itunes)\.apple\.com$/),genre:String(s.genre||'').slice(0,80),year:String(s.year||'').slice(0,4)},score:Math.round(r.score*10)/10,note:r.note,updatedAt:new Date(r.updatedAt).toISOString(),favourite:r.favourite===true};
 });
}
export function parseBackup(raw:string):Rating[]{const d=JSON.parse(raw);if(d?.app!=='sleeve'||d.version!==1)return fail();return mergeRatings([],validateRatings(d.ratings))}
export function mergeRatings(existing:Rating[],incoming:Rating[]):Rating[]{const map=new Map<number,Rating>();for(const r of [...existing,...incoming]){const old=map.get(r.trackId);if(!old||r.updatedAt>=old.updatedAt)map.set(r.trackId,r)}return [...map.values()]}
export function backup(ratings:Rating[]){return JSON.stringify({app:'sleeve',version:1,exportedAt:new Date().toISOString(),ratings},null,2)}
export function csv(ratings:Rating[]){const cell=(v:unknown)=>'"'+String(v??'').replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')+'"';return '\uFEFF'+[['Song','Artist','Album','Score','Favourite','Notes','Rated at'],...ratings.map(r=>[r.song.title,r.song.artist,r.song.album,r.score,r.favourite?'Yes':'No',r.note,r.updatedAt])].map(row=>row.map(cell).join(',')).join('\r\n')}
