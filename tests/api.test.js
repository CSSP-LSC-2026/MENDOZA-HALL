import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createHandler} from '../functions/api/[[path]].js';
import {blankState} from '../lib/model.js';
let db,handler,token,revision;
const env={DATABASE_URL:'test-database',ADMIN_PASSCODE:'a unique organizer passphrase'};
// The production driver is lazy; this adapter executes the exact production SQL
// in real embedded PostgreSQL, with transaction rollback and no Neon credentials.
function driver(){return {
  query:(text,params=[])=>({text,params,then(resolve,reject){return db.query(text,params).then(r=>r.rows).then(resolve,reject);}}),
  transaction:queries=>db.transaction(async tx=>{const results=[];for(const q of queries){const result=await tx.query(q.text,q.params);results.push(result.rows);}return results;})
};}
async function call(method,path,data,{auth=true,rev=revision,origin='https://hall.example',...extra}={}){
  const headers={Origin:origin,...extra};if(data!==undefined)headers['Content-Type']='application/json';if(auth&&token)headers.Authorization=`Bearer ${token}`;if(rev!==undefined)headers['If-Match']=`"${rev}"`;
  const response=await handler({request:new Request(`https://hall.example/api/${path}`,{method,headers,body:data===undefined?undefined:JSON.stringify(data)}),env});
  return {status:response.status,body:await response.json(),headers:response.headers};
}
before(async()=>{db=new PGlite();await db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));handler=createHandler(driver);});
after(async()=>db?.close());
test('missing production config fails closed; demo can only be explicitly enabled locally',async()=>{
  const r=await handler({request:new Request('https://hall.pages.dev/api/state'),env:{}});assert.equal(r.status,503);
  const local=await handler({request:new Request('http://localhost:8788/api/config'),env:{DEMO_MODE:'true'}});assert.deepEqual(await local.json(),{demo:true});
  const production=await handler({request:new Request('https://hall.pages.dev/api/config'),env:{DEMO_MODE:'true'}});assert.deepEqual(await production.json(),{demo:false});
});
test('public state works without login; writes require auth',async()=>{
  const r=await call('GET','state',undefined,{auth:false});assert.equal(r.status,200);assert.equal(r.body.version,3);revision=r.body.revision;
  assert.equal((await call('PUT','booths/1/102-R1',{org:'Test'},{auth:false})).status,401);
});
test('server login creates opaque revocable token; bad credentials fail',async()=>{
  assert.equal((await call('POST','login',{passcode:'incorrect'},{auth:false})).status,401);
  const r=await call('POST','login',{passcode:env.ADMIN_PASSCODE},{auth:false});assert.equal(r.status,200);token=r.body.token;assert.match(token,/^[a-f0-9]{64}$/);
  assert.equal((await call('GET','session')).status,200);
});
test('confirmed booth write and SQL injection-safe values; public notes omitted',async()=>{
  const r=await call('PUT','booths/1/102-R1',{org:"Org'); DROP TABLE event_days; --",notes:'PRIVATE',color:'#2563EB'});
  assert.equal(r.status,200,JSON.stringify(r.body));revision=r.body.revision;assert.equal(r.body.days['1'].booths['102-R1'].notes,'PRIVATE');
  const pub=await call('GET','state',undefined,{auth:false});assert.equal(pub.status,200);assert.equal('notes' in pub.body.days['1'].booths['102-R1'],false);assert.equal(pub.headers.get('cache-control'),'no-store, private');
});
test('stale editor cannot overwrite; missing revision rejected',async()=>{
  const conflict=await call('PUT','booths/1/102-R1',{org:'stale'},{rev:0});assert.equal(conflict.status,409);
  const current=await call('GET','state');assert.equal(current.body.days['1'].booths['102-R1'].notes,'PRIVATE');assert.equal(current.body.revision,revision);
  const r=await handler({request:new Request('https://hall.example/api/days/1',{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:'{"title":"Missing revision"}'}),env});assert.equal(r.status,428);
});
test('input validation, CSRF origin protection, body limits',async()=>{
  assert.equal((await call('PUT','booths/4/102-R1',{})).status,400);assert.equal((await call('PUT','booths/1/invented',{})).status,400);
  assert.equal((await call('PUT','booths/1/102-R1',{status:'invalid'})).status,400);
  assert.equal((await call('PUT','rooms/1/105',{reservedFor:'x'.repeat(49)})).status,400);
  assert.equal((await call('PUT','days/1',{title:'evil'},{origin:'https://other.example'})).status,403);
  assert.equal((await call('POST','import',{padding:'x'.repeat(100001)})).status,413);
});
test('Unicode upstairs room, title, deletion retains title and other days',async()=>{
  let r=await call('PUT','rooms/2/'+encodeURIComponent('214–215'),{reservedFor:'Workshop',note:'1–3 PM',paper:'#FFE680'});assert.equal(r.status,200,JSON.stringify(r.body));revision=r.body.revision;
  r=await call('PUT','days/2',{title:'Second day'});assert.equal(r.status,200);revision=r.body.revision;
  r=await call('DELETE','days/2');assert.equal(r.status,200);revision=r.body.revision;assert.equal(r.body.days['2'].title,'Second day');assert.deepEqual(r.body.days['2'].rooms,{});assert.equal(r.body.days['1'].booths['102-R1'].notes,'PRIVATE');
});
test('clear endpoints accept the exact frontend payloads',async()=>{
  let r=await call('PUT','booths/1/102-R1',{});assert.equal(r.status,200);revision=r.body.revision;assert.equal(r.body.days['1'].booths['102-R1'],undefined);
  r=await call('PUT','rooms/1/105',{reservedFor:'Class'});assert.equal(r.status,200);revision=r.body.revision;
  r=await call('PUT','rooms/1/105',{reservedFor:''});assert.equal(r.status,200);revision=r.body.revision;assert.equal(r.body.days['1'].rooms['105'],undefined);
});
test('import validation is atomic and valid import replaces all days',async()=>{
  const invalid=blankState();invalid.days['3'].booths['NOT-REAL']={};assert.equal((await call('POST','import',invalid)).status,400);
  assert.equal((await call('GET','state')).body.days['2'].title,'Second day');
  const valid=blankState();valid.days['3'].booths['DEAN-G1']={org:'Council',notes:'Internal'};valid.days['1'].rooms['105']={reservedFor:'Workshop'};
  const r=await call('POST','import',valid);assert.equal(r.status,200,JSON.stringify(r.body));revision=r.body.revision;assert.equal(r.body.days['2'].title,'');assert.equal(r.body.days['3'].booths['DEAN-G1'].notes,'Internal');
  // Old revision must not clear even one record during bulk import.
  assert.equal((await call('POST','import',blankState(),{rev:0})).status,409);
  assert.equal((await call('GET','state')).body.days['3'].booths['DEAN-G1'].org,'Council');
});
test('logout revokes session on the server',async()=>{
  assert.equal((await call('POST','logout')).status,200);assert.equal((await call('GET','session')).status,401);
});
test('login limit is atomic and applies before credential verification',async()=>{
  for(let i=0;i<10;i++)assert.equal((await call('POST','login',{passcode:'wrong'},{auth:false,'CF-Connecting-IP':'192.0.2.2'})).status,401);
  const r=await call('POST','login',{passcode:env.ADMIN_PASSCODE},{auth:false,'CF-Connecting-IP':'192.0.2.2'});assert.equal(r.status,429);
});
