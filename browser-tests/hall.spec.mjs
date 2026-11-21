import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createHandler} from '../functions/api/[[path]].js';
const passphrase='a unique test organizer passphrase';
async function openBooth(page,id='102-R1'){
  if(!await page.locator('#mapDock').evaluate(e=>document.body.classList.contains('map-open')))await page.locator('#mapBtn').click();
  await page.locator('#mapFit').click();await page.locator(`[data-type=booth][data-id="${id}"] rect`).click();
}
async function login(page){await page.locator('#lscBtn').click();await page.locator('#lscPass').fill(passphrase);await page.locator('#lscGo').click();await expect(page.locator('body')).toHaveClass(/lsc/);}

test('real SQL API: confirmed writes, failure reconciliation, private cache and logout',async({page})=>{
  const db=new PGlite();await db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const driver=()=>({query:(text,params=[])=>({text,params,then(resolve,reject){return db.query(text,params).then(r=>r.rows).then(resolve,reject);}}),transaction:queries=>db.transaction(async tx=>{const result=[];for(const q of queries)result.push((await tx.query(q.text,q.params)).rows);return result;})});
  const handler=createHandler(driver);let rejectSave=false,conflict=false;const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('mendoza_welcome_hidden','1'));
  await page.route('**/api/**',async route=>{
    const original=route.request();
    if(rejectSave&&original.method()==='PUT'){rejectSave=false;await route.abort('failed');return;}
    if(conflict&&original.method()==='PUT'){conflict=false;await db.exec('UPDATE event_meta SET revision=revision+1');}
    const response=await handler({request:new Request(original.url(),{method:original.method(),headers:original.headers(),body:['GET','HEAD'].includes(original.method())?undefined:original.postData()}),env:{DATABASE_URL:'postgresql://owner:example@ep-test.neon.tech/neondb?sslmode=require',ADMIN_PASSCODE:passphrase}});
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  });
  try{
    await page.goto('/');await expect(page.locator('#loader')).toHaveClass(/hide/);await expect(page.locator('#connection')).toContainText('Live');
    await login(page);await openBooth(page);await page.locator('#fOrg').fill('Council Society');await page.locator('#fNotes').fill('PRIVATE NOTES');await page.locator('#bpSave').click();await expect(page.locator('#toast')).toHaveText('Saved booth 102-R1');
    expect((await db.query('SELECT org,notes FROM booth_assignments')).rows[0]).toMatchObject({org:'Council Society',notes:'PRIVATE NOTES'});
    expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('PRIVATE NOTES');
    // Network failure never changes the confirmed label/database; keep the form for retry.
    rejectSave=true;await page.locator('#fOrg').fill('Unsaved Change');await page.locator('#bpSave').click();await expect(page.locator('#toast')).toContainText('Not saved');await expect(page.locator('#fOrg')).toHaveValue('Unsaved Change');expect((await db.query('SELECT org FROM booth_assignments')).rows[0].org).toBe('Council Society');
    await expect(page.locator('#bpSave')).toBeEnabled();conflict=true;await page.locator('#bpSave').click();await expect(page.locator('#toast')).toContainText('Someone changed the plan');await expect(page.locator('#fOrg')).toHaveValue('Unsaved Change');
    await expect(page.locator('#bpSave')).toBeEnabled();await page.locator('#bpSave').click();await expect(page.locator('#toast')).toHaveText('Saved booth 102-R1');
    await page.locator('#pClose').click();await page.locator('#lscBtn').click();await page.locator('#signOutBtn').click();await expect(page.locator('body')).not.toHaveClass(/lsc/);
    expect(await page.locator('#fNotes').inputValue()).toBe('');expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('PRIVATE NOTES');
    await expect.poll(async()=>(await db.query('SELECT * FROM organizer_sessions')).rows.length).toBe(0);
    await openBooth(page);await expect(page.locator('#pView')).toContainText('Unsaved Change');await expect(page.locator('#boothEdit')).toBeHidden();
    await page.locator('#pClose').click();await page.locator('#roomSelect').selectOption('room:214–215');await expect(page.locator('#nearRoom')).toContainText('2F',{timeout:15000});
    await page.setViewportSize({width:390,height:844});await expect(page.locator('#roomSelect')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
    expect(errors).toEqual([]);
  }finally{await db.close();}
});

test('missing API never enables demo; explicit local demo is usable',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('mendoza_welcome_hidden','1'));
  await page.route('**/api/**',r=>r.fulfill({status:502,contentType:'text/html',body:'upstream error'}));
  await page.goto('/');await expect(page.locator('#connection')).toContainText('Offline');await page.locator('#lscBtn').click();await expect(page.locator('#lscPass')).toBeEnabled();await page.locator('#lscCancel').click();
  await page.unroute('**/api/**');await page.reload();await expect(page.locator('#connection')).toContainText('LOCAL DEMO');await page.locator('#lscBtn').click();await expect(page.locator('#lscPass')).toBeDisabled();await page.locator('#lscGo').click();await expect(page.locator('body')).toHaveClass(/lsc/);
  await openBooth(page);await page.locator('#fOrg').fill('Local Society');await page.locator('#bpSave').click();await expect(page.locator('#toast')).toContainText('Saved booth');await expect(page.locator('#connection')).toContainText('LOCAL DEMO');
});

test('database diagnostics persist on mobile and report exact missing setup without secrets',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>localStorage.setItem('mendoza_welcome_hidden','1'));
  let ready=false;
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let body,status=200;
    if(path==='/api/config')body={demo:false};
    else if(path==='/api/health'&&ready)body={ok:true,database:'connected',schema:'ready'};
    else if(path==='/api/state'&&ready)body={version:3,revision:0,updatedAt:0,days:{'1':{title:'',booths:{},rooms:{}},'2':{title:'',booths:{},rooms:{}},'3':{title:'',booths:{},rooms:{}}}};
    else {status=503;body={ok:false,code:path==='/api/health'?'DB_SCHEMA_INCOMPLETE':'DB_SCHEMA_MISSING',error:'Run the complete schema in the same Neon branch and database.',missingTables:['event_meta','organizer_sessions'],missingColumns:{},requestId:'test-error-reference'};}
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('/');await expect(page.locator('#connection')).toContainText('DB_SCHEMA_MISSING');
  await page.locator('#connectionDetails').click();await expect(page.locator('#dbMessage')).toContainText('test-error-reference');
  await page.locator('#dbCheck').click();await expect(page.locator('#dbMessage')).toContainText('DB_SCHEMA_INCOMPLETE');await expect(page.locator('#dbMessage')).toContainText('event_meta, organizer_sessions');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  ready=true;await page.locator('#dbCheck').click();await expect(page.locator('#dbMessage')).toContainText('The shared plan is live.');await expect(page.locator('#connection')).toContainText('Live');
  await page.locator('#dbClose').click();await expect(page.locator('#connectionDetails')).toBeHidden();
});
