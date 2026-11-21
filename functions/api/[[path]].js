import { neon } from '@neondatabase/serverless';
import { blankState,DAYS,cleanBooth,boothEmpty,cleanRoom,cleanImport,text,validateDay,validateId } from '../../lib/model.js';
import { hashToken,randomToken,verifyPasscode } from '../../lib/auth.js';
import { DatabaseSetupError,databaseConnectionString,checkDatabase,databaseFailure,safeDatabaseLog } from '../../lib/database.js';
import { withSchemaRecovery } from '../../lib/setup.js';

const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Vary':'Authorization'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new HttpError(status,message);};
async function body(request){
  if(!request.headers.get('content-type')?.includes('application/json')) fail(415,'Send application/json');
  if(Number(request.headers.get('content-length'))>100000) fail(413,'Request too large');
  const reader=request.body?.getReader();if(!reader) fail(400,'Missing JSON body');
  let bytes=0;const chunks=[];
  for(;;){const {done,value}=await reader.read();if(done) break;bytes+=value.byteLength;if(bytes>100000){await reader.cancel();fail(413,'Request too large');}chunks.push(value);}
  const data=new Uint8Array(bytes);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}
  try{return JSON.parse(new TextDecoder().decode(data));}catch{fail(400,'Invalid JSON');}
}
function sameOrigin(request){
  const origin=request.headers.get('origin');
  if((origin&&origin!==new URL(request.url).origin)||request.headers.get('sec-fetch-site')==='cross-site') fail(403,'Cross-origin writes are not allowed');
}
async function session(sql,request){
  const h=request.headers.get('authorization');if(!h) return null;
  if(!/^Bearer [a-f0-9]{64}$/.test(h)) fail(401,'Session expired. Sign in again.');
  const hash=await hashToken(h.slice(7));
  const rows=await withSchemaRecovery(sql,()=>sql.query('SELECT token_hash FROM public.organizer_sessions WHERE token_hash=$1 AND expires_at>now()',[hash]));
  if(!rows.length) fail(401,'Session expired. Sign in again.');
  return hash;
}
async function readState(sql,privateView){
  return withSchemaRecovery(sql,async()=>{
    const [meta,days,booths,rooms]=await sql.transaction([
      sql.query('SELECT revision,updated_at FROM public.event_meta WHERE id=true',[]),
      sql.query('SELECT day,title FROM public.event_days',[]),
      sql.query(`SELECT day,booth_id,org,rep,description,color,status${privateView?',notes':''} FROM public.booth_assignments`,[]),
      sql.query('SELECT day,room_id,reserved_for,note,paper FROM public.room_reservations',[])
    ],{isolationLevel:'RepeatableRead',readOnly:true});
    if(!meta.length) throw new DatabaseSetupError('DB_SCHEMA_UNINITIALIZED','The event_meta initialization row is missing. Run the complete schema.sql, including its INSERT statement.');
    const state=blankState();state.revision=meta[0].revision;state.updatedAt=new Date(meta[0].updated_at).getTime();
    for(const r of days) state.days[r.day].title=r.title;
    for(const r of booths){const {day,booth_id,...b}=r;state.days[day].booths[booth_id]=b;}
    for(const r of rooms) state.days[r.day].rooms[r.room_id]={reservedFor:r.reserved_for,note:r.note,paper:r.paper};
    return state;
  });
}
const GUARD='EXISTS (SELECT 1 FROM public.event_meta WHERE id=true AND revision=$1)';
async function write(sql,request,queries){
  const match=request.headers.get('if-match');
  if(!match||!/^"\d+"$/.test(match)) fail(428,'A current state revision is required');
  const revision=Number(match.slice(1,-1));if(!Number.isSafeInteger(revision)||revision>2147483646) fail(400,'Invalid revision');
  const result=await withSchemaRecovery(sql,()=>sql.transaction([
    sql.query('SELECT pg_advisory_xact_lock(20261121)',[]),
    ...queries.map(([q,args])=>sql.query(q,[revision,...args])),
    sql.query('UPDATE public.event_meta SET revision=revision+1,updated_at=now() WHERE id=true AND revision=$1 RETURNING revision',[revision])
  ]));
  if(!result.at(-1).length) fail(409,'Someone changed the plan. The latest version has been loaded; review and try again.');
}
const upsertDay=(day,title)=>[`INSERT INTO public.event_days(day,title) SELECT $2,$3 WHERE ${GUARD} ON CONFLICT(day) DO UPDATE SET title=EXCLUDED.title,updated_at=now()`,[day,title]];
const upsertBooth=(day,id,b)=>[`INSERT INTO public.booth_assignments(day,booth_id,org,rep,description,notes,color,status) SELECT $2,$3,$4,$5,$6,$7,$8,$9 WHERE ${GUARD} ON CONFLICT(day,booth_id) DO UPDATE SET org=EXCLUDED.org,rep=EXCLUDED.rep,description=EXCLUDED.description,notes=EXCLUDED.notes,color=EXCLUDED.color,status=EXCLUDED.status,updated_at=now()`,[day,id,b.org,b.rep,b.description,b.notes,b.color,b.status]];
const upsertRoom=(day,id,r)=>[`INSERT INTO public.room_reservations(day,room_id,reserved_for,note,paper) SELECT $2,$3,$4,$5,$6 WHERE ${GUARD} ON CONFLICT(day,room_id) DO UPDATE SET reserved_for=EXCLUDED.reserved_for,note=EXCLUDED.note,paper=EXCLUDED.paper,updated_at=now()`,[day,id,r.reservedFor,r.note,r.paper]];
export function createHandler(database=neon,{log=record=>console.error(JSON.stringify(record))}={}){return async function onRequest({request,env}){
  const requestId=crypto.randomUUID();
  try{
    const url=new URL(request.url),parts=url.pathname.replace(/^\/api\/?/,'').split('/').filter(Boolean).map(decodeURIComponent),route=parts[0],method=request.method;
    const localHost=['localhost','127.0.0.1','0.0.0.0'].includes(url.hostname)||url.hostname.endsWith('.e2b.app');
    if(route==='config'&&method==='GET'&&parts.length===1) return json({demo:env.DEMO_MODE==='true'&&localHost});
    const sql=database(databaseConnectionString(env.DATABASE_URL));
    if(route==='health'&&method==='GET'&&parts.length===1) return json(await checkDatabase(sql));
    if(method!=='GET') sameOrigin(request);
    if(route==='login'&&method==='POST'&&parts.length===1){
      if(!env.ADMIN_PASSCODE||env.ADMIN_PASSCODE.length<16) fail(503,'Set ADMIN_PASSCODE to a unique passphrase of at least 16 characters.');
      const input=await body(request);
      // Increment BEFORE checking, atomically, including successful attempts. Concurrent guesses share the limit.
      const ip=(request.headers.get('CF-Connecting-IP')||'local').slice(0,100);
      const attempts=await withSchemaRecovery(sql,()=>sql.query(`INSERT INTO public.login_attempts(ip,fails,first_fail) VALUES($1,1,now()) ON CONFLICT(ip) DO UPDATE SET fails=CASE WHEN login_attempts.first_fail<now()-interval '15 minutes' THEN 1 ELSE login_attempts.fails+1 END,first_fail=CASE WHEN login_attempts.first_fail<now()-interval '15 minutes' THEN now() ELSE login_attempts.first_fail END RETURNING fails`,[ip]));
      if(attempts[0].fails>10) fail(429,'Too many sign-in attempts. Wait 15 minutes.');
      if(!await verifyPasscode(input?.passcode,env.ADMIN_PASSCODE)) fail(401,'Incorrect passcode');
      const token=randomToken(),hash=await hashToken(token);
      await withSchemaRecovery(sql,()=>sql.transaction([
        sql.query('DELETE FROM public.organizer_sessions WHERE expires_at<=now()',[]),
        sql.query("DELETE FROM public.login_attempts WHERE first_fail<now()-interval '1 day'",[]),
        sql.query("INSERT INTO public.organizer_sessions(token_hash,expires_at) VALUES($1,now()+interval '8 hours')",[hash])
      ]));
      return json({ok:true,token});
    }
    const who=await session(sql,request);
    if(route==='state'&&method==='GET'&&parts.length===1) return json(await readState(sql,!!who));
    if(route==='session'&&method==='GET'&&parts.length===1){if(!who) fail(401,'Sign in first');return json({ok:true});}
    if(!who) fail(401,'Organizer sign-in required');
    if(route==='logout'&&method==='POST'&&parts.length===1){await withSchemaRecovery(sql,()=>sql.query('DELETE FROM public.organizer_sessions WHERE token_hash=$1',[who]));return json({ok:true});}
    let queries=[];
    try{
      if(route==='booths'&&method==='PUT'&&parts.length===3){
        const day=validateDay(parts[1]),id=validateId('booths',parts[2]),b=cleanBooth(await body(request));
        queries=boothEmpty(b)?[[`DELETE FROM public.booth_assignments WHERE day=$2 AND booth_id=$3 AND ${GUARD}`,[day,id]]]:[upsertBooth(day,id,b)];
      }else if(route==='rooms'&&method==='PUT'&&parts.length===3){
        const day=validateDay(parts[1]),id=validateId('rooms',parts[2]),r=cleanRoom(await body(request));
        queries=r.reservedFor?[upsertRoom(day,id,r)]:[[`DELETE FROM public.room_reservations WHERE day=$2 AND room_id=$3 AND ${GUARD}`,[day,id]]];
      }else if(route==='days'&&parts.length===2&&method==='PUT'){
        queries=[upsertDay(validateDay(parts[1]),text((await body(request))?.title,48))];
      }else if(route==='days'&&parts.length===2&&method==='DELETE'){
        const day=validateDay(parts[1]);queries=['public.booth_assignments','public.room_reservations'].map(t=>[`DELETE FROM ${t} WHERE day=$2 AND ${GUARD}`,[day]]);
      }else if(route==='import'&&parts.length===1&&method==='POST'){
        const data=cleanImport(await body(request));
        queries=['public.booth_assignments','public.room_reservations','public.event_days'].map(t=>[`DELETE FROM ${t} WHERE ${GUARD}`,[]]);
        for(const day of DAYS){
          queries.push(upsertDay(day,data.days[day].title));
          for(const [id,b] of Object.entries(data.days[day].booths)) queries.push(upsertBooth(day,id,b));
          for(const [id,r] of Object.entries(data.days[day].rooms)) queries.push(upsertRoom(day,id,r));
        }
      }else fail(404,'API route not found');
    }catch(e){if(e instanceof HttpError) throw e;fail(400,e.message);}
    await write(sql,request,queries);
    return json(await readState(sql,true));
  }catch(e){
    if(e instanceof HttpError) return json({ok:false,error:e.message},e.status);
    const {status,...diagnostic}=databaseFailure(e);
    log(safeDatabaseLog(e,diagnostic,requestId));
    return json({ok:false,...diagnostic,requestId},status);
  }
};
}
export const onRequest=createHandler();
