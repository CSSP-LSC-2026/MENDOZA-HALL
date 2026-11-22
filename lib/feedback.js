// Gentle, generated UI tones: no downloads, microphone access, or autoplay.
export function bindFeedback({doc=document,reducedMotion=false}={}){
  const win=doc.defaultView,button=doc.getElementById('soundBtn');let context,enabled=false,muted=false,lastSound=-Infinity;
  try{muted=win.localStorage.getItem('mendoza_sound')==='off';}catch{}
  const reflect=()=>{button.setAttribute('aria-pressed',String(enabled));button.setAttribute('aria-label',enabled?'Mute button sounds':'Turn button sounds on');button.title=enabled?'Button sounds on — tap to mute':'Turn button sounds on';button.classList.toggle('on',enabled);doc.body.dataset.sound=enabled?'on':'off';};
  function setEnabled(on){
    enabled=on;
    if(on){try{const Audio=win.AudioContext||win.webkitAudioContext;if(!Audio)throw new Error('Audio unavailable');context??=new Audio();context.resume().catch(()=>{enabled=false;reflect();});}catch{enabled=false;}}
    reflect();return enabled;
  }
  function sound(welcome=false){
    if(!enabled||!context||doc.hidden)return;const now=context.currentTime;if(now-lastSound<.05)return;lastSound=now;
    try{for(const [i,f] of (welcome?[523.25,659.25,783.99]:[660,880]).entries()){
      const at=now+i*(welcome?.09:.028),osc=context.createOscillator(),gain=context.createGain();osc.type='sine';osc.frequency.setValueAtTime(f,at);
      gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(welcome?.035:.02,at+.008);gain.gain.exponentialRampToValueAtTime(.0001,at+(welcome?.22:.085));
      osc.connect(gain);gain.connect(context.destination);osc.start(at);osc.stop(at+.28);osc.onended=()=>{osc.disconnect();gain.disconnect();};
    }}catch{/* Optional feedback must never interrupt navigation or saves. */}
  }
  function effect(x,y){
    if(reducedMotion)return;const layer=doc.getElementById('tapEffects');while(layer.children.length>=6)layer.firstElementChild.remove();
    const el=doc.createElement('span');el.className='tapBloom';el.style.left=`${x}px`;el.style.top=`${y}px`;el.innerHTML='<i></i><i></i><i></i><i></i>';layer.append(el);el.addEventListener('animationend',()=>el.remove(),{once:true});win.setTimeout(()=>el.remove(),700);
  }
  button.onclick=()=>{muted=enabled;if(setEnabled(!enabled))sound(true);try{win.localStorage.setItem('mendoza_sound',muted?'off':'on');}catch{}};
  // Start only from a deliberate user gesture, including when the letter is skipped.
  doc.getElementById('introGo').addEventListener('click',()=>{if(!muted&&setEnabled(true))sound(true);});
  const starts=new Map();doc.addEventListener('pointerdown',e=>starts.set(e.pointerId,{x:e.clientX,y:e.clientY,time:win.performance.now()}),true);
  doc.addEventListener('pointermove',e=>{const s=starts.get(e.pointerId);if(s&&Math.hypot(s.x-e.clientX,s.y-e.clientY)>8)starts.delete(e.pointerId);},true);
  doc.addEventListener('pointercancel',e=>starts.delete(e.pointerId),true);
  doc.addEventListener('pointerup',e=>{const s=starts.get(e.pointerId);starts.delete(e.pointerId);if(!s||win.performance.now()-s.time>650)return;
    const control=e.target.closest('button,#viewport');if(!control||control.disabled)return;effect(e.clientX,e.clientY);if(control.id!=='introGo'&&control.id!=='soundBtn')sound();
  },true);
  doc.addEventListener('click',e=>{const b=e.target.closest('button');if(e.detail!==0||!b||b.disabled)return;const r=b.getBoundingClientRect();effect(r.x+r.width/2,r.y+r.height/2);if(!['introGo','soundBtn'].includes(b.id))sound();});
  win.addEventListener('blur',()=>starts.clear());reflect();
}
