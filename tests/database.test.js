import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {neonConfig} from '@neondatabase/serverless';
import {databaseConnectionString,checkDatabase,databaseFailure,safeDatabaseLog} from '../lib/database.js';
import {createHandler} from '../functions/api/[[path]].js';
const valid='postgresql://owner:example@ep-test.neon.tech/neondb?sslmode=require';
const silent={log:()=>{}};
const get=(path='state')=>new Request(`https://hall.pages.dev/api/${path}`);

test('DATABASE_URL whitespace is accepted; incomplete values and command wrappers are rejected safely',()=>{
  assert.equal(databaseConnectionString(`  ${valid}\n`),valid);
  for(const raw of ['',undefined,'neon-api-key',`psql '${valid}'`,`'${valid}'`,`DATABASE_URL=${valid}`,'https://neon.tech','postgresql://host/db','postgresql://owner:pass@host/']){
    assert.throws(()=>databaseConnectionString(raw),e=>{assert.match(e.code,/DB_NOT_CONFIGURED|DB_URL_INVALID/);assert.equal(e.message.includes('owner:example'),false);return true;});
  }
});
test('diagnostics distinguish auth, schema, permissions, network and programming failures without leaking raw errors',()=>{
  for(const [code,expected] of [['28P01','DB_AUTH_FAILED'],['42P01','DB_SCHEMA_MISSING'],['42703','DB_SCHEMA_OUTDATED'],['42501','DB_PERMISSION_DENIED'],['3D000','DB_DATABASE_NOT_FOUND'],['08006','DB_CONNECTION_FAILED']]){
    const error=Object.assign(new Error(`SECRET ${valid}`),{code});const d=databaseFailure(error);
    assert.equal(d.code,expected);assert.equal(d.status,503);assert.ok(!JSON.stringify(d).includes('SECRET'));assert.ok(!JSON.stringify(safeDatabaseLog(error,d,'ref')).includes(valid));
  }
  assert.equal(databaseFailure(new Error('Error connecting to database: fetch failed')).code,'DB_CONNECTION_FAILED');
  assert.equal(databaseFailure(new TypeError('SECRET application bug')).code,'API_INTERNAL_ERROR');
  assert.equal(databaseFailure(new TypeError('SECRET application bug')).status,500);
});
test('health identifies original four-table schema, missing metadata row, missing columns and complete schema without returning data',async()=>{
  const db=new PGlite();
  const sql={query:async(q,args)=>(await db.query(q,args)).rows};
  try{
    const schema=readFileSync(new URL('../schema.sql',import.meta.url),'utf8');
    await db.exec(schema.split('-- Shared revision')[0]);
    await assert.rejects(()=>checkDatabase(sql),e=>{assert.equal(e.code,'DB_SCHEMA_INCOMPLETE');assert.deepEqual(e.details.missingTables,['event_meta','organizer_sessions']);return true;});
    await db.exec(schema);assert.deepEqual(await checkDatabase(sql),{ok:true,database:'connected',schema:'ready'});
    await db.exec('DELETE FROM public.event_meta');await assert.rejects(()=>checkDatabase(sql),e=>e.code==='DB_SCHEMA_UNINITIALIZED');
    await db.exec(schema);await db.exec('ALTER TABLE public.booth_assignments DROP COLUMN notes');
    await assert.rejects(()=>checkDatabase(sql),e=>{assert.deepEqual(e.details.missingColumns,{booth_assignments:['notes']});return true;});
  }finally{await db.close();}
});
test('real Neon HTTP driver sends supported repeatable-read transaction options and parses state',async()=>{
  const old=neonConfig.fetchFunction;let calls=0;
  neonConfig.fetchFunction=async(url,options)=>{
    calls++;const body=JSON.parse(options.body);assert.equal(body.queries.length,4);
    assert.equal(options.headers['Neon-Batch-Isolation-Level'],'RepeatableRead');assert.equal(options.headers['Neon-Batch-Read-Only'],'true');
    assert.ok(body.queries.every(q=>q.query.includes('public.')));
    return new Response(JSON.stringify({results:[
      {fields:[{name:'revision',dataTypeID:23},{name:'updated_at',dataTypeID:1184}],rows:[['0','2026-11-21 00:00:00+00']]},
      ...Array.from({length:3},()=>({fields:[],rows:[]}))
    ]}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  try{const response=await createHandler(undefined,silent)({request:get(),env:{DATABASE_URL:valid}});assert.equal(response.status,200);const state=await response.json();assert.equal(state.revision,0);assert.equal(state.updatedAt,1795219200000);assert.equal(calls,1);}
  finally{neonConfig.fetchFunction=old;}
});
test('real Neon transport failures produce safe actionable responses and matching log references',async()=>{
  const old=neonConfig.fetchFunction;const logs=[];
  try{
    for(const [code,expected] of [['28P01','DB_AUTH_FAILED'],['42P01','DB_SCHEMA_MISSING'],['42501','DB_PERMISSION_DENIED']]){
      neonConfig.fetchFunction=async()=>new Response(JSON.stringify({message:`SECRET ${valid}`,code}),{status:400});
      const r=await createHandler(undefined,{log:x=>logs.push(x)})({request:get(),env:{DATABASE_URL:valid}}),body=await r.json();
      assert.equal(r.status,503);assert.equal(body.code,expected);assert.match(body.requestId,/^[0-9a-f-]{36}$/);assert.equal(logs.at(-1).requestId,body.requestId);assert.equal(logs.at(-1).sqlstate,code);assert.ok(!JSON.stringify(body).includes('SECRET'));
    }
    neonConfig.fetchFunction=async()=>{throw new Error(`fetch failed ${valid}`);};
    const r=await createHandler(undefined,{log:x=>logs.push(x)})({request:get(),env:{DATABASE_URL:valid}});assert.equal((await r.json()).code,'DB_CONNECTION_FAILED');
    assert.ok(!JSON.stringify(logs).includes(valid));
  }finally{neonConfig.fetchFunction=old;}
});
test('health does not require organizer login and returns only diagnostic allowlists',async()=>{
  let invoked=0;const r=await createHandler(()=>{invoked++;throw new Error('Never reaches this factory with invalid URL');},silent)({request:get('health'),env:{DATABASE_URL:`psql '${valid}'`}});
  const body=await r.json();assert.equal(r.status,503);assert.equal(body.code,'DB_URL_INVALID');assert.equal(invoked,0);assert.ok(!JSON.stringify(body).includes(valid));
});
