/* Mendoza Hall — Three.js r128; same-origin Pages Functions + Neon.
   Shared assignments are only changed after the server confirms a write.
   Private organizer notes and session tokens are NEVER stored in localStorage. */
import {ROOMS,DAYS,LAYOUT,STATUSES,DEFAULT_COLOR,PAPER_COLORS,blankState,cleanBooth,cleanRoom,cleanImport,publicState} from './lib/model.js';
(() => {
'use strict';
const $=id=>document.getElementById(id), CACHE='mendoza_public_cache_v4', DEMO='mendoza_demo_v4';
const H={width:4.4,height:3.2,eye:1.62,start:6.2}, floors={1:{near:8.2,far:-140.2,min:-138,max:6.6,y:0},2:{near:8.2,far:-16.2,min:-14,max:6.6,y:3.5}};
const colors=[DEFAULT_COLOR,'#2563EB','#DC2626','#16A34A','#EAB308','#9333EA','#EA580C','#EC4899','#111827','#7A1F2B'];
const labels={available:'Open',assigned:'Assigned',reserved:'Reserved',maintenance:'Not available'};
const byId=Object.fromEntries(LAYOUT.map(b=>[b.id,b])), roomById=Object.fromEntries(ROOMS.map(r=>[r.id,r]));
let state=blankState(),day='1',floor=1,isLSC=false,token=null,authEpoch=0,mode='checking',busy=false,polling=false,failures=0;
let selection=null,dirty=false,paperPick=PAPER_COLORS[0],mapOpen=false,mapFloor=1,mapFollow=true,mapView=null;
let scene,camera,renderer,hallGroups={},floorMeshes={},boothMeshes={},papers={},roomHL,raycaster,pointer,targets=[],cats=[];
let cam={z:H.start,yaw:0,pitch:0,fov:68},goal={...cam},walk=0,keyWalk=0,tween=null,last=performance.now(),floorBusy=false,toastTimer;
let demo=false,authLoading=false,refreshTimer,requestId=0;
const emptyBooth=()=>({org:'',rep:'',description:'',notes:'',color:DEFAULT_COLOR,status:'available'});
const booth=id=>({...emptyBooth(),...state.days[day].booths[id]});
const reservation=id=>state.days[day].rooms[id]||{reservedFor:'',note:'',paper:PAPER_COLORS[0]};
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4200);}
function sync(kind,message){$('syncInfo').className=`syncInfo ${kind}`;$('syncInfo').lastElementChild.textContent=message;$('lmNote').textContent=message;let badge=$('connection');if(!badge){badge=document.createElement('p');badge.id='connection';badge.style.cssText='margin:5px 0 0;font-size:11px;max-width:240px';$('availLine').parentElement.after(badge);}badge.textContent=message;badge.style.color=kind==='bad'?'#ffb4a9':kind==='ok'?'#c6e9ae':'#E8C86A';}
function showMode(){if(demo)sync('','LOCAL DEMO · this browser only, not Neon');else if(mode==='neon')sync('ok','Live · refreshes every 15 seconds');else if(mode==='checking')sync('busy','Connecting to the shared plan…');else sync('bad','Offline · read-only cached plan; retrying automatically');setControls();}
function cachePublic(){try{localStorage.setItem(CACHE,JSON.stringify(publicState(state)));}catch{}}
function loadCache(){try{const raw=JSON.parse(localStorage.getItem(CACHE));const n=cleanImport(raw);n.revision=0;state=publicState(n);}catch{} }
function clearPrivate(){for(const d of DAYS)for(const b of Object.values(state.days[d].booths))delete b.notes;$('fNotes').value='';cachePublic();}
function setControls(){
  const locked=busy||!isLSC||(!demo&&mode!=='neon');
  for(const selector of ['#boothEdit input','#boothEdit textarea','#boothEdit select','#boothEdit button','#roomEdit input','#roomEdit button','#dayTitle','#importBtn','#importFile','#resetDayBtn'])for(const e of document.querySelectorAll(selector))e.disabled=locked;
  $('lscGo').disabled=authLoading||busy;
  $('exportBtn').disabled=busy||(!demo&&mode!=='neon');
}
async function api(method,path,data,{write=false,signal}={}){
  const headers={Accept:'application/json'};
  if(data!==undefined)headers['Content-Type']='application/json';
  if(token)headers.Authorization=`Bearer ${token}`;
  if(write)headers['If-Match']=`"${state.revision}"`;
  const response=await fetch(`/api/${path}`,{method,headers,body:data===undefined?undefined:JSON.stringify(data),cache:'no-store',signal:signal||AbortSignal.timeout(18000),credentials:'same-origin'});
  if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('The Pages API is missing or returned a non-JSON response. Check the Functions deployment.');
  const result=await response.json();
  if(!response.ok){const error=new Error(result.error||`HTTP ${response.status}`);error.status=response.status;throw error;}
  return result;
}
function apply(raw){
  const parsed=cleanImport(raw);if(!Number.isInteger(raw.revision)||raw.revision<0)throw new Error('Invalid server state revision');
  parsed.revision=raw.revision;parsed.updatedAt=raw.updatedAt;state=isLSC?parsed:publicState(parsed);cachePublic();refresh();
}
async function pull(force=false){
  if(demo||busy||polling&&!force)return;
  const epoch=authEpoch,id=++requestId;polling=true;
  try{
    const result=await api('GET','state');
    if(epoch!==authEpoch||id!==requestId)return;
    const wasOffline=mode!=='neon';mode='neon';failures=0;
    if(force||wasOffline||result.revision!==state.revision)apply(result);
    showMode();
  }catch(error){
    if(epoch!==authEpoch||id!==requestId)return;
    if(error.status===401){await signOut(false);toast('Session expired. Sign in again.');return;}
    mode='error';failures++;showMode();
    if(force)toast(error.message);
  }finally{if(id===requestId)polling=false;}
}
function invalidateRequests(){authEpoch++;requestId++;polling=false;}
async function mutate(method,path,payload,message){
  if(busy||!isLSC||!demo&&mode!=='neon'){toast('Sign in and reconnect before editing.');return false;}
  busy=true;invalidateRequests();setControls();sync('busy','Saving — waiting for confirmation…');
  try{
    if(demo){
      const n=structuredClone(state),[kind,d,id]=path.split('/').map(decodeURIComponent);
      if(kind==='booths'){const c=cleanBooth(payload);if(JSON.stringify(c)===JSON.stringify(emptyBooth()))delete n.days[d].booths[id];else n.days[d].booths[id]=c;}
      if(kind==='rooms'){const c=cleanRoom(payload);if(c.reservedFor)n.days[d].rooms[id]=c;else delete n.days[d].rooms[id];}
      if(kind==='days'){if(method==='DELETE')n.days[d]={title:n.days[d].title,booths:{},rooms:{}};else n.days[d].title=payload.title;}
      if(kind==='import')n.days=cleanImport(payload).days;
      n.revision++;n.updatedAt=Date.now();state=n;try{localStorage.setItem(DEMO,JSON.stringify(publicState(n)));}catch{}dirty=false;refresh(true);
    }else{
      const result=await api(method,path,payload,{write:true});dirty=false;apply(result);refresh(true);
    }
    toast(message);return true;
  }catch(error){
    if(error.status===401){await signOut(false);toast('Session expired. Sign in again.');}
    else toast(error.status===409?`${error.message} Your form is kept open for review.`:`Not saved: ${error.message}`);
    // The visible assignment was never changed optimistically. Always fetch the truth,
    // even when the server revision equals the last known revision.
    if(!demo){busy=false;await pull(true);busy=true;}
    return false;
  }finally{busy=false;showMode();setControls();}
}
async function signOut(revoke=true){
  const old=token;invalidateRequests();token=null;isLSC=false;dirty=false;
  document.body.classList.remove('lsc');$('lscMenu').classList.remove('open');clearPrivate();refresh(true);setControls();
  // Do not persist the bearer token: reload intentionally requires sign-in again.
  if(old&&revoke){try{await fetch('/api/logout',{method:'POST',headers:{Authorization:`Bearer ${old}`},signal:AbortSignal.timeout(8000)});}catch{toast('Signed out locally. The server session expires within 8 hours.');}}
  if(!demo)await pull(true);
}
async function signIn(){
  if(authLoading)return;authLoading=true;setControls();$('lscErr').textContent='Checking…';
  try{
    if(!demo){const result=await api('POST','login',{passcode:$('lscPass').value});token=result.token;if(!/^[a-f0-9]{64}$/.test(token||''))throw new Error('Invalid session response');}
    invalidateRequests();isLSC=true;document.body.classList.add('lsc');
    if(!demo){const result=await api('GET','state');apply(result);mode='neon';}
    $('lscPass').value='';$('lscWrap').classList.remove('open');$('lscErr').textContent='';dirty=false;refresh(true);toast(demo?'Local demo unlocked — changes are NOT shared':'Signed in. Tap a booth or door to edit.');
  }catch(error){token=null;isLSC=false;document.body.classList.remove('lsc');clearPrivate();$('lscErr').textContent=error.message;}
  finally{authLoading=false;showMode();}
}
function openSignIn(){if(isLSC){$('lscMenu').classList.toggle('open');return;}$('lscPass').value='';$('lscPass').disabled=demo;$('lscPass').placeholder=demo?'Local demo — no password required':'Organizer passphrase';$('lscErr').textContent=demo?'Local preview only. No connection to Neon.':'';$('lscWrap').classList.add('open');if(!demo)setTimeout(()=>$('lscPass').focus(),50);}

/* ---------- Rendering: self-contained procedural hallway and exterior ---------- */
const T=THREE;
function material(color,roughness=.9,metalness=0){return new T.MeshStandardMaterial({color,roughness,metalness});}
function mesh(geo,mat,parent,x=0,y=0,z=0){const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.receiveShadow=true;(parent||scene).add(m);return m;}
function box(w,h,d,mat,parent,x=0,y=0,z=0){return mesh(new T.BoxGeometry(w,h,d),mat,parent,x,y,z);}
function texture(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const tex=new T.CanvasTexture(c);tex.encoding=T.sRGBEncoding;return tex;}
function signTexture(text,bg='#F1EEE6',fg='#1A1A1A',w=768,h=128){return texture(w,h,(g,w,h)=>{g.fillStyle=bg;g.fillRect(0,0,w,h);g.strokeStyle=fg;g.lineWidth=5;g.strokeRect(5,5,w-10,h-10);let size=54;g.font=`bold ${size}px Arial`;while(g.measureText(text).width>w-32&&size>16)g.font=`bold ${size-=2}px Arial`;g.fillStyle=fg;g.textAlign='center';g.textBaseline='middle';g.fillText(text,w/2,h/2);});}
function plane(w,h,mat,parent,x,y,z,angle=0){const p=mesh(new T.PlaneGeometry(w,h),mat,parent,x,y,z);p.rotation.y=angle;return p;}
function sign(text,parent,x,y,z,w=1.4,h=.24,angle=Math.PI/2,bg,fg){return plane(w,h,new T.MeshStandardMaterial({map:signTexture(text,bg,fg),roughness:.7}),parent,x,y,z,angle);}
const mats={};
function buildMaterials(){
  mats.yellow=material('#D3AF60');mats.maroon=material('#6E1A28');mats.trim=material('#E6CF98');mats.ceiling=material('#D8D2C4');mats.wood=material('#3B2418');mats.steel=material('#C9CDD1',.4,.7);mats.glass=material('#171F24',.35,.3);mats.green=material('#4B6B36');mats.trunk=material('#4D3A2A');
  const tile=texture(512,512,(g,w,h)=>{g.fillStyle='#E6E6E8';g.fillRect(0,0,w,h);for(let i=0;i<900;i++){g.fillStyle=`rgba(110,105,95,${Math.random()*.08})`;g.fillRect(Math.random()*w,Math.random()*h,2,2);}g.strokeStyle='#AAA69F';g.lineWidth=4;for(let n=0;n<=2;n++){g.beginPath();g.moveTo(n*256,0);g.lineTo(n*256,h);g.moveTo(0,n*256);g.lineTo(w,n*256);g.stroke();}});
  mats.tile=tile;
}
function floorMaterial(length){const t=mats.tile.clone();t.needsUpdate=true;t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(4.9/1.2,length/1.2);return new T.MeshStandardMaterial({map:t,roughness:.28});}
function buildCorridor(f){
  const b=floors[f],group=new T.Group();group.position.y=b.y;scene.add(group);hallGroups[f]=group;
  const length=b.near-b.far,mid=(b.near+b.far)/2;
  const fl=mesh(new T.PlaneGeometry(4.9,length),floorMaterial(length),group,.25,0,mid);fl.rotation.x=-Math.PI/2;floorMeshes[f]=fl;
  box(5.3,.12,length,mats.ceiling,group,.2,3.26,mid);
  const stairs=f===1?[0,-82,-132]:[0];let start=b.near;
  for(const z of [...stairs,b.far-1.6]){const end=z+1.6;if(start>end){box(.2,3.2,start-end,mats.yellow,group,-2.3,1.6,(start+end)/2);box(.05,.42,start-end,mats.maroon,group,-2.18,.21,(start+end)/2);}start=z-1.6;}
  box(.42,.34,length,mats.yellow,group,2.4,3.03,mid);
  const span=3.54,half=span/2,yS=2.05,rise=.78,R=(half*half+rise*rise)/(2*rise),cy=yS+rise-R,aR=Math.atan2(yS-cy,half),aL=Math.PI-aR;
  const shape=new T.Shape();shape.moveTo(-half,yS);shape.lineTo(-half,2.87);shape.lineTo(half,2.87);shape.lineTo(half,yS);shape.absarc(0,cy,R,aR,aL,false);
  const arch=new T.ExtrudeGeometry(shape,{depth:.36,bevelEnabled:false,curveSegments:20});
  const bays=Math.round((8-(b.far+.2))/4),railGeo=new T.BoxGeometry(.022,.86,.022),rails=new T.InstancedMesh(railGeo,mats.steel,bays*28),matrix=new T.Matrix4();let count=0;
  for(let i=0;i<=bays;i++){
    const z=8-i*4;box(.46,.5,.46,mats.maroon,group,2.4,.25,z);box(.42,2.7,.42,mats.yellow,group,2.4,1.85,z);box(.5,.1,.5,mats.trim,group,2.4,2,z);box(4.6,.3,.32,mats.yellow,group,.1,3.05,z);
    if(!stairs.some(s=>Math.abs(z-s)<1.85)){box(.12,3.2,.4,mats.yellow,group,-2.15,1.6,z);box(.14,.42,.44,mats.maroon,group,-2.14,.21,z);}
    if(i===bays)break;const bz=z-2;
    const ar=mesh(arch,mats.yellow,group,2.22,0,bz);ar.rotation.y=Math.PI/2;
    if(f!==1||bz!==-82){box(.24,.16,span,mats.trim,group,2.4,.08,bz);box(.06,.04,span,mats.steel,group,2.34,1,bz);box(.03,.025,span,mats.steel,group,2.34,.22,bz);for(let n=0;n<28;n++){matrix.makeTranslation(2.34,.59,bz-half+.08+n*.125);rails.setMatrixAt(count++,matrix);}}
    box(1.32,.05,.36,mats.steel,group,0,3.16,bz);box(1.22,.03,.24,new T.MeshStandardMaterial({color:'#fff',emissive:'#FFF4DE',emissiveIntensity:.8}),group,0,3.12,bz);
  }
  rails.count=count;group.add(rails);
  ROOMS.filter(r=>r.floor===f).forEach(r=>{
    const dz=r.z+.85,door=box(.09,2.36,1.16,mats.wood,group,-2.17,1.18,dz);door.userData={type:'room',id:r.id,floor:f};targets.push(door);
    for(const y of [.4,1.05,1.85])box(.015,.47,.78,material('#46291B'),group,-2.11,y,dz);
    plane(.76,.68,new T.MeshStandardMaterial({color:'#121619',roughness:.25}),group,-2.1,1.85,dz,Math.PI/2);
    mesh(new T.SphereGeometry(.035,8,6),material('#C8A25A',.3,.8),group,-2.05,1.02,dz-.4);
    const sg=sign(r.name.toUpperCase(),group,-2.12,2.62,dz,r.name.length>18?1.8:1.1,.23);sg.userData={type:'room',id:r.id,floor:f};targets.push(sg);
    box(.08,1.3,1.5,mats.wood,group,-2.17,1.55,r.z-.85);box(.02,1.18,1.38,mats.glass,group,-2.11,1.55,r.z-.85);
    for(let z=-.6;z<=.6;z+=.3)box(.02,1.18,.025,mats.steel,group,-2.08,1.55,r.z-.85+z);
    for(let y=1.05;y<=2.1;y+=.15)box(.025,.015,1.38,mats.steel,group,-2.07,y,r.z-.85);
    box(.28,.05,1.55,mats.wood,group,-2.06,.88,r.z-.85);
    const p=plane(.5,.58,new T.MeshStandardMaterial({transparent:true,alphaTest:.04,side:T.DoubleSide}),group,-2.06,1.38,dz,Math.PI/2);p.rotation.z=-.04;p.userData={type:'room',id:r.id,floor:f};targets.push(p);papers[r.id]=p;
  });
  stairs.forEach((z,i)=>buildStairs(group,f,z,i===0));
  for(const [z,rot,startWall] of [[b.near,Math.PI,true],[b.far,0,false]]){
    box(5.15,3.32,.3,mats.yellow,group,.15,1.66,z);box(5.15,.42,.05,mats.maroon,group,.15,.21,z+(startWall?-.17:.17));
    sign(startWall?(f===2?'2ND FLOOR · ROOM 214–215':'WELCOME TO MENDOZA HALL'):'END OF HALLWAY',group,.2,2.35,z+(startWall?-.18:.18),3.8,.55,rot,'#6E1A28','#E8C86A');
    plane(1.4,1.1,mats.glass,group,-1,1.25,z+(startWall?-.18:.18),rot);
  }
  if(f===1){for(const z of [-28.5,-29.1]){box(.42,.82,.42,material('#0E5A63'),group,1.85,.41,z);box(.46,.06,.46,material('#0A474F'),group,1.85,.85,z);}sign('MENDOZA HALL · ENTRANCE',group,2.17,2.99,-82,2.5,.25,-Math.PI/2,'#6E1A28','#E8C86A');}
}
function buildStairs(group,f,z,active){
  box(.2,.7,3.2,mats.yellow,group,-2.3,2.85,z);
  const sg=sign(f===2?'STAIRS ↓ 1ST FLOOR':active?'STAIRS ↑ ROOM 214–215':'STAIRS ↑ 2ND FLOOR',group,-2.17,2.78,z,2.1,.36);
  if(active){sg.userData={type:'stairs',id:f===2?1:2,floor:f};targets.push(sg);}
  const mat=material('#D9D5CC',.5);box(5.5,.12,3.2,mat,group,-4.95,-.06,z);
  for(const side of [-1,1])box(5.6,6.6,.2,mats.yellow,group,-4.95,3.3,z+side*1.7);
  box(.2,6.6,3.5,mats.yellow,group,-7.8,3.3,z);
  for(let i=0;i<9;i++){
    const top=(i+1)*.175,x=-3.4-i*.28;box(.28,top,1.6,mat,group,x,top/2,z-.8);box(.04,.02,1.6,mats.maroon,group,x+.12,top+.01,z-.8);
    const h=1.75+(i+1)*.175;box(.28,h,1.6,mat,group,-5.92+i*.28,h/2,z+.8);
  }
  box(1.88,1.75,3.2,mat,group,-6.76,.875,z);
  for(let i=0;i<5;i++)box(.03,.95,.03,mats.steel,group,-3.2-i*.55,.65+i*.34,z);
  const light=new T.PointLight('#FFF1D6',.45,9,2);light.position.set(-4.8,3.1,z);group.add(light);
}
function buildOutside(){
  const lawn=material('#56663F'),concrete=material('#B8B5AA'),road=material('#4A4B4C'),soil=material('#5B4B38');
  box(90,.1,300,lawn,scene,47,-.42,-66);box(2.1,.16,148.4,soil,scene,3.67,-.28,-66);box(2,.16,290,concrete,scene,5.72,-.28,-66);box(.15,.2,290,concrete,scene,6.795,-.26,-66);box(8,.06,290,road,scene,10.87,-.37,-66);box(2,.16,290,concrete,scene,15.94,-.28,-66);
  box(2.1,.16,3.2,concrete,scene,3.67,-.27,-82);box(.9,.3,3.54,concrete,scene,3,-.15,-82);
  const stripe=material('#E9E6DA'),yellow=material('#E0C34A');for(const x of [7.15,14.6])box(.1,.01,290,stripe,scene,x,-.33,-66);
  for(let z=50;z>-210;z-=8)box(.12,.01,3.2,yellow,scene,10.87,-.33,z);
  for(let k=0;k<7;k++)box(.5,.01,3,stripe,scene,7.6+k*1.08,-.32,-82);
  for(let z=5;z>-140;z-=2.4){if(Math.abs(z+82)<2)continue;const shrub=mesh(new T.SphereGeometry(.5,9,7),mats.green,scene,3.3+Math.random()*.8,.12,z);shrub.scale.y=.85;}
  for(let z=5;z>-145;z-=11){if(Math.abs(z+82)<3)continue;mesh(new T.CylinderGeometry(.07,.1,1.5,7),mats.trunk,scene,4,.4,z);for(let k=0;k<3;k++)mesh(new T.SphereGeometry(.55-k*.1,10,8),mats.green,scene,4,1.2+k*.5,z);}
  for(let z=20;z>-180;z-=12){mesh(new T.CylinderGeometry(.12,.18,3,7),mats.trunk,scene,18.2,1.1,z);for(let k=0;k<3;k++)mesh(new T.IcosahedronGeometry(1.4,1),mats.green,scene,18.2+(k-1)*.8,3.2+k*.3,z);}
  box(9,9,55,material('#D9CDAE'),scene,38,4.1,-40);box(9,7,45,material('#CFC5AA'),scene,36,3.1,-105);
}
function buildBooths(){
  for(const L of LAYOUT){
    const g=new T.Group();g.position.set(L.x,floors[L.floor].y,L.z);g.userData.floor=L.floor;scene.add(g);
    const cloth=material(DEFAULT_COLOR),top=box(.78,.04,1.62,cloth,g,0,.74,0);top.castShadow=true;
    // Draped rectangular cloth leaves the aisle open, matching the original tables.
    box(.78,.7,.025,cloth,g,0,.37,.8);box(.78,.7,.025,cloth,g,0,.37,-.8);box(.025,.7,1.62,cloth,g,-.38,.37,0);box(.025,.7,1.62,cloth,g,.38,.37,0);
    const bx=L.x<0?-.3:.3;for(const z of [-.55,.55])box(.025,.5,.025,mats.steel,g,bx,1,z);
    const label=plane(1.3,.325,new T.MeshBasicMaterial({side:T.DoubleSide,toneMapped:false}),g,bx,1.4,0,L.x<0?Math.PI/2:-Math.PI/2);
    const ring=mesh(new T.RingGeometry(.82,.94,32),new T.MeshBasicMaterial({color:'#E8C86A',transparent:true,opacity:.8,side:T.DoubleSide,depthWrite:false}),g,0,.025,0);ring.rotation.x=-Math.PI/2;ring.scale.y=1.45;ring.visible=false;
    for(const part of [top,...g.children.filter(c=>c.isMesh&&c!==top&&c!==ring&&c!==label),label]){part.userData={type:'booth',id:L.id,floor:L.floor};targets.push(part);}
    boothMeshes[L.id]={group:g,cloth,label,ring};
  }
}
function buildCats(){
  const defs=[['Mingming','#D9893B',1,3],['Muning','#2B2826',1,-19],['Kuting','#8D8C8A',1,-41],['Tisay','#EFEAE0',1,-62],['Pancake','#F1ECE2',1,-83],['Bantay','#6E6862',1,-112],['Mochi','#E9D3AE',2,-3.5]];
  defs.forEach(([name,color,f,z],index)=>{
    const g=new T.Group(),fur=material(color),pink=material('#E58C9A'),dark=material('#141210');scene.add(g);
    const body=mesh(new T.SphereGeometry(1,12,8),fur,g,0,.22,0);body.scale.set(.12,.11,.22);
    const head=mesh(new T.SphereGeometry(.085,12,8),fur,g,0,.32,.21);
    for(const side of [-1,1]){const ear=mesh(new T.ConeGeometry(.035,.075,4),fur,g,side*.047,.39,.205);ear.rotation.z=-side*.3;mesh(new T.SphereGeometry(.014,7,5),dark,g,side*.033,.33,.283);}
    mesh(new T.SphereGeometry(.012,7,5),pink,g,0,.303,.298);
    const legs=[];for(const x of [-.06,.06])for(const dz of [-.12,.12])legs.push(mesh(new T.CylinderGeometry(.022,.018,.15,6),fur,g,x,.08,dz));
    const tail=mesh(new T.CylinderGeometry(.014,.022,.3,6),fur,g,0,.3,-.28);tail.rotation.x=-.8;
    g.traverse(p=>{if(p.isMesh){p.userData={type:'cat',id:index,floor:f};targets.push(p);}});
    cats.push({g,name,f,z,x:(Math.random()-.5)*.8,target:z,heading:0,next:0,phase:Math.random()*6,legs,tail,pet:0});
  });
}
function buildScene(){
  scene=new T.Scene();scene.background=new T.Color('#C9CDD0');scene.fog=new T.Fog('#B9B2A0',22,150);
  camera=new T.PerspectiveCamera(68,innerWidth/innerHeight,.1,400);camera.rotation.order='YXZ';
  renderer=new T.WebGLRenderer({antialias:innerWidth>700,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,innerWidth<700?1.5:2));renderer.setSize(innerWidth,innerHeight);renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;$('viewport').appendChild(renderer.domElement);
  scene.add(new T.HemisphereLight('#E9E2D2','#5A4A33',.65),new T.AmbientLight('#FFE2B0',.2));
  const sun=new T.DirectionalLight('#F4F1EA',.8);sun.position.set(16,10,-60);sun.target.position.set(0,0,-66);scene.add(sun,sun.target);
  const fill=new T.DirectionalLight('#DDE4EA',.22);fill.position.set(10,2,0);scene.add(fill);
  raycaster=new T.Raycaster();pointer=new T.Vector2();buildMaterials();buildCorridor(1);buildCorridor(2);buildOutside();buildBooths();buildCats();
  roomHL=box(.025,2.4,1.2,new T.MeshBasicMaterial({color:'#E8C86A',wireframe:true}),scene);roomHL.visible=false;
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();toast('Graphics context lost. Reload to restore the hallway.');});
  applyFloor();
}
function updateLabel(id){
  const b=booth(id),m=boothMeshes[id];m.cloth.color.set(b.color);
  const tex=texture(512,128,(g,w,h)=>{g.fillStyle='#fff';g.fillRect(0,0,w,h);g.fillStyle=b.color===DEFAULT_COLOR?'#7A1F2B':b.color;g.fillRect(0,0,w,36);g.fillStyle='#fff';g.font='bold 21px Arial';g.fillText(`BOOTH ${id} · DAY ${day}`,14,25);let size=30;const main=b.org||labels[b.status];g.font=`bold ${size}px Arial`;while(g.measureText(main).width>w-28&&size>14)g.font=`bold ${size-=2}px Arial`;g.fillStyle='#1C1A17';g.fillText(main,14,78);g.font='18px Arial';g.fillStyle='#7A6F5F';g.fillText(`${roomById[byId[id].room].name} · ${byId[id].side==='room'?'Room':'Grill'} side`,14,108);});
  m.label.material.map?.dispose();m.label.material.map=tex;m.label.material.needsUpdate=true;
}
function updatePaper(id){
  const rd=reservation(id),p=papers[id];p.visible=!!rd.reservedFor;
  if(!rd.reservedFor)return;
  const tex=texture(384,448,(g,w,h)=>{
    g.fillStyle=rd.paper;g.fillRect(20,30,w-40,h-50);g.strokeStyle='rgba(60,90,150,.2)';for(let y=130;y<420;y+=36){g.beginPath();g.moveTo(30,y);g.lineTo(354,y);g.stroke();}
    g.fillStyle='rgba(238,228,192,.95)';g.fillRect(40,20,100,28);g.fillRect(244,20,100,28);g.fillStyle='#8B1E2D';g.textAlign='center';g.font='bold 28px Arial';g.fillText('RESERVED FOR',192,95);
    g.fillStyle='#1F2A44';g.font='bold 34px cursive';const words=rd.reservedFor.split(/\s+/),lines=[];let line='';for(const word of words){if(g.measureText(`${line} ${word}`).width>300&&line){lines.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)lines.push(line);lines.slice(0,4).forEach((l,i)=>g.fillText(l,192,175+i*42,310));
    g.font='21px cursive';g.fillText(rd.note.slice(0,30),192,350,310);g.fillText(rd.note.slice(30),192,380,310);g.fillStyle='#8B1E2D';g.fillText(`Day ${day} · CSSP LSC`,192,412);
  });p.material.map?.dispose();p.material.map=tex;p.material.needsUpdate=true;
}
function refresh(forceForm=false){
  if(!renderer)return;
  for(const L of LAYOUT)updateLabel(L.id);for(const r of ROOMS)updatePaper(r.id);
  const occupied=LAYOUT.filter(L=>booth(L.id).status!=='available').length,reserved=ROOMS.filter(r=>reservation(r.id).reservedFor).length;
  $('availLine').textContent=`${occupied}/${LAYOUT.length} booths · ${reserved} rooms reserved`;$('dayTitleTxt').textContent=state.days[day].title||'Booth & room plan';
  for(const b of document.querySelectorAll('#days button')){const on=b.dataset.day===day;b.classList.toggle('on',on);b.setAttribute('aria-selected',String(on));}
  $('lmDay').textContent=`Day ${day}`;$('letterDay').textContent=`Day ${day}`;$('mapDay').textContent=`Day ${day}`;
  if(document.activeElement!==$('dayTitle'))$('dayTitle').value=state.days[day].title;
  const options=[new Option('Go to…','')];for(const r of ROOMS)options.push(new Option(`${r.name}${r.floor===2?' (2F)':''}${reservation(r.id).reservedFor?' 📌':''}`,`room:${r.id}`));for(const L of LAYOUT){const b=booth(L.id);if(b.org)options.push(new Option(`${b.org} · ${L.id}`,`booth:${L.id}`));}$('roomSelect').replaceChildren(...options);
  if(!dirty||forceForm)renderPanel();if(mapOpen)renderMap();setControls();
}

/* ---------- Panels and confirmed editing ---------- */
function row(label,value){const wrap=document.createElement('div');wrap.className='pRow';const k=document.createElement('span'),v=document.createElement('span');k.className='k';v.className='v';k.textContent=label;v.textContent=value;wrap.append(k,v);return wrap;}
function discard(){return !dirty||confirm('Discard the unsaved form changes?');}
function select(type,id,fly=false){if(!discard())return;dirty=false;selection={type,id};$('panel').classList.add('open');renderPanel();if(fly)goTo(type,id);}
function closePanel(){if(!discard())return;dirty=false;selection=null;$('panel').classList.remove('open');highlight();}
function highlight(){for(const [id,m] of Object.entries(boothMeshes))m.ring.visible=selection?.type==='booth'&&selection.id===id&&byId[id].floor===floor;roomHL.visible=selection?.type==='room'&&roomById[selection.id].floor===floor;if(roomHL.visible){const r=roomById[selection.id];roomHL.position.set(-2.02,floors[floor].y+1.2,r.z+.85);}}
function swatches(id,palette,active,choose){$(id).replaceChildren(...palette.map(c=>{const b=document.createElement('button');b.type='button';b.className=`sw${id==='paperSwatches'?' paper':''}${c===active?' sel':''}`;b.style.background=c;b.setAttribute('aria-label',`Color ${c}`);b.onclick=()=>{dirty=true;choose(c);swatches(id,palette,c,choose);};return b;}));}
function renderPanel(){
  highlight();if(!selection)return;
  const {type,id}=selection,view=$('pView');view.replaceChildren();$('boothEdit').hidden=true;$('roomEdit').hidden=true;$('pLock').style.display=isLSC?'none':'flex';
  if(type==='booth'){
    const b=booth(id),L=byId[id];$('pKicker').textContent=`Booth · Day ${day}`;$('pTitle').textContent=id;$('pSub').textContent=`${roomById[L.room].name} · ${L.floor}F · ${L.side==='room'?'Room':'Grill'} side`;$('pBadge').textContent=labels[b.status];$('pBadge').className=`badge ${b.status}`;
    if(isLSC){$('boothEdit').hidden=false;for(const [field,key] of [['fOrg','org'],['fRep','rep'],['fDesc','description'],['fNotes','notes'],['fColor','color'],['fStatus','status']])$(field).value=b[key]||'';swatches('swatches',colors,b.color,c=>{$('fColor').value=c;boothMeshes[id].cloth.color.set(c);});}
    else{view.append(row('Organization',b.org||'No organization yet'));if(b.rep)view.append(row('Representative',b.rep));if(b.description)view.append(row('About',b.description));}
  }else{
    const r=roomById[id],rd=reservation(id);$('pKicker').textContent=`Room · ${r.floor}F · Day ${day}`;$('pTitle').textContent=r.name;$('pSub').textContent=r.floor===2?'Take the first stairs to the second floor':'Door on the room side of the hallway';$('pBadge').textContent=rd.reservedFor?'📌 Reserved':'Not reserved';$('pBadge').className=`badge ${rd.reservedFor?'taped':''}`;
    if(isLSC){$('roomEdit').hidden=false;$('rFor').value=rd.reservedFor;$('rNote').value=rd.note;paperPick=rd.paper;swatches('paperSwatches',PAPER_COLORS,paperPick,c=>{paperPick=c;});}else{view.append(row('Reserved for',rd.reservedFor||'Nobody yet'));if(rd.note)view.append(row('Note',rd.note));}
  }setControls();
}
async function saveBooth(){if(selection?.type!=='booth'||!isLSC)return;const id=selection.id,d=day;try{const data=cleanBooth({org:$('fOrg').value,rep:$('fRep').value,description:$('fDesc').value,notes:$('fNotes').value,color:$('fColor').value,status:$('fStatus').value});if(await mutate('PUT',`booths/${d}/${encodeURIComponent(id)}`,data,`Saved booth ${id}`))confetti();}catch(e){toast(e.message);}}
async function saveRoom(){if(selection?.type!=='room'||!isLSC)return;try{const data=cleanRoom({reservedFor:$('rFor').value,note:$('rNote').value,paper:paperPick});if(!data.reservedFor){toast('Write who the room is reserved for first.');return;}if(await mutate('PUT',`rooms/${day}/${encodeURIComponent(selection.id)}`,data,'📌 Reservation saved'))confetti();}catch(e){toast(e.message);}}
function setDay(d){if(busy||!DAYS.includes(d)||!discard())return;dirty=false;day=d;try{localStorage.setItem('mendoza_day',day);}catch{}refresh(true);toast(`Day ${day}`);}

/* ---------- Walking and floors ---------- */
const clamp=z=>Math.max(floors[floor].min,Math.min(floors[floor].max,z));
function moveTo(z,yaw=goal.yaw,pitch=goal.pitch){tween={start:performance.now(),duration:Math.min(2200,Math.max(650,Math.abs(z-cam.z)*45)),from:{...cam},to:{z:clamp(z),yaw,pitch}};goal.z=clamp(z);goal.yaw=yaw;goal.pitch=pitch;}
function applyFloor(){for(const f of [1,2])hallGroups[f].visible=f===floor;for(const L of LAYOUT)boothMeshes[L.id].group.visible=L.floor===floor;for(const c of cats)c.g.visible=c.f===floor;highlight();}
function changeFloor(f,after){
  if(floorBusy)return;if(f===floor){after?.();return;}if(!discard())return;dirty=false;floorBusy=true;$('fade').textContent=f===2?'🪜 Taking the stairs to Room 214–215…':'🪜 Back to the first floor…';$('fade').classList.add('on');
  setTimeout(()=>{floor=f;tween=null;walk=keyWalk=0;cam.z=goal.z=f===2?1.2:-1.4;cam.yaw=goal.yaw=0;cam.pitch=goal.pitch=0;if(selection&&(selection.type==='booth'?byId[selection.id]:roomById[selection.id]).floor!==f){selection=null;$('panel').classList.remove('open');}applyFloor();if(mapOpen){mapFloor=f;mapView=null;renderMap();}setTimeout(()=>{$('fade').classList.remove('on');floorBusy=false;after?.();},160);},400);
}
function goTo(type,id){const L=type==='booth'?byId[id]:roomById[id];changeFloor(L.floor,()=>{moveTo(L.z+3,Math.atan2(type==='booth'?-L.x:2.2,3),type==='booth'?-.12:0);});}
function step(dir){moveTo(goal.z+dir*(Math.cos(cam.yaw)>=0?-1:1)*4);}
function reset(){changeFloor(1,()=>moveTo(H.start,0,0));goal.fov=68;}
function updateNear(){const b=floors[floor];$('floorBtn').classList.toggle('show',floor===2||Math.abs(cam.z)<7);$('floorBtn').textContent=floor===2?'⬇ Back to 1st floor':'⬆ 2F · Room 214–215';let text=`📍 ${floor}F hallway`;const near=ROOMS.filter(r=>r.floor===floor).sort((a,b)=>Math.abs(a.z-cam.z)-Math.abs(b.z-cam.z))[0];if(near&&Math.abs(near.z-cam.z)<5)text=`📍 ${floor}F · ${near.name}${reservation(near.id).reservedFor?' 📌':''}`;else if(Math.abs(cam.z)<3)text=`📍 ${floor}F · Stairs ${floor===1?'↑':'↓'}`;else if(cam.z>3)text=`📍 ${floor}F · Start of hallway`;else if(cam.z<b.min+3)text=`📍 ${floor}F · End of hallway`;$('nearRoom').textContent=text;}
function pick(x,y){pointer.set(x/innerWidth*2-1,-y/innerHeight*2+1);raycaster.setFromCamera(pointer,camera);const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};const hits=raycaster.intersectObjects(targets.filter(o=>o.userData.floor===floor&&visible(o)),false);if(hits.length&&hits[0].distance<45)return hits[0].object.userData;const hit=raycaster.intersectObject(floorMeshes[floor],false)[0];return hit?{type:'floor',z:hit.point.z}:null;}
function tap(x,y){const hit=pick(x,y);if(!hit)return;if(hit.type==='booth'||hit.type==='room')select(hit.type,hit.id);if(hit.type==='stairs')changeFloor(hit.id);if(hit.type==='floor')moveTo(hit.z);if(hit.type==='cat'){const c=cats[hit.id];c.pet=performance.now();toast(`🐈 ${c.name} says purrr… 💛`);}}

/* ---------- Interactive SVG map ---------- */
const NS='http://www.w3.org/2000/svg';
function svg(tag,attrs,parent){const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);parent?.append(e);return e;}
function mapText(parent,x,y,text,size=1,fill='#4A3520'){const e=svg('text',{x,y,'font-size':size,'text-anchor':'middle','dominant-baseline':'central',fill},parent);e.textContent=text;return e;}
function mapBounds(){const b=floors[mapFloor];return{x:-10.8,y:-b.near-1.5,w:27,h:b.near-b.far+3};}
function setMapView(){if(!mapView)fitMap();$('mapSvg').setAttribute('viewBox',`${mapView.x} ${mapView.y} ${mapView.w} ${mapView.h}`);}
function fitMap(){const b=mapBounds(),r=$('mapSvg').getBoundingClientRect(),ar=r.width/Math.max(1,r.height);let w=b.w*1.04,h=b.h*1.04;if(w/h>ar)h=w/ar;else w=h*ar;mapView={x:b.x+(b.w-w)/2,y:b.y+(b.h-h)/2,w,h};}
function defaultMap(){const b=mapBounds(),r=$('mapSvg').getBoundingClientRect(),ar=r.width/Math.max(1,r.height);const h=Math.min(b.h*1.04,Math.max(28,27/ar)),w=h*ar;mapView={x:-2.2-w/2,y:-cam.z-h*.4,w,h};if(mapFloor!==floor)fitMap();setMapView();}
function renderMap(){
  const root=$('mapSvg');root.replaceChildren();const b=floors[mapFloor],len=b.near-b.far;
  svg('rect',{x:-10.8,y:-b.near-1.5,width:27,height:len+3,fill:'#55663F'},root);svg('rect',{x:-10.4,y:-b.near,width:8.2,height:len,fill:'#BFB08A'},root);svg('rect',{x:-2.2,y:-b.near,width:4.82,height:len,fill:'#F3EFE6'},root);svg('rect',{x:4.72,y:-b.near-1.5,width:2,height:len+3,fill:'#C4C0B5'},root);svg('rect',{x:6.87,y:-b.near-1.5,width:8,height:len+3,fill:'#4A4B4D'},root);svg('line',{x1:10.87,y1:-b.near,x2:10.87,y2:-b.far,stroke:'#E0C34A','stroke-width':.12,'stroke-dasharray':'3 5'},root);
  for(const r of ROOMS.filter(r=>r.floor===mapFloor)){
    const g=svg('g',{'data-type':'room','data-id':r.id},root);svg('rect',{x:-10.2,y:-r.z-3.8,width:8,height:7.6,fill:r.code.match(/^[0-9]/)?'#EBDCA8':'#D9CCEA',stroke:'#7A5B2A','stroke-width':.15},g);const words=r.name.split(' ');words.forEach((w,i)=>mapText(g,-6.2,-r.z+(i-(words.length-1)/2)*1.05,w,.9));
    const rd=reservation(r.id);if(rd.reservedFor){svg('rect',{x:-9.7,y:-r.z+2,width:7,height:1.35,fill:rd.paper},g);mapText(g,-6.2,-r.z+2.7,rd.reservedFor.slice(0,18),.55,'#1F2A44');}
  }
  for(const L of LAYOUT.filter(L=>L.floor===mapFloor)){
    const b=booth(L.id),g=svg('g',{'data-type':'booth','data-id':L.id},root),fill=b.color!==DEFAULT_COLOR?b.color:({available:'#FFFFFF',assigned:'#3BA55C',reserved:'#7EA0F0',maintenance:'#BDBDBD'})[b.status];svg('rect',{x:L.x-.39,y:-L.z-.81,width:.78,height:1.62,rx:.1,fill,stroke:selection?.id===L.id?'#E8C86A':'#756A54','stroke-width':selection?.id===L.id?.3:.1},g);svg('title',{},g).textContent=`${L.id} · ${b.org||labels[b.status]}`;
  }
  const sg=svg('g',{'data-type':'stairs','data-id':mapFloor===1?'2':'1'},root);svg('rect',{x:-7.9,y:-1.6,width:5.7,height:3.2,fill:'#E2D6B4',stroke:'#6F5A33','stroke-width':.15},sg);mapText(sg,-5,0,mapFloor===1?'STAIRS ↑ 2F':'STAIRS ↓ 1F',.7);
  if(mapFloor===1){mapText(root,0,82,'ENTRANCE →',.6,'#7A1F2B');for(const z of [-82,-132]){svg('rect',{x:-7.9,y:-z-1.6,width:5.7,height:3.2,fill:'#CFC8B8'},root);mapText(root,-5,-z,'STAIRS',.7);}}
  svg('g',{id:'mapPeople','pointer-events':'none'},root);$('mapF1').classList.toggle('on',mapFloor===1);$('mapF2').classList.toggle('on',mapFloor===2);$('mapDay').textContent=`Day ${day}`;
  setMapView();updateMapPeople();
}
function updateMapPeople(){
  const g=$('mapPeople');if(!g)return;g.replaceChildren();
  for(const c of cats.filter(c=>c.f===mapFloor))mapText(g,c.x,-c.z,'🐈',.9);
  if(mapFloor===floor){const y=-cam.z;svg('polygon',{points:`0,${y} ${-Math.sin(cam.yaw-.5)*5},${y-Math.cos(cam.yaw-.5)*5} ${-Math.sin(cam.yaw+.5)*5},${y-Math.cos(cam.yaw+.5)*5}`,fill:'rgba(232,200,106,.4)'},g);svg('circle',{cx:0,cy:y,r:.6,fill:'#E8C86A',stroke:'#7A1F2B','stroke-width':.2},g);if(mapFollow&&mapView&&mapView.h<mapBounds().h){mapView.y=y-mapView.h*.4;setMapView();}}
}
function toggleMap(on=!mapOpen){mapOpen=on;document.body.classList.toggle('map-open',on);$('mapBtn').classList.toggle('on',on);document.documentElement.style.setProperty('--dockH',on?`${$('mapDock').getBoundingClientRect().height}px`:'0px');if(on){mapFloor=floor;mapView=null;renderMap();defaultMap();}}
function zoomMap(factor){if(!mapView)return;const old=mapView.h,mapH=Math.max(8,Math.min(800,old*factor)),k=mapH/old;mapView={x:mapView.x+mapView.w*(1-k)/2,y:mapView.y+old*(1-k)/2,w:mapView.w*k,h:mapH};mapFollow=false;$('mapFollow').classList.remove('on');setMapView();}
function mapPoint(x,y){const p=$('mapSvg').createSVGPoint();p.x=x;p.y=y;return p.matrixTransform($('mapSvg').getScreenCTM().inverse());}

/* ---------- UI and input ---------- */
function bindUI(){
  for(const b of document.querySelectorAll('#days button'))b.onclick=()=>setDay(b.dataset.day);
  $('pClose').onclick=closePanel;$('pSignIn').onclick=openSignIn;$('lscBtn').onclick=openSignIn;$('lscGo').onclick=signIn;$('lscCancel').onclick=()=>$('lscWrap').classList.remove('open');$('lscPass').onkeydown=e=>{if(e.key==='Enter')signIn();};$('signOutBtn').onclick=()=>{signOut();};
  $('lscWrap').onclick=e=>{if(e.target===$('lscWrap'))$('lscWrap').classList.remove('open');};
  $('bpSave').onclick=saveBooth;$('rSave').onclick=saveRoom;
  $('bpClear').onclick=()=>{if(selection?.type==='booth'&&confirm('Clear this booth?'))mutate('PUT',`booths/${day}/${encodeURIComponent(selection.id)}`,{},'Booth cleared');};
  $('rClear').onclick=()=>{if(selection?.type==='room'&&confirm('Remove this room reservation?'))mutate('PUT',`rooms/${day}/${encodeURIComponent(selection.id)}`,{reservedFor:''},'Reservation removed');};
  for(const wrap of [$('boothEdit'),$('roomEdit')])wrap.addEventListener('input',()=>{dirty=true;});
  $('fColor').oninput=()=>{if(selection?.type==='booth')boothMeshes[selection.id].cloth.color.set($('fColor').value);};
  // Commit day titles on change (blur/Enter), not a cross-day debounce timer.
  $('dayTitle').onchange=()=>{if(isLSC){const title=$('dayTitle').value.trim();mutate('PUT',`days/${day}`,{title},'Day title saved');}};
  $('dayTitle').onkeydown=e=>{if(e.key==='Enter')e.target.blur();};
  $('resetDayBtn').onclick=()=>{if(confirm(`Clear all booth and room assignments for Day ${day}? The title is kept.`))mutate('DELETE',`days/${day}`,undefined,`Day ${day} cleared`);};
  $('exportBtn').onclick=()=>{if(!isLSC||busy||!demo&&mode!=='neon')return;const payload={...state,app:'mendoza-hall',exportedAt:new Date().toISOString()},url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='assignments.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Downloaded all 3 days. This organizer export includes private notes.');};
  $('importBtn').onclick=()=>{if(isLSC){$('importFile').value='';$('importFile').click();}};
  $('importFile').onchange=async()=>{const file=$('importFile').files[0];if(!file||!isLSC)return;if(file.size>100000){toast('Import is too large (maximum 100 KB).');return;}try{const n=cleanImport(JSON.parse(await file.text()));if(confirm('Replace ALL THREE DAYS? Download a backup first.'))await mutate('POST','import',{days:n.days},'Imported all 3 days');}catch(e){toast(`Invalid import: ${e.message}`);}};
  $('roomSelect').onchange=e=>{const [type,id]=e.target.value.split(':');e.target.value='';if(type==='room')goTo(type,id);if(type==='booth')select(type,id,true);};
  $('floorBtn').onclick=()=>changeFloor(floor===1?2:1);$('resetBtn').onclick=reset;$('zoomIn').onclick=()=>{goal.fov=Math.max(35,goal.fov-8);};$('zoomOut').onclick=()=>{goal.fov=Math.min(85,goal.fov+8);};
  $('fsBtn').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else toast('Fullscreen is not available in this browser.');}catch{toast('Fullscreen is not available here.');}};
  for(const [id,dir] of [['fwdBtn',1],['backBtn',-1]]){
    const b=$(id);let timer,holding=false;b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);holding=false;timer=setTimeout(()=>{holding=true;tween=null;walk=dir;},260);};
    const end=tap=>{clearTimeout(timer);if(holding)walk=0;else if(tap)step(dir);holding=false;};b.onpointerup=()=>end(true);b.onpointercancel=()=>end(false);b.onlostpointercapture=()=>{clearTimeout(timer);walk=0;};b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();step(dir);}};
  }
  let drag=null;const v=$('viewport');
  v.onpointerdown=e=>{if(drag)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,start:performance.now(),distance:0};v.setPointerCapture(e.pointerId);v.classList.add('dragging');};
  v.onpointermove=e=>{
    if(drag&&e.pointerId===drag.id){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.distance+=Math.abs(dx)+Math.abs(dy);drag.x=e.clientX;drag.y=e.clientY;goal.yaw+=dx*.0032;goal.pitch=Math.max(-1.25,Math.min(1.25,goal.pitch+dy*.0032));tween=null;}
    else if(!drag&&e.pointerType==='mouse'){const h=pick(e.clientX,e.clientY);v.classList.toggle('pointing',!!h&&h.type!=='floor');const tip=$('tip');tip.classList.toggle('show',!!h&&h.type!=='floor');if(h&&h.type!=='floor'){tip.textContent=h.type==='booth'?`${h.id} · ${booth(h.id).org||labels[booth(h.id).status]}`:h.type==='room'?roomById[h.id].name:h.type==='cat'?`${cats[h.id].name} — click to pet`:'Take the stairs';tip.style.left=`${Math.min(e.clientX,innerWidth-230)}px`;tip.style.top=`${e.clientY}px`;}}
  };
  v.onpointerup=e=>{if(!drag||e.pointerId!==drag.id)return;const d=drag;drag=null;v.classList.remove('dragging');if(d.distance<7&&performance.now()-d.start<600)tap(e.clientX,e.clientY);};v.onpointercancel=v.onlostpointercapture=()=>{drag=null;v.classList.remove('dragging');};v.onpointerleave=()=>$('tip').classList.remove('show');v.addEventListener('wheel',e=>{e.preventDefault();goal.fov=Math.max(35,Math.min(85,goal.fov+(e.deltaY>0?5:-5)));},{passive:false});
  $('mapBtn').onclick=()=>toggleMap();$('mapClose').onclick=()=>toggleMap(false);$('mapF1').onclick=()=>{mapFloor=1;mapView=null;renderMap();defaultMap();};$('mapF2').onclick=()=>{mapFloor=2;mapView=null;renderMap();defaultMap();};$('mapFit').onclick=()=>{mapFollow=false;$('mapFollow').classList.remove('on');fitMap();setMapView();};$('mapFollow').onclick=()=>{mapFollow=!mapFollow;$('mapFollow').classList.toggle('on',mapFollow);if(mapFollow)defaultMap();};$('mapZin').onclick=()=>zoomMap(1/1.4);$('mapZout').onclick=()=>zoomMap(1.4);
  const ms=$('mapSvg'),pointers=new Map();let mapDrag=null,pinch=0;
  const distance=()=>{const [a,b]=[...pointers.values()];return Math.hypot(a.x-b.x,a.y-b.y);};
  ms.onpointerdown=e=>{ms.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1)mapDrag={x:e.clientX,y:e.clientY,moved:0};else{pinch=distance();if(mapDrag)mapDrag.moved=100;}};
  ms.onpointermove=e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size>=2){const d=distance();if(pinch&&d)zoomMap(pinch/d);pinch=d;return;}if(!mapDrag)return;const dx=e.clientX-mapDrag.x,dy=e.clientY-mapDrag.y;mapDrag.x=e.clientX;mapDrag.y=e.clientY;mapDrag.moved+=Math.abs(dx)+Math.abs(dy);if(mapDrag.moved>5){const r=ms.getBoundingClientRect();mapView.x-=dx*mapView.w/r.width;mapView.y-=dy*mapView.h/r.height;mapFollow=false;$('mapFollow').classList.remove('on');setMapView();}};
  const mapEnd=(e,cancel=false)=>{const isTap=!cancel&&pointers.size===1&&mapDrag?.moved<=5;pointers.delete(e.pointerId);pinch=0;if(!pointers.size)mapDrag=null;if(isTap){const el=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-type]');if(el&&ms.contains(el)){const {type,id}=el.dataset;if(type==='stairs')changeFloor(Number(id));else select(type,id,true);}else{const p=mapPoint(e.clientX,e.clientY);if(p.x>-2.2&&p.x<2.62)changeFloor(mapFloor,()=>moveTo(-p.y));}}};
  ms.onpointerup=e=>mapEnd(e);ms.onpointercancel=e=>mapEnd(e,true);ms.addEventListener('wheel',e=>{e.preventDefault();zoomMap(e.deltaY>0?1.15:1/1.15);},{passive:false});
  function showIntro(){$('intro').classList.remove('opening','reading');$('intro').classList.add('show');}
  function openLetter(){if($('intro').classList.contains('opening'))return;$('intro').classList.add('opening');setTimeout(()=>$('intro').classList.add('reading'),720);}
  function closeIntro(){if($('introHide').checked)try{localStorage.setItem('mendoza_welcome_hidden','1');}catch{}$('intro').classList.remove('show');}
  $('envelope').onclick=openLetter;$('introGo').onclick=closeIntro;$('brandTitle').onclick=showIntro;$('intro').onclick=e=>{if(e.target===$('intro')&&$('intro').classList.contains('reading'))closeIntro();};
  addEventListener('keydown',e=>{
    if(e.key==='Escape'){if($('intro').classList.contains('show')){if($('intro').classList.contains('reading'))closeIntro();else openLetter();}else if($('lscWrap').classList.contains('open'))$('lscWrap').classList.remove('open');else if(selection)closePanel();else toggleMap(false);return;}
    if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||$('intro').classList.contains('show')||$('lscWrap').classList.contains('open'))return;
    const k=e.key.toLowerCase();if(['w','arrowup','s','arrowdown'].includes(k)){e.preventDefault();keyWalk=['w','arrowup'].includes(k)?1:-1;tween=null;}else if(['a','arrowleft'].includes(k))goal.yaw+=.25;else if(['d','arrowright'].includes(k))goal.yaw-=.25;else if(k==='m')toggleMap();else if(DAYS.includes(k))setDay(k);
  });
  addEventListener('keyup',e=>{if(['w','s','arrowup','arrowdown'].includes(e.key.toLowerCase()))keyWalk=0;});addEventListener('blur',()=>{walk=keyWalk=0;});
  addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}});
  addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);if(mapOpen){document.documentElement.style.setProperty('--dockH',`${$('mapDock').getBoundingClientRect().height}px`);defaultMap();}});
  document.addEventListener('visibilitychange',()=>{walk=keyWalk=0;if(document.visibilityState==='visible')pull(true);});
  try{if(localStorage.getItem('mendoza_welcome_hidden')!=='1')setTimeout(showIntro,700);}catch{setTimeout(showIntro,700);}
}
function confetti(){const c=$('confetti'),g=c.getContext('2d');c.width=innerWidth;c.height=innerHeight;const parts=Array.from({length:60},()=>({x:innerWidth/2,y:innerHeight/3,vx:(Math.random()-.5)*12,vy:-Math.random()*8-2,color:colors[Math.floor(Math.random()*colors.length)]}));let frames=0;function step(){g.clearRect(0,0,c.width,c.height);for(const p of parts){p.vy+=.23;p.x+=p.vx;p.y+=p.vy;g.fillStyle=p.color;g.fillRect(p.x,p.y,6,4);}if(++frames<130)requestAnimationFrame(step);else g.clearRect(0,0,c.width,c.height);}step();}
function animate(now){
  requestAnimationFrame(animate);const dt=Math.min(.05,(now-last)/1000);last=now;if(document.hidden)return;
  if(tween){const p=Math.min(1,(now-tween.start)/tween.duration),e=p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;for(const key of ['z','yaw','pitch'])cam[key]=goal[key]=tween.from[key]+(tween.to[key]-tween.from[key])*e;if(p===1)tween=null;}
  else{if(!floorBusy){const dir=walk||keyWalk;if(dir)goal.z=clamp(goal.z+dir*(Math.cos(cam.yaw)>=0?-1:1)*4.2*dt);}for(const key of ['z','yaw','pitch'])cam[key]+=(goal[key]-cam[key])*.16;}
  cam.fov+=(goal.fov-cam.fov)*.18;camera.fov=cam.fov;camera.updateProjectionMatrix();camera.position.set(0,floors[floor].y+H.eye+((walk||keyWalk)?Math.sin(now*.007)*.02:0),cam.z);camera.rotation.set(cam.pitch,cam.yaw,0,'YXZ');
  for(const c of cats){
    if(c.f!==floor)continue;if(now>c.next){c.target=Math.max(floors[c.f].min,Math.min(floors[c.f].max,c.z+(Math.random()-.5)*12));c.next=now+4000+Math.random()*7000;}
    const dz=c.target-c.z,moving=Math.abs(dz)>.05;c.z+=Math.sign(dz)*Math.min(Math.abs(dz),dt*.4);const desired=Math.abs(c.z-cam.z)<1.6?(c.x<0?-.82:.82):Math.sin(now*.0003+c.phase)*.55;c.x+=(desired-c.x)*dt*2;const heading=dz>0?0:Math.PI;c.heading+=(heading-c.heading)*dt*3;c.g.rotation.y=c.heading;const hop=now-c.pet<500?Math.sin((now-c.pet)/500*Math.PI)*.18:0;c.g.position.set(c.x,floors[c.f].y+hop,c.z);c.legs.forEach((l,i)=>l.rotation.x=moving?Math.sin(now*.009+(i%2)*Math.PI)*.45:0);c.tail.rotation.z=Math.sin(now*.003+c.phase)*.3;
  }
  if(selection?.type==='booth')boothMeshes[selection.id].ring.material.opacity=.65+.25*Math.sin(now*.006);
  updateNear();if(mapOpen&&Math.floor(now/80)!==Math.floor((now-dt*1000)/80))updateMapPeople();renderer.render(scene,camera);
}
async function connect(){
  try{const config=await api('GET','config');demo=config.demo===true;}catch{/* Missing API is an error, never permission to enter demo mode. */}
  if(demo){mode='local';try{const raw=JSON.parse(localStorage.getItem(DEMO));if(raw){state=publicState(cleanImport(raw));state.revision=0;}}catch{}refresh(true);showMode();return;}
  await pull(true);
  // Retry initial failures as well as subsequent disconnections; back off to one minute.
  const schedule=()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(async()=>{if(document.visibilityState==='visible')await pull();schedule();},failures?Math.min(60000,5000*2**Math.min(failures,4)):15000);};schedule();
}
try{
  loadCache();try{const d=localStorage.getItem('mendoza_day');if(DAYS.includes(d))day=d;}catch{}
  buildScene();bindUI();refresh(true);showMode();$('loader').classList.add('hide');requestAnimationFrame(animate);connect();
}catch(error){$('loader').replaceChildren();const p=document.createElement('p');p.style.cssText='max-width:480px;padding:24px;line-height:1.6;text-transform:none;letter-spacing:normal';p.textContent='The hallway could not start. Enable WebGL/hardware acceleration, then reload in a current browser.';$('loader').append(p);console.error('Hallway initialization failed',error);}
})();
