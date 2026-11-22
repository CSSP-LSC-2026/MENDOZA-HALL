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

for(const initial of ['empty','original-four-tables'])test(`${initial} database: automatic setup, confirmed writes, private cache and logout`,async({page})=>{
  const db=new PGlite();
  if(initial==='original-four-tables'){
    await db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8').split('-- Shared revision')[0]);
    await db.exec("INSERT INTO public.event_days(day,title) VALUES(1,'Legacy opening');INSERT INTO public.booth_assignments(day,booth_id,org,notes,status) VALUES(1,'102-R1','Preserved Society','LEGACY PRIVATE','assigned');");
  }
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
    // Inspect the SQL database rather than a mocked success indicator.
    expect((await db.query("SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows[0].n).toBe(6);
    if(initial==='original-four-tables'){expect((await db.query("SELECT notes FROM public.booth_assignments WHERE booth_id='102-R1'")).rows[0].notes).toBe('LEGACY PRIVATE');await expect(page.locator('#dayTitleTxt')).toHaveText('Legacy opening');expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('LEGACY PRIVATE');}
    await login(page);await openBooth(page);await page.locator('#fOrg').fill('Council Society');await page.locator('#fNotes').fill('PRIVATE NOTES');await page.locator('#bpSave').click();await expect(page.locator('#toast')).toHaveText('Saved booth 102-R1');
    expect((await db.query('SELECT org,notes FROM booth_assignments')).rows[0]).toMatchObject({org:'Council Society',notes:'PRIVATE NOTES'});
    expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('PRIVATE NOTES');
    // Network failure never changes the confirmed label/database; keep the form for retry.
    rejectSave=true;await page.locator('#fOrg').fill('Unsaved Change');await page.locator('#bpSave').click();await expect(page.locator('#toast')).toContainText('Not saved');await expect(page.locator('#fOrg')).toHaveValue('Unsaved Change');expect((await db.query('SELECT org FROM booth_assignments')).rows[0].org).toBe('Council Society');
    await expect(page.locator('#bpSave')).toBeEnabled();conflict=true;await page.locator('#bpSave').click();await expect(page.locator('#toast')).toContainText('Someone changed the plan');await expect(page.locator('#fOrg')).toHaveValue('Unsaved Change');
    await expect(page.locator('#bpSave')).toBeEnabled();await page.locator('#bpSave').click();await expect(page.locator('#toast')).toHaveText('Saved booth 102-R1');
    await page.locator('#pClose').click();await page.locator('#lscBtn').click();
    page.once('dialog',dialog=>dialog.accept());await page.locator('#copyDayBtn').click();await expect(page.locator('#toast')).toContainText('Copied Day 1');
    expect((await db.query("SELECT org,notes FROM booth_assignments WHERE day=2 AND booth_id='102-R1'")).rows[0]).toMatchObject({org:'Unsaved Change',notes:'PRIVATE NOTES'});
    expect((await db.query("SELECT org FROM booth_assignments WHERE day=1 AND booth_id='102-R1'")).rows[0].org).toBe('Unsaved Change');
    await page.locator('#signOutBtn').click();await expect(page.locator('body')).not.toHaveClass(/lsc/);
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

test('original SVG artwork and companions: call, pet, follow, yarn, rest, map and mobile',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('mendoza_welcome_hidden','1'));
  await page.goto('/');await expect(page.locator('#loader')).toHaveClass(/hide/);
  expect(await page.locator('[data-icon]').count()).toBe(0);
  expect(await page.locator('svg[data-art]').count()).toBeGreaterThan(20);
  expect(await page.locator('body').innerText()).not.toMatch(/[\u{1F000}-\u{1FAFF}\u2600-\u27BF]/u);
  await page.locator('#catsBtn').click();await expect(page.locator('#catPanel')).toBeVisible();await expect(page.locator('#catName')).toHaveText('Pipoy');await expect(page.locator('#catMemorial')).toHaveText('In loving memory of Pipoy.');
  await page.locator('#catDetailsToggle').click();await page.locator('#catRoster [data-cat="2"]').click();await expect(page.locator('#catName')).toHaveText('Graham');await expect(page.locator('#catMemorial')).toHaveText('In loving memory of Graham.');await page.locator('#catDetailsToggle').click();await page.locator('#catRoster [data-cat="0"]').click();
  await expect(page.locator('#catRoster button')).toHaveCount(7);await expect(page.locator('#catPet')).toBeDisabled();
  await page.locator('#catCall').click();await expect(page.locator('#catMood')).toHaveText('Coming to say hello');await expect(page.locator('#catPet')).toBeEnabled({timeout:15000});
  await page.locator('#catPet').click();await expect(page.locator('#catPetCount')).toHaveText('1 pet');await expect(page.locator('#catPanel')).toHaveAttribute('data-mode','petting');await expect(page.locator('#catPet')).toBeDisabled();
  await page.locator('#catVisit').click();await page.waitForTimeout(2600);await expect(page.locator('#catPet')).toBeEnabled({timeout:10000});
  await page.locator('#catFollow').click();await expect(page.locator('#companionPill')).toBeHidden();await expect(page.locator('#catFollow')).toHaveAttribute('aria-pressed','true');
  await page.locator('#catClose').click();await expect(page.locator('#companionPill')).toBeVisible();await page.evaluate(()=>document.activeElement.blur());await page.keyboard.down('w');await page.waitForTimeout(1500);await page.keyboard.up('w');
  await page.locator('#catsBtn').click();await expect(page.locator('#catFollow')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#catPet')).toBeEnabled({timeout:15000});
  await page.locator('#catPlay').click();await expect(page.locator('#catPanel')).toHaveAttribute('data-mode','playing');await expect(page.locator('#catPlay')).toContainText('Pack yarn');await expect(page.locator('#companionPill')).toBeHidden();
  await page.locator('#catPlay').click();await expect(page.locator('#catPlay')).toContainText('Play');
  await page.locator('#catCall').click();await expect(page.locator('#catRest')).toBeEnabled({timeout:15000});await page.locator('#catDetailsToggle').click();await page.locator('#catRest').click();await expect(page.locator('#catPanel')).toHaveAttribute('data-mode','resting');
  // The public jump menu and keyboard-operable map both find cats without organizer login.
  await page.locator('#catClose').click();await page.locator('#roomSelect').selectOption('cat:6');await expect(page.locator('#catName')).toHaveText('Mochi');await expect(page.locator('#nearRoom')).toContainText('2F',{timeout:15000});
  await page.locator('#mapBtn').click();await expect(page.locator('#catPanel')).toBeHidden();await expect(page.locator('[data-type=cat]')).toHaveCount(1);
  await page.locator('[data-type=cat]').focus();await page.keyboard.press('Enter');await expect(page.locator('#catPanel')).toBeVisible();await expect(page.locator('#catName')).toHaveText('Mochi');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await expect(page.locator('#catPet')).toBeVisible();await expect(page.locator('#catRest')).toBeHidden();await expect(page.locator('#catDetailsToggle')).toHaveAttribute('aria-expanded','false');
  const box=await page.locator('#catPanel').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThan(400);expect(box.height).toBeLessThan(250);expect(box.x+box.width).toBeLessThanOrEqual(390);expect(box.y+box.height).toBeLessThan(844);
  await page.screenshot({path:'.arena/companions-mobile.png'});
  await page.keyboard.press('Escape');await expect(page.locator('#catPanel')).toBeHidden();expect(errors).toEqual([]);
});

for(const reducedMotion of ['reduce','no-preference'])test(`envelope opens one continuous letter, ${reducedMotion}`,async({page})=>{
  await page.emulateMedia({reducedMotion});
  await page.goto('/');await expect(page.locator('#loader')).toHaveClass(/hide/);await expect(page.locator('#intro')).toHaveClass(/show/,{timeout:15000});
  await expect(page.locator('#envelope #paper')).toHaveCount(1);await expect(page.locator('#paper')).not.toBeVisible();
  await expect(page.locator('#seal')).toHaveAttribute('aria-expanded','false');
  await page.locator('#seal').click();await expect(page.locator('#intro')).toHaveClass(/reading/);await expect(page.locator('#paper')).toBeVisible();
  await expect(page.locator('#paper')).not.toHaveAttribute('inert','');await expect(page.locator('#seal')).toHaveAttribute('aria-expanded','true');
  await expect(page.locator('#paper')).toBeFocused();expect(await page.locator('#paper').evaluate(e=>e.scrollTop)).toBe(0);await page.locator('#introGo').click();await expect(page.locator('#intro')).not.toHaveClass(/show/);
  await page.setViewportSize({width:390,height:844});await page.locator('#brandTitle').click();await expect(page.locator('#seal')).toHaveAttribute('aria-expanded','false');
  await page.locator('#seal').click();await expect(page.locator('#intro')).toHaveClass(/reading/);await page.waitForTimeout(750);
  const box=await page.locator('#paper').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);expect(box.y+box.height).toBeLessThanOrEqual(844);
  await page.screenshot({path:`.arena/letter-${reducedMotion}.png`});await page.keyboard.press('Escape');await expect(page.locator('#intro')).not.toHaveClass(/show/);
});

test('mobile readability, gesture zoom protection, opt-in sounds and restrained tap effects',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'no-preference'}),page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.audioEvents={created:0,tones:0};const Native=window.AudioContext||window.webkitAudioContext;
    if(Native)window.AudioContext=class extends Native{constructor(...args){super(...args);window.audioEvents.created++;}createOscillator(){const osc=super.createOscillator(),start=osc.start.bind(osc);osc.start=(...args)=>{window.audioEvents.tones++;return start(...args);};return osc;}};
  });
  await page.goto('/');await expect(page.locator('#intro')).toHaveClass(/show/,{timeout:15000});
  expect(await page.evaluate(()=>window.audioEvents.created)).toBe(0);
  await page.locator('#seal').tap();await expect(page.locator('#intro')).toHaveClass(/reading/);await page.waitForTimeout(800);
  expect(await page.locator('#paper').evaluate(e=>getComputedStyle(e).fontFamily)).toMatch(/Arial/);expect(await page.locator('#paper').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(17);
  await page.locator('#introGo').tap();await expect(page.locator('body')).toHaveAttribute('data-sound','on');expect(await page.evaluate(()=>window.audioEvents.tones)).toBeGreaterThanOrEqual(3);
  await page.locator('#soundBtn').tap();await expect(page.locator('#soundBtn')).toHaveAttribute('aria-pressed','false');
  const tones=await page.evaluate(()=>window.audioEvents.tones);await page.locator('#mapBtn').tap();await page.locator('#mapClose').tap();expect(await page.evaluate(()=>window.audioEvents.tones)).toBe(tones);
  await page.locator('#soundBtn').tap();await expect(page.locator('#soundBtn')).toHaveAttribute('aria-pressed','true');
  // Prevent double-tap control zoom without disabling accessibility pinch zoom globally.
  for(const selector of ['#viewport','#viewport canvas','#mapSvg','.navBtn'])expect(await page.locator(selector).first().evaluate(e=>getComputedStyle(e).touchAction)).toBe('none');
  for(const selector of ['#roomSelect','#lscPass','#dayTitle','#fOrg','#fStatus'])expect(await page.locator(selector).evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
  expect(await page.locator('meta[name=viewport]').getAttribute('content')).not.toMatch(/user-scalable=no|maximum-scale=1/);
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:130,y:330},{x:240,y:390}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:95,y:300},{x:285,y:420}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  expect(await page.evaluate(()=>visualViewport.scale)).toBe(1);
  const forward=page.getByRole('button',{name:'Forward',exact:true});await forward.tap();await forward.tap();expect(await page.evaluate(()=>visualViewport.scale)).toBe(1);
  // Real taps get feedback without changing page scale.
  await page.locator('#mapBtn').tap();await expect(page.locator('#tapEffects .tapBloom')).not.toHaveCount(0);await page.locator('#mapClose').tap();
  await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.locator('#brandTitle').tap();await page.locator('#seal').tap();await page.locator('#introGo').tap();
  await page.waitForTimeout(700);await page.locator('#mapBtn').tap();await expect(page.locator('#tapEffects .tapBloom')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);expect(errors).toEqual([]);await context.close();
});
