import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createHandler} from '../functions/api/[[path]].js';
import {SCHEMA_STATEMENTS} from '../lib/schema.js';
import {initializeDatabase,withSchemaRecovery} from '../lib/setup.js';
import {hashToken} from '../lib/auth.js';
const schema=readFileSync(new URL('../schema.sql',import.meta.url),'utf8');
const env={DATABASE_URL:'postgresql://owner:example@ep-test.neon.tech/neondb?sslmode=require',ADMIN_PASSCODE:'a unique organizer passphrase'};
function driver(db,trace=[]){return {
  query:(text,params=[])=>({text,params,then(resolve,reject){trace.push(text);return db.query(text,params).then(r=>r.rows).then(resolve,reject);}}),
  transaction:(queries,options)=>{trace.push({transaction:queries.map(q=>q.text),options});return db.transaction(async tx=>{const result=[];for(const q of queries)result.push((await tx.query(q.text,q.params)).rows);return result;});}
};}
function api(db,trace=[]){const handler=createHandler(()=>driver(db,trace),{log:()=>{}});return async(method,path,data,extra={})=>{
  const headers={Origin:'https://hall.example',...extra};if(data!==undefined)headers['Content-Type']='application/json';
  const response=await handler({request:new Request(`https://hall.example/api/${path}`,{method,headers,body:data===undefined?undefined:JSON.stringify(data)}),env});
  return {status:response.status,body:await response.json()};
};}
const ddl=trace=>trace.flatMap(x=>typeof x==='object'?x.transaction:[x]).filter(q=>/^CREATE /i.test(q));

test('bundled automatic setup matches manual SQL and permits only additive statements',()=>{
  const parsed=schema.replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean);
  assert.deepEqual(SCHEMA_STATEMENTS,parsed);
  for(const statement of SCHEMA_STATEMENTS){
    assert.match(statement,/^(CREATE TABLE IF NOT EXISTS public\.|CREATE INDEX IF NOT EXISTS |INSERT INTO public\.event_meta \(id\) VALUES \(true\) ON CONFLICT DO NOTHING$)/);
    assert.doesNotMatch(statement,/\b(DROP|TRUNCATE|ALTER|DELETE|UPDATE)\b/i);
  }
});
test('empty database: health stays read-only, first state request provisions all tables, subsequent reads do not run DDL',async()=>{
  const db=new PGlite(),trace=[],call=api(db,trace);
  try{
    const before=await call('GET','health');assert.equal(before.status,503);assert.equal(before.body.missingTables.length,6);assert.equal(ddl(trace).length,0);
    const response=await call('GET','state');assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.revision,0);assert.deepEqual(Object.keys(response.body.days),['1','2','3']);
    assert.equal(ddl(trace).length,7);assert.equal((await call('GET','health')).status,200);
    const count=ddl(trace).length;assert.equal((await call('GET','state')).status,200);assert.equal(ddl(trace).length,count);
  }finally{await db.close();}
});
test('original four-table upgrade preserves every existing assignment, title, note and login counter, then supports auth and writes',async()=>{
  const db=new PGlite(),call=api(db);
  try{
    await db.exec(schema.split('-- Shared revision')[0]);
    await db.exec(`INSERT INTO public.event_days(day,title) VALUES(1,'Opening Day'),(2,'Workshops');
      INSERT INTO public.booth_assignments(day,booth_id,org,rep,description,notes,color,status) VALUES(1,'102-R1','Psych Society','Representative','Welcome','PRIVATE EXISTING NOTES','#2563EB','assigned');
      INSERT INTO public.room_reservations(day,room_id,reserved_for,note,paper) VALUES(2,'105','Workshop','1–3 PM','#FFE680');
      INSERT INTO public.login_attempts(ip,fails) VALUES('existing-ip',3);`);
    const tables=['event_days','booth_assignments','room_reservations','login_attempts'];
    const before=await Promise.all(tables.map(t=>db.query(`SELECT * FROM public.${t}`)));
    const read=await call('GET','state');assert.equal(read.status,200,JSON.stringify(read.body));assert.equal(read.body.days['1'].booths['102-R1'].org,'Psych Society');assert.equal('notes' in read.body.days['1'].booths['102-R1'],false);assert.equal(read.body.days['2'].rooms['105'].reservedFor,'Workshop');
    for(let i=0;i<tables.length;i++)assert.deepEqual((await db.query(`SELECT * FROM public.${tables[i]}`)).rows,before[i].rows);
    const login=await call('POST','login',{passcode:env.ADMIN_PASSCODE});assert.equal(login.status,200);
    const auth={Authorization:`Bearer ${login.body.token}`};const privateRead=await call('GET','state',undefined,auth);assert.equal(privateRead.body.days['1'].booths['102-R1'].notes,'PRIVATE EXISTING NOTES');
    const update=await call('PUT','booths/3/DEAN-G1',{org:'New Council',notes:'Internal'}, {...auth,'If-Match':'"0"'});assert.equal(update.status,200,JSON.stringify(update.body));assert.equal(update.body.revision,1);assert.equal(update.body.days['1'].booths['102-R1'].notes,'PRIVATE EXISTING NOTES');
    const room=await call('PUT','rooms/3/'+encodeURIComponent('214–215'),{reservedFor:'Upstairs workshop'},{...auth,'If-Match':'"1"'});assert.equal(room.status,200,JSON.stringify(room.body));
    const logout=await call('POST','logout',undefined,auth);assert.equal(logout.status,200);assert.equal((await call('GET','session',undefined,auth)).status,401);
  }finally{await db.close();}
});
test('login before any state request also initializes the database, and counts one login attempt',async()=>{
  const db=new PGlite(),call=api(db);
  try{const login=await call('POST','login',{passcode:env.ADMIN_PASSCODE});assert.equal(login.status,200,JSON.stringify(login.body));assert.equal((await db.query('SELECT fails FROM public.login_attempts')).rows[0].fails,1);assert.equal((await call('GET','health')).status,200);}
  finally{await db.close();}
});
test('missing organizer session table is recovered without double-counting login attempts',async()=>{
  const db=new PGlite(),call=api(db);
  try{await db.exec(schema);await db.exec('DROP TABLE public.organizer_sessions');const login=await call('POST','login',{passcode:env.ADMIN_PASSCODE});assert.equal(login.status,200);assert.equal((await db.query('SELECT fails FROM public.login_attempts')).rows[0].fails,1);}
  finally{await db.close();}
});
test('missing metadata initialization row is repaired; existing revisions and sessions are not reset by reruns',async()=>{
  const db=new PGlite(),call=api(db);
  try{
    await db.exec(schema);await db.exec('DELETE FROM public.event_meta');assert.equal((await call('GET','state')).status,200);
    await db.exec('UPDATE public.event_meta SET revision=42');const hash=await hashToken('a'.repeat(64));await db.query("INSERT INTO public.organizer_sessions(token_hash,expires_at) VALUES($1,now()+interval '8 hours')",[hash]);
    const sql=driver(db);await initializeDatabase(sql);await initializeDatabase(sql);
    assert.equal((await call('GET','state')).body.revision,42);assert.equal((await db.query('SELECT token_hash FROM public.organizer_sessions')).rows[0].token_hash,hash);
  }finally{await db.close();}
});
test('in-flight setup shares work; concurrent first requests and independent clients are safe',async()=>{
  const db=new PGlite(),trace=[],sql=driver(db,trace),call=api(db);
  try{
    // Race actual first requests against an entirely blank database, with a new
    // driver per request (as happens in separate Cloudflare invocations).
    const results=await Promise.all(Array.from({length:4},()=>call('GET','state')));assert.ok(results.every(r=>r.status===200));
    await Promise.all([initializeDatabase(sql),initializeDatabase(sql),initializeDatabase(sql)]);assert.equal(ddl(trace).length,7);
    await Promise.all([initializeDatabase(driver(db)),initializeDatabase(driver(db))]);assert.equal((await db.query('SELECT count(*) AS n FROM public.event_meta')).rows[0].n,1);
  }finally{await db.close();}
});
test('failed migration rolls back completely without altering or dropping existing incompatible tables/data',async()=>{
  const db=new PGlite(),call=api(db);
  try{
    await db.exec("CREATE TABLE public.organizer_sessions(token_hash text PRIMARY KEY);INSERT INTO public.organizer_sessions VALUES ('keep-me');");
    const result=await call('GET','state');assert.equal(result.status,503);assert.equal(result.body.code,'DB_SCHEMA_OUTDATED');
    assert.equal((await db.query("SELECT to_regclass('public.event_days') AS table_name")).rows[0].table_name,null);
    assert.equal((await db.query('SELECT * FROM public.organizer_sessions')).rows[0].token_hash,'keep-me');
  }finally{await db.close();}
});
test('DDL permission failure explains exact one-time owner action and leaves database unchanged',async()=>{
  const db=new PGlite(),call=api(db);
  try{
    await db.exec('CREATE ROLE limited_app;GRANT USAGE ON SCHEMA public TO limited_app;REVOKE CREATE ON SCHEMA public FROM PUBLIC;SET ROLE limited_app;');
    const result=await call('GET','state');assert.equal(result.status,503);assert.equal(result.body.code,'DB_SETUP_PERMISSION_DENIED');assert.match(result.body.error,/database-owner/);
    await db.exec('RESET ROLE');assert.equal((await db.query("SELECT to_regclass('public.event_days') AS table_name")).rows[0].table_name,null);
  }finally{await db.close();}
});
test('only known missing-table/metadata errors trigger setup, retry budget is one, and a failed setup can retry later',async()=>{
  for(const code of ['28P01','42501','42703','08006',undefined]){
    let ddlCalls=0;const sql={transaction:()=>{ddlCalls++;throw new Error('must not initialize');}};
    const error=Object.assign(new Error('original'),{code});await assert.rejects(()=>withSchemaRecovery(sql,()=>Promise.reject(error)),e=>e===error);assert.equal(ddlCalls,0);
  }
  let attempts=0,setups=0;const sql={query:(text,params)=>({text,params}),transaction:async()=>{setups++;}};
  await assert.rejects(()=>withSchemaRecovery(sql,()=>{attempts++;throw Object.assign(new Error('still missing'),{code:'42P01'});}));assert.equal(attempts,2);assert.equal(setups,1);
  let fail=true;sql.transaction=async()=>{if(fail)throw Object.assign(new Error('busy'),{code:'55P03'});};await assert.rejects(()=>initializeDatabase(sql),e=>e.code==='DB_SETUP_BUSY');fail=false;await initializeDatabase(sql);
});
