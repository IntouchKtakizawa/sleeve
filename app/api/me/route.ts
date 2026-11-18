import {getChatGPTUser} from '../../chatgpt-auth';
export async function GET(){const u=await getChatGPTUser();return Response.json({user:u?{name:u.fullName||'Listener'}:null},{headers:{'Cache-Control':'no-store'}})}
