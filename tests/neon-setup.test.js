import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {neonConfig} from '@neondatabase/serverless';
import {createHandler} from '../functions/api/[[path]].js';

// Exercise the actual production Neon HTTP client, lazy query objects, transaction
// serialization, SQLSTATE propagation and PG type parsers. Only HTTP is redirected
// to an embedded PostgreSQL server; no fake SQL row results are supplied.
test('real Neon HTTP client automatically sets up a blank PostgreSQL database and completes organizer CRUD',async()=>{
  const db=new PGlite(),old=neonConfig.fetchFunction,calls=[];
  const wire=result=>({fields:result.fields,rows:result.rows.map(row=>result.fields.map(field=>{
    const v=row[field.name];if(v===null||v===undefined)return null;if(v instanceof Date)return v.toISOString().replace('T',' ').replace('Z','+00');if(typeof v==='boolean')return v?'t':'f';return String(v);
  }))});
  neonConfig.fetchFunction=async(url,options)=>{
    const data=JSON.parse(options.body);calls.push({queries:data.queries||[data],headers:options.headers});
    try{
      const result=data.queries?{results:await db.transaction(async tx=>{const results=[];for(const q of data.queries)results.push(wire(await tx.query(q.query,q.params)));return results;})}:wire(await db.query(data.query,data.params));
      return new Response(JSON.stringify(result),{status:200});
    }catch(error){return new Response(JSON.stringify({message:'Database test error (no credentials)',code:error.code}),{status:400});}
  };
  const handler=createHandler(undefined,{log:()=>{}}),env={DATABASE_URL:'postgresql://owner:example@ep-test.neon.tech/neondb?sslmode=require',ADMIN_PASSCODE:'a unique organizer passphrase'};
  const call=async(method,path,data,extra={})=>{
    const headers={Origin:'https://hall.example',...extra};if(data!==undefined)headers['Content-Type']='application/json';
    const response=await handler({request:new Request(`https://hall.example/api/${path}`,{method,headers,body:data===undefined?undefined:JSON.stringify(data)}),env});return {status:response.status,body:await response.json()};
  };
  try{
    const state=await call('GET','state');assert.equal(state.status,200,JSON.stringify(state.body));assert.equal(state.body.revision,0);assert.ok(state.body.updatedAt>0);
    const setup=calls.find(c=>c.queries.some(q=>q.query.startsWith('CREATE TABLE')));assert.ok(setup);assert.equal(setup.headers['Neon-Batch-Isolation-Level'],'ReadCommitted');assert.equal(setup.headers['Neon-Batch-Read-Only'],undefined);
    assert.equal((await call('GET','health')).status,200);
    const login=await call('POST','login',{passcode:env.ADMIN_PASSCODE});assert.equal(login.status,200,JSON.stringify(login.body));const auth={Authorization:`Bearer ${login.body.token}`};
    let r=await call('PUT','booths/1/102-R1',{org:'Protocol Society',notes:'PRIVATE'},{...auth,'If-Match':'"0"'});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.revision,1);assert.equal(r.body.days['1'].booths['102-R1'].notes,'PRIVATE');
    r=await call('PUT','rooms/1/105',{reservedFor:'Workshop'},{...auth,'If-Match':'"1"'});assert.equal(r.status,200,JSON.stringify(r.body));
    const publicRead=await call('GET','state');assert.equal('notes' in publicRead.body.days['1'].booths['102-R1'],false);
    assert.equal((await call('POST','logout',undefined,auth)).status,200);assert.equal((await call('GET','session',undefined,auth)).status,401);
    assert.equal(calls.filter(c=>c.queries.some(q=>q.query.startsWith('CREATE TABLE'))).length,1);
  }finally{neonConfig.fetchFunction=old;await db.close();}
});
