import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT,ROOMS,blankState,cleanImport,cleanBooth,cleanRoom,publicState } from '../lib/model.js';
import {hashToken,randomToken,verifyPasscode} from '../lib/auth.js';
test('layout includes both sides of all 14 rooms, including upstairs Unicode IDs',()=>{
  assert.equal(ROOMS.length,14);assert.equal(LAYOUT.length,28);assert.equal(new Set(LAYOUT.map(b=>b.id)).size,28);assert.ok(LAYOUT.find(b=>b.id==='214–215-R1'&&b.floor===2));
});
test('validation matches UI limits and rejects unknown IDs or malformed data',()=>{
  assert.equal(cleanBooth({org:'Org'}).status,'assigned');assert.equal(cleanBooth({status:'assigned'}).status,'available');
  for(const b of [{status:'invalid'},{org:'x'.repeat(61)},{color:'red'},{notes:null},null])assert.throws(()=>cleanBooth(b));
  assert.throws(()=>cleanRoom({reservedFor:'x'.repeat(49)}));
  const s=blankState();s.days['1'].booths['unknown']={};assert.throws(()=>cleanImport(s));
  assert.throws(()=>cleanImport({days:{'1':{}}}));
});
test('public cache has no notes, including nested days, without mutating private state',()=>{
  const s=blankState();s.days['2'].booths['102-R1']=cleanBooth({org:'Org',notes:'private'});
  const p=publicState(s);assert.equal('notes' in p.days['2'].booths['102-R1'],false);assert.equal(s.days['2'].booths['102-R1'].notes,'private');
});
test('opaque sessions and server passcode verification',async()=>{
  const pass='a unique organizer passphrase';assert.equal(await verifyPasscode(pass,pass),true);assert.equal(await verifyPasscode('wrong',pass),false);assert.equal(await verifyPasscode('',pass),false);
  const token=randomToken();assert.match(token,/^[a-f0-9]{64}$/);assert.notEqual(token,randomToken());assert.match(await hashToken(token),/^[a-f0-9]{64}$/);
});
