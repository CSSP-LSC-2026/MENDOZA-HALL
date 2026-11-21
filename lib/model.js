export const ROOMS = [
  {id:'214–215',code:'214–215',name:'Room 214–215',z:-7,floor:2},
  ...[['102',-14],['103',-22],['105',-30],['106',-38],['dean',-46],['philo',-54],['socsci',-62],['psych',-70],['110',-90],['111',-98],['112',-106],['113',-114],['114',-122]].map(([id,z])=>({id,code:id.toUpperCase(),name:({dean:'Dean’s Office',philo:'Philosophy Department',socsci:'Social Sciences Department',psych:'Psychology Department'})[id]||`Room ${id}`,z,floor:1}))
];
export const DAYS = ['1','2','3'];
export const STATUSES = ['available','assigned','reserved','maintenance'];
export const DEFAULT_COLOR = '#F8FAFC';
export const PAPER_COLORS = ['#FFE680','#FFB8C6','#BDEBC8','#BFDDFF','#FFFFFF'];
export const LAYOUT = ROOMS.flatMap(r=>['R','G'].map(side=>({id:`${r.code}-${side}1`,room:r.id,floor:r.floor,x:side==='R'?-1.32:1.32,z:r.z-0.9,side:side==='R'?'room':'grill'})));
export const blankState = ()=>({version:3,revision:0,updatedAt:0,days:Object.fromEntries(DAYS.map(d=>[d,{title:'',booths:{},rooms:{}}]))});
export function text(v,max){
  if(v===undefined) return '';
  if(typeof v!=='string'||v.length>max||/[\u0000-\u001f]/.test(v)) throw new Error(`Text must be at most ${max} characters, without control characters`);
  return v.trim();
}
export function color(v,defaultValue){
  if(v===undefined) return defaultValue;
  if(typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v)) throw new Error('Invalid color');
  return v.toUpperCase();
}
export function object(v){if(!v||typeof v!=='object'||Array.isArray(v)) throw new Error('Expected an object');return v;}
export function cleanBooth(raw){
  const b=object(raw), status=b.status??'available';
  if(!STATUSES.includes(status)) throw new Error('Invalid booth status');
  const out={org:text(b.org,60),rep:text(b.rep,60),description:text(b.description,90),notes:text(b.notes,300),color:color(b.color,DEFAULT_COLOR),status};
  if(out.org&&out.status==='available') out.status='assigned';
  if(!out.org&&out.status==='assigned') out.status='available';
  return out;
}
export const boothEmpty = b=>!b.org&&!b.rep&&!b.description&&!b.notes&&b.color===DEFAULT_COLOR&&b.status==='available';
export function cleanRoom(raw){const r=object(raw);return {reservedFor:text(r.reservedFor,48),note:text(r.note,60),paper:color(r.paper,PAPER_COLORS[0])};}
export function validateDay(d){if(!DAYS.includes(d)) throw new Error('Invalid event day');return d;}
export function validateId(type,id){if(!(type==='booths'?LAYOUT:ROOMS).some(x=>x.id===id)) throw new Error('Unknown booth or room');return id;}
export function cleanImport(raw){
  const src=object(object(raw).days), out=blankState();
  if(Object.keys(src).some(d=>!DAYS.includes(d))||DAYS.some(d=>!Object.hasOwn(src,d))) throw new Error('Import must include exactly days 1, 2 and 3');
  for(const d of DAYS){
    const day=object(src[d]);out.days[d].title=text(day.title,48);
    for(const [id,b] of Object.entries(object(day.booths))){validateId('booths',id);const c=cleanBooth(b);if(!boothEmpty(c)) out.days[d].booths[id]=c;}
    for(const [id,r] of Object.entries(object(day.rooms))){validateId('rooms',id);const c=cleanRoom(r);if(c.reservedFor) out.days[d].rooms[id]=c;}
  }
  return out;
}
export function publicState(raw){
  const out=structuredClone(raw);
  for(const d of DAYS) for(const b of Object.values(out.days[d].booths)) delete b.notes;
  return out;
}
