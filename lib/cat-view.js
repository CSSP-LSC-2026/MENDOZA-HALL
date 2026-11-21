import {CAT_DEFS} from './cats.js';
// Small original cat portraits, coordinated with the procedural 3D coats.
export function catPortraitMarkup(id){
  const c=CAT_DEFS[id];if(!c)throw new Error('Unknown companion');
  return `<svg viewBox="0 0 96 96" class="catPortrait" aria-hidden="true" focusable="false"><circle cx="48" cy="48" r="46" fill="#EEE5D3"/><path d="m23 41-2-24 21 14h12l21-14-2 24c9 11 6 35-7 40-10 5-26 5-36 0-13-5-16-29-7-40Z" fill="${c.color}" stroke="#574337" stroke-width="1.5"/><path d="m26 37-1-12 11 9m34 3 1-12-11 9" fill="#CB9790" opacity=".8"/><path d="M33 60c0-9 30-9 30 0 0 15-30 15-30 0" fill="${c.accent}"/><path d="M31 49c3-3 7-3 10 0m14 0c3-3 7-3 10 0m-20 8 3 3 3-3Zm3 3v5m-6 0q3 3 6 0 3 3 6 0M13 58l20 3M12 68l20-2m51-8-20 3m21 7-20-2" fill="none" stroke="#3E3029" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
export function buildCatVisuals(T,{scene,material,mesh,targets}){
  const sphere=new T.SphereGeometry(1,14,10);
  return CAT_DEFS.map((def,index)=>{
    const g=new T.Group(),pose=new T.Group();g.add(pose);g.scale.setScalar(def.scale||1);scene.add(g);
    const fur=material(def.color),accent=material(def.accent),pink=material('#C88A87'),dark=material('#29231F',.3),gold=material('#D6B65E',.5,.3);
    const body=mesh(sphere,fur,pose,0,.23,0);body.scale.set(.125,.115,.23);
    const chest=mesh(sphere,accent,pose,0,.21,.13);chest.scale.set(.09,.095,.09);
    const head=new T.Group();head.position.set(0,.34,.2);pose.add(head);
    const skull=mesh(sphere,fur,head,0,0,0);skull.scale.set(.093,.085,.088);
    const muzzle=mesh(sphere,accent,head,0,-.028,.066);muzzle.scale.set(.057,.037,.034);
    const ears=[],eyes=[];
    for(const side of [-1,1]){
      const ear=mesh(new T.ConeGeometry(.037,.085,4),fur,head,side*.052,.075,-.008);ear.rotation.z=-side*.3;ear.rotation.y=Math.PI/4;ears.push(ear);
      const inside=mesh(new T.ConeGeometry(.021,.05,4),pink,head,side*.052,.073,.01);inside.rotation.z=-side*.3;inside.rotation.y=Math.PI/4;
      const eye=mesh(new T.SphereGeometry(.013,9,7),dark,head,side*.036,.01,.079);eye.scale.z=.6;eyes.push(eye);
      mesh(new T.SphereGeometry(.0036,5,4),material('#FFF8E7'),eye,-.003,.004,.011);
      const whiskerMat=new T.LineBasicMaterial({color:'#D1C4AB'});
      for(const dy of [-.012,.008]){const geo=new T.BufferGeometry().setFromPoints([new T.Vector3(side*.04,-.025,.08),new T.Vector3(side*.12,-.025+dy,.075)]);head.add(new T.Line(geo,whiskerMat));}
    }
    mesh(new T.SphereGeometry(.012,7,5),pink,head,0,-.009,.102);
    if([0,2,5].includes(index))for(const z of [-.1,-.02,.06]){const stripe=mesh(sphere,material(index===0?'#A85B25':'#5A534D'),pose,0,.315,z);stripe.scale.set(.09,.025,.019);}
    if(index===4)for(const [x,z,color] of [[.06,-.1,'#4D3930'],[-.06,.05,'#F0E6D4']]){const patch=mesh(sphere,material(color),pose,x,.275,z);patch.scale.set(.075,.065,.09);}
    const legs=[];for(const [x,z] of [[.067,.14],[-.067,.14],[.067,-.14],[-.067,-.14]]){
      const leg=new T.Group();leg.position.set(x,.17,z);pose.add(leg);mesh(new T.CylinderGeometry(.022,.018,.14,7),fur,leg,0,-.07,0);const paw=mesh(sphere,accent,leg,0,-.14,.01);paw.scale.set(.028,.018,.038);legs.push(leg);
    }
    const tail=new T.Group();tail.position.set(0,.28,-.21);tail.rotation.x=-1;pose.add(tail);let parent=tail;
    for(let i=0;i<4;i++){const seg=new T.Group();seg.position.y=i===0?0:.07;parent.add(seg);mesh(new T.CylinderGeometry(.013,.019,.077,7),i===3?accent:fur,seg,0,.035,0);seg.rotation.x=.16;parent=seg;}
    const collar=mesh(new T.TorusGeometry(.063,.009,6,16),material('#7A1F2B'),pose,0,.3,.14);collar.rotation.x=Math.PI/2;
    mesh(new T.SphereGeometry(.013,8,6),gold,pose,0,.245,.19);
    // Generous, invisible hit area makes the tiny cats usable on touch screens.
    const hit=mesh(new T.SphereGeometry(.28,8,6),new T.MeshBasicMaterial({visible:false}),g,0,.22,0);hit.userData={type:'cat',id:index,floor:def.floor};targets.push(hit);
    const halo=mesh(new T.RingGeometry(.28,.31,32),new T.MeshBasicMaterial({color:'#E8C86A',transparent:true,opacity:.65,side:T.DoubleSide,depthWrite:false}),g,0,.015,0);halo.rotation.x=-Math.PI/2;halo.visible=false;
    return {g,pose,head,body,ears,eyes,legs,tail,halo};
  });
}
export function poseCat(visual,cat,time,reducedMotion=false){
  const {g,pose,head,body,ears,eyes,legs,tail}=visual,sitting=['sitting','resting'].includes(cat.mode),petting=cat.mode==='petting',resting=cat.mode==='resting';
  g.position.set(cat.x,(cat.floor===2?3.5:0)+(reducedMotion?0:cat.hop),cat.z);g.rotation.y=cat.heading;
  pose.rotation.x=resting?-.18:sitting?-.1:petting?-.12:0;pose.position.y=resting?-.06:sitting?-.025:0;
  body.scale.y=resting?.09:.115+(petting&&!reducedMotion?Math.sin(time*9)*.003:0);
  legs.forEach((leg,i)=>{leg.rotation.x=resting?.8:sitting&&i>1?-1.05:cat.moving?Math.sin(cat.step+(i===0||i===3?0:Math.PI))*.5:0;});
  head.rotation.x=petting?-.25:resting?.12:Math.sin(time*.8+cat.phase)*.05;
  head.rotation.y=cat.moving?0:petting?Math.sin(time*4)*.12:Math.sin(time*.5+cat.phase)*.18;
  const blink=resting||petting||((time+cat.phase)%4.5<.13);for(const eye of eyes)eye.scale.y=blink?.12:1;
  ears.forEach((ear,i)=>ear.rotation.z=(i===0?1:-1)*(.3+(petting?.1:0))+(reducedMotion?0:Math.sin(time*2+cat.phase+i)*.035));
  tail.rotation.x=resting?-2.2:petting?-.45:-1;tail.rotation.z=reducedMotion?0:Math.sin(time*(petting?7:2.6)+cat.phase)*(resting?.06:petting?.4:.24);
}
export function makeYarnToy(T,scene){
  const g=new T.Group(),ball=new T.Mesh(new T.SphereGeometry(.085,14,10),new T.MeshStandardMaterial({color:'#913C4C',roughness:.95}));g.add(ball);
  const yarn=new T.MeshStandardMaterial({color:'#E8C86A',roughness:.9});for(let i=0;i<4;i++){const ring=new T.Mesh(new T.TorusGeometry(.081,.003,4,20),yarn);ring.rotation.set(i*.7,i*.85,i*.45);g.add(ring);}g.visible=false;scene.add(g);return g;
}
