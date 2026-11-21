// Pure visitor-local behavior. No database writes or organizer privileges required.
export const CAT_DEFS=[
  {name:'Mingming',color:'#D9893B',accent:'#F3D2A2',floor:1,z:3,trait:'The friendly hallway supervisor',temperament:'Sociable',speed:.62},
  {name:'Muning',color:'#39332F',accent:'#6C635A',floor:1,z:-19,trait:'A quiet soul who loves a slow blink',temperament:'Gentle',speed:.44},
  {name:'Kuting',color:'#8D8C8A',accent:'#DAD8D3',floor:1,z:-41,trait:'A tiny explorer with very big curiosity',temperament:'Playful',speed:.8,scale:.78},
  {name:'Tisay',color:'#EFEAE0',accent:'#D9C6B3',floor:1,z:-62,trait:'Elegant, observant, secretly affectionate',temperament:'Independent',speed:.52},
  {name:'Pancake',color:'#D7A379',accent:'#F1ECE2',floor:1,z:-83,trait:'The entrance committee, all by herself',temperament:'Sociable',speed:.58},
  {name:'Bantay',color:'#6E6862',accent:'#B8ADA0',floor:1,z:-112,trait:'The patient guardian of the far corridor',temperament:'Gentle',speed:.5},
  {name:'Mochi',color:'#E9D3AE',accent:'#F7EBD8',floor:2,z:-3.5,trait:'Your soft little second-floor companion',temperament:'Playful',speed:.68}
];
export const PET_DISTANCE=2.4,CALL_DISTANCE=12;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export const catDistance=(cat,player)=>cat.floor===player.floor?Math.hypot(cat.x,cat.z-player.z):Infinity;
export function createCatWorld(){return {time:0,follower:null,toy:null,cats:CAT_DEFS.map((def,id)=>({...def,id,x:(id%2?-.28:.28),targetX:0,targetZ:def.z,heading:0,mode:'idle',until:2+id*.4,cooldown:0,affection:12,pets:0,phase:id*1.37,moving:false,hop:0,step:0,follow:false,pounceAt:-100,batAt:0,reactionUntil:0}))};}
function pointNearPlayer(player,bounds,distance=1.1){
  let z=clamp(player.z-(Math.cos(player.yaw||0)>=0?1:-1)*distance,bounds.min+.25,bounds.max-.25);
  if(Math.abs(z-player.z)<.6)z=clamp(player.z+(z<player.z?1:-1)*distance,bounds.min+.25,bounds.max-.25);
  return {x:-.4,z};
}
export function stopCompanion(world){
  for(const cat of world.cats){cat.follow=false;if(['following','calling','petting','playing'].includes(cat.mode)){cat.mode='idle';cat.until=world.time+3;}}
  world.follower=null;world.toy=null;
}
export function catAvailability(world,id,player){
  const cat=world.cats[id];if(!cat)return {near:false,call:false};
  const distance=catDistance(cat,player),near=distance<=PET_DISTANCE;
  return {distance,near,pet:near&&world.time>=cat.cooldown,call:distance<=CALL_DISTANCE,follow:near||cat.follow,play:near||world.toy?.owner===id,rest:near};
}
export function actOnCat(world,id,action,player,bounds){
  const cat=world.cats[id];if(!cat)return {ok:false,message:'Choose a hallway companion first.'};
  const allowed=catAvailability(world,id,player);
  if(cat.floor!==player.floor)return {ok:false,message:`${cat.name} is on ${cat.floor}F. Take the stairs to meet them.`};
  if(action==='call'&&!allowed.call)return {ok:false,message:`Walk a little closer to call ${cat.name}.`};
  if(['pet','follow','play','rest'].includes(action)&&!allowed[action])return {ok:false,message:action==='pet'&&allowed.near?`${cat.name} is still enjoying that cuddle.`:`Walk closer or call ${cat.name} over first.`};
  if(!['call','pet','follow','play','rest'].includes(action))return {ok:false,message:'Unknown cat interaction.'};
  const now=world.time;
  if(action==='pet'){
    cat.mode='petting';cat.until=now+2.2;cat.cooldown=now+2.8;cat.reactionUntil=now+2.2;cat.pets++;cat.affection=Math.min(100,cat.affection+8);
    if(world.toy?.owner===id)world.toy=null;
    return {ok:true,message:`${cat.name} leans into your hand. Purrr.`,reaction:'heart'};
  }
  if(action==='follow'){
    if(cat.follow){cat.follow=false;world.follower=null;cat.mode='idle';cat.until=now+3;return {ok:true,message:`${cat.name} is free to explore again.`};}
    stopCompanion(world);cat.follow=true;world.follower=id;cat.mode='following';cat.affection=Math.min(100,cat.affection+2);
    return {ok:true,message:`${cat.name} will walk with you on this floor.`};
  }
  if(action==='play'&&world.toy?.owner===id){world.toy=null;cat.mode=cat.follow?'following':'idle';cat.until=now+3;return {ok:true,message:'Yarn packed away. Time to explore.'};}
  if(world.toy?.owner===id)world.toy=null;
  if(action==='call'){
    const p=pointNearPlayer(player,bounds);cat.targetX=p.x;cat.targetZ=p.z;cat.mode='calling';
    return {ok:true,message:`${cat.name} heard you and is coming over.`};
  }
  if(action==='rest'){
    if(world.follower===id)world.follower=null;cat.follow=false;cat.mode='resting';cat.until=now+45;
    return {ok:true,message:`${cat.name} settles down for a little rest.`};
  }
  if(action==='play'){
    if(world.follower===id)world.follower=null;cat.follow=false;
    if(world.toy){const previous=world.cats[world.toy.owner];if(previous.mode==='playing'){previous.mode='idle';previous.until=now+3;}}
    const p=pointNearPlayer(player,bounds,2.3);world.toy={owner:id,floor:cat.floor,x:.45,z:p.z,vx:0,vz:0,roll:0};cat.mode='playing';cat.batAt=now+.4;cat.affection=Math.min(100,cat.affection+3);
    return {ok:true,message:`Roll the yarn: tap the hallway floor. ${cat.name} will chase it.`};
  }
}
export function rollToy(world,z,player,bounds){
  const toy=world.toy;if(!toy||toy.floor!==player.floor||!Number.isFinite(z))return false;
  toy.x=.3;toy.z=clamp(z,Math.max(bounds.min+.4,player.z-6),Math.min(bounds.max-.4,player.z+6));toy.vx=0;toy.vz=0;
  const cat=world.cats[toy.owner];cat.mode='playing';cat.pounceAt=world.time;return true;
}
function turn(cat,want,dt){let d=want-cat.heading;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;cat.heading+=d*Math.min(1,dt*7);}
export function updateCatWorld(world,dt,player,boundsFor,random=Math.random){
  dt=clamp(Number.isFinite(dt)?dt:0,0,.1);world.time+=dt;const now=world.time;
  if(world.follower!==null&&world.cats[world.follower].floor!==player.floor)stopCompanion(world);
  if(world.toy&&world.toy.floor!==player.floor){const cat=world.cats[world.toy.owner];cat.mode='idle';cat.until=now+3;world.toy=null;}
  const toy=world.toy;
  if(toy){const bounds=boundsFor(toy.floor);toy.x=clamp(toy.x+toy.vx*dt,-.7,.7);toy.z=clamp(toy.z+toy.vz*dt,bounds.min+.3,bounds.max-.3);const decay=Math.exp(-2*dt);toy.vx*=decay;toy.vz*=decay;toy.roll+=Math.hypot(toy.vx,toy.vz)*dt*10;}
  for(const cat of world.cats){
    cat.moving=false;cat.hop=0;if(cat.floor!==player.floor)continue;
    const b=boundsFor(cat.floor),distance=catDistance(cat,player);
    if(cat.mode==='petting'){
      turn(cat,Math.atan2(-cat.x,player.z-cat.z),dt);if(now>=cat.until){cat.mode=cat.follow?'following':'sitting';cat.until=now+4;}
      continue;
    }
    if(cat.mode==='resting'){
      if(now>=cat.until){cat.mode='idle';cat.until=now+3;}continue;
    }
    if(cat.mode==='following'||cat.follow&&cat.mode==='idle'){
      cat.mode='following';const p=pointNearPlayer(player,b);cat.targetX=p.x;cat.targetZ=p.z;
    }else if(cat.mode==='calling'){
      // A called cat adjusts if the visitor moves, rather than greeting an empty spot.
      const p=pointNearPlayer(player,b);cat.targetX=p.x;cat.targetZ=p.z;
    }else if(cat.mode==='playing'&&toy?.owner===cat.id){
      cat.targetX=toy.x;cat.targetZ=toy.z;
      if(Math.hypot(toy.x-cat.x,toy.z-cat.z)<.3&&now>=cat.batAt){
        const direction=toy.z>player.z?-1:1;toy.vz=direction*(1.4+random());toy.vx=(random()-.5)*.7;cat.batAt=now+.9;cat.pounceAt=now;
        if(Math.abs(toy.z-player.z)>5)toy.vz=-Math.sign(toy.z-player.z)*2;
      }
      cat.hop=Math.max(0,Math.sin(clamp((now-cat.pounceAt)/.5,0,1)*Math.PI))*.11;
    }else if(['idle','sitting','walking'].includes(cat.mode)&&now>=cat.until){
      if(random()<.3){cat.mode='sitting';cat.until=now+3+random()*4;}
      else{cat.mode='walking';cat.targetX=(random()-.5)*1.1;cat.targetZ=clamp(cat.z+(random()-.5)*10,b.min+.4,b.max-.4);cat.until=now+5+random()*6;}
    }
    if(['following','calling','walking','playing'].includes(cat.mode)){
      const dx=cat.targetX-cat.x,dz=cat.targetZ-cat.z,d=Math.hypot(dx,dz),stop=cat.mode==='playing'?.15:.13;
      if(d>stop){
        const speed=cat.speed*(cat.mode==='playing'?2.4:cat.mode==='calling'?2:cat.mode==='following'?Math.min(7,1.8+d*.65):1);
        const step=Math.min(d-stop,speed*dt);cat.x+=dx/d*step;cat.z+=dz/d*step;cat.moving=true;cat.step+=step*20;turn(cat,Math.atan2(dx,dz),dt);
      }else if(cat.mode==='calling'){cat.mode=cat.follow?'following':'sitting';cat.until=now+8;}
      else if(cat.mode==='walking'){cat.mode='idle';cat.until=now+2;}
    }else if(distance<3)turn(cat,Math.atan2(-cat.x,player.z-cat.z),dt);
    // Keep every roaming/following cat in the clear central aisle, away from tables.
    if(!['calling','following','playing'].includes(cat.mode)&&distance<.8)cat.x+=(cat.x>=0?1:-1)*dt*.6;
    cat.x=clamp(cat.x,-.86,.86);cat.z=clamp(cat.z,b.min+.2,b.max-.2);
  }
}
export function catMood(cat){return ({petting:'Enjoying your company',calling:'Coming to say hello',following:'Walking with you',playing:'Chasing the yarn',resting:'A well-earned nap',walking:'Exploring the hallway',sitting:'Taking it all in',idle:'A little curious'})[cat.mode]||'A little curious';}
export function friendship(cat){return cat.affection>=70?'Your hallway friend':cat.affection>=35?'A familiar face':'Getting acquainted';}
