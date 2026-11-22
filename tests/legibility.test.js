import test from 'node:test';
import assert from 'node:assert/strict';
import {LABEL_FONT,wrapLines,fitLabel,drawLabel} from '../lib/legibility.js';
function context(){return {font:'700 70px Arial',drawn:[],measureText(t){return {width:Array.from(t).length*Number(this.font.match(/(\d+)px/)[1])*.63};},fillText(t,x,y){this.drawn.push({t,x,y,font:this.font});}};}
test('labels wrap long words and never discard organization or door-note characters',()=>{
  for(const [text,width,height,maxSize,minSize] of [
    ['An organization with a long name that must remain readable',944,255,78,42],
    ['A'.repeat(60),944,255,78,42],['Workshop in memory of our beloved friends',640,365,72,42],
    ['A'.repeat(48),640,365,72,42],['A note that is sixty characters long and should not be cut off',640,190,44,32]
  ]){
    const g=context(),layout=fitLabel(g,text,{width,height,maxSize,minSize});assert.equal(layout.lines.join('').replace(/\s/g,''),text.replace(/\s/g,''));
    assert.ok(layout.lines.every(l=>g.measureText(l).width<=width));assert.ok(layout.lines.length*layout.leading<=height);
    drawLabel(g,text,{x:0,y:0,width,height,maxSize,minSize});assert.ok(g.drawn.every(d=>d.font.endsWith(LABEL_FONT)));assert.ok(!g.font.includes('cursive'));
  }
  assert.deepEqual(wrapLines(context(),'',200),[]);
});
