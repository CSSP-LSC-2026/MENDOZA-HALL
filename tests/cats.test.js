import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCatWorld,actOnCat,catAvailability,updateCatWorld,rollToy,stopCompanion,CAT_DEFS} from '../lib/cats.js';
import {iconMarkup,ICON_PATHS} from '../lib/icons.js';
const bounds=f=>f===1?{min:-138,max:6.6}:{min:-14,max:6.6};
const player={floor:1,z:6.2,yaw:0};
function tick(w,seconds,p=player){for(let i=0;i<seconds*20;i++)updateCatWorld(w,.05,p,bounds,()=>.5);}
test('seven unique original cats and complete local SVG artwork',()=>{
  assert.equal(CAT_DEFS.length,7);assert.equal(new Set(CAT_DEFS.map(c=>c.name)).size,7);
  for(const key of Object.keys(ICON_PATHS)){assert.match(iconMarkup(key),/<path d=/);assert.doesNotMatch(iconMarkup(key),/https?:/);}
  assert.throws(()=>iconMarkup('<script>'));
});
test('calling visibly approaches; petting has proximity and cooldown, bounded affection',()=>{
  const w=createCatWorld(),c=w.cats[0],z=c.z;
  assert.equal(actOnCat(w,0,'pet',player,bounds(1)).ok,false);
  assert.equal(actOnCat(w,0,'call',player,bounds(1)).ok,true);tick(w,2);
  assert.ok(c.z>z+.5);assert.ok(catAvailability(w,0,player).pet);
  assert.equal(actOnCat(w,0,'pet',player,bounds(1)).ok,true);assert.equal(c.mode,'petting');assert.equal(c.pets,1);
  assert.equal(actOnCat(w,0,'pet',player,bounds(1)).ok,false);
  for(let i=0;i<20;i++){tick(w,3);actOnCat(w,0,'pet',player,bounds(1));}
  assert.equal(c.affection,100);
});
test('only one cat follows, physically follows movement and stops at stairs',()=>{
  const w=createCatWorld();w.cats[0].z=5;w.cats[1].z=5;
  actOnCat(w,0,'follow',player,bounds(1));assert.equal(w.follower,0);
  actOnCat(w,1,'follow',player,bounds(1));assert.equal(w.follower,1);assert.equal(w.cats[0].follow,false);
  const p={...player,z:-12};tick(w,12,p);assert.ok(Math.abs(w.cats[1].z-p.z)<2);
  tick(w,.1,{...p,floor:2});assert.equal(w.follower,null);assert.equal(w.cats[1].follow,false);
});
test('yarn is chased, batted, floor-targeted within bounds, and put away',()=>{
  const w=createCatWorld(),c=w.cats[0];c.z=5;
  actOnCat(w,0,'follow',player,bounds(1));actOnCat(w,0,'play',player,bounds(1));assert.equal(w.follower,null);assert.equal(c.mode,'playing');
  const start=c.z;tick(w,1);assert.ok(c.z<start);assert.ok(w.toy);
  assert.equal(rollToy(w,-100,player,bounds(1)),true);assert.ok(w.toy.z>=player.z-6);
  assert.equal(rollToy(w,NaN,player,bounds(1)),false);tick(w,3);
  assert.equal(actOnCat(w,0,'play',player,bounds(1)).ok,true);assert.equal(w.toy,null);
});
test('rest, cross-floor/proximity guards and bounded wandering',()=>{
  const w=createCatWorld();assert.equal(actOnCat(w,6,'call',player,bounds(1)).ok,false);
  assert.equal(actOnCat(w,5,'call',player,bounds(1)).ok,false);
  w.cats[0].z=5;actOnCat(w,0,'rest',player,bounds(1));tick(w,5);assert.equal(w.cats[0].mode,'resting');
  stopCompanion(w);tick(w,200);for(const c of w.cats){assert.ok(c.z>=bounds(c.floor).min&&c.z<=bounds(c.floor).max);assert.ok(Math.abs(c.x)<1);}
  assert.equal(actOnCat(w,99,'pet',player,bounds(1)).ok,false);
});
