function runWeaponAuditChecks() {
  const passed = [], ok = (v, why) => { if (!v) throw Error(why); }, check = (name, f) => { f(); passed.push(name); };
  const reset = () => { bodies=[];det=[];shots.length=0;remotes.clear();keys.clear();me.x=100;me.y=500;me.a=0;me.vx=me.vy=0;me.inv=0;me.shield=0;me.dead=false;me.lives=20;me.lv=1;me.ampUntil=0;fireCd=0;baseArsenal(); };
  const now = performance.now();reset();
  check('last ammo retains commands, blocks primary and removes slot after expiry', () => {
    for (const k of ['gamma','mine','saw']) {
      reset();me.weapon=k;me.arsenal[k]=1;shoot(now,false);
      ok(me.arsenal[k]===0&&me.weapon===k&&owned().includes(k),'last '+k);
      const n=shots.length;shoot(now+10,false);ok(shots.length===n,'empty primary '+k);
      const projectile=shots.find(s=>s.kind===controlledKind(k));if(k==='mine')projectile.life-=MINE_ARM+0.01;shoot(now+2000,true);
      ok(shots.length>n||projectile.returning,'command '+k);
      for(const s of shots)s.life=0;reconcileWeapons(now);ok(!owned().includes(k),'expired slot '+k);
    }
  });
  check('station wall protects against splash, shock combo, demonic zap and electric chain', () => {
    reset();me.x=220;
    bodies=[{fixed:true,x:160,y:500,hw:20,hh:120,r:122}];
    const s={id:'test.blst',kind:K.ROCKET,x:100,y:500,m:1,mine:false,owner:'enemy',life:1};
    splash({...s},now);ok(me.lives===20,'splash through wall');
    gammaZap({...s,kind:K.GAMMA},0.3,now);ok(me.lives===20,'zap through wall');
    comboBlast({...s}, {...s,kind:K.SHOCK},now);ok(me.lives===20,'combo through wall');
    boltChain({...s,kind:K.BOLT},100,500,'other',now);ok(me.lives===20,'chain through wall');
    for(const kind of [K.NUKE,K.HOLY]) {detonate({...s,kind},now);ok(me.lives===20,'superweapon through wall');}
    const vx=me.vx;waveTick(0.5);ok(me.vx===vx,'blast wave through wall');waves.length=0;
    bodies=[];splash({...s},now);ok(me.lives<20,'open splash must hurt');
  });
  check('fixed keys work with sparse inventory and Test range; refusal explains cost', () => {
    reset();me.arsenal.rail=3;me.arsenal.gamma=1;
    dispatchEvent(new KeyboardEvent('keydown',{code:'Digit9'}));ok(me.weapon==='rail','fixed rail key');
    dispatchEvent(new KeyboardEvent('keydown',{code:'Digit4',altKey:true}));ok(me.weapon==='gamma','fixed extended key');
    me.weapon='rocket';me.arsenal.rocket=2;rejectAt=-Infinity;shoot(now,true);
    ok(floaters.at(-1).txt==='NEED 3 AMMO','alt reason');ok(me.arsenal.rocket===2,'rejected alt is free');
    keys.clear();
  });
  check('laser assist rejects cover; Laser does not chain beyond its first victim', () => {
    reset();remotes.set('target',{x:650,y:500,lv:1});ok(boltLock(me)===0,'visible lock');
    bodies=[{fixed:true,x:400,y:500,hw:20,hh:120}];ok(boltLock(me)===undefined,'covered lock');
    bodies=[];me.x=700;const before=me.lives;boltChain({id:'test.laser',kind:K.LASER,owner:'enemy'},650,500,'target',now);ok(me.lives===before,'laser chain removed');
  });
  check('Spike pierces two bins; Slug reaches beyond close scatter; Flak and Volley are area attacks', () => {
    reset();remotes.set('a',{x:500,y:500,lv:1});remotes.set('b',{x:800,y:500,lv:1});
    me.weapon='nail';me.arsenal.nail=10;shoot(now,true);const s=shots.at(-1);
    ok(me.arsenal.nail===8,'two ammo per spike');s.px=100;s.py=500;s.x=1000;s.y=500;ok(pierces(s)&&targetHit(s,remotes.get('a'))&&targetHit(s,remotes.get('b')),'spike piercing');
    ok(WEAPONS.scatter.alt.shot[1]*SHOTS[K.SLUG].life>WEAPONS.scatter.shot[1]*SHOTS[K.PELLET].life,'slug range');
    reset();me.weapon='shard';me.arsenal.shard=10;shoot(now,true);const shell=shots.at(-1);flakBurst(shell);
    ok(shots.filter(s=>s.kind===K.SHARD).length===8&&me.arsenal.shard===8,'radial flak');
    reset();me.weapon='gren';me.arsenal.gren=10;shoot(now,true);ok(shots.filter(s=>s.kind===K.GREN).length===3&&me.arsenal.gren===7,'grenade volley');
  });
  check('lunge has a cooldown, is facing-bound and cannot be repeated by holding alt', () => {
    reset();me.weapon='gauntlet';lungeReady=0;shoot(now,true);const vx=me.vx;shoot(now+100,true);
    ok(me.vx===vx&&vx===950&&lungeReady===now+1200,'lunge cooldown');
    ok(me.inv===now+200,'lunge immunity is shorter than dash');
    lungeReady=0;
  });
  check('local measurements retain shot identity after weapon switch and count real damage', () => {
    reset();me.weapon='nail';me.arsenal.nail=10;shoot(now,false);const s=shots.at(-1),row=metricForShot(s.id);
    ok(row?.weapon==='nail'&&row.fireMode==='primary','child shot attribution');
    me.weapon='fire';const before=row.damageValidated;metricDamage(s.id,0.13,false);ok(Math.abs(row.damageValidated-before-0.13)<1e-6,'damage attribution');
    const hits=row.peerHits;metricPeer(s.id,'test',false);metricPeer(s.id,'test',false);ok(row.peerHits===hits+1,'confirmation dedupe');
  });
  reset();renderWeapon();return passed;
}

async function checkContinuousAudio() {
  const now=performance.now(), ok=(v,msg)=>{if(!v)throw Error(msg);};
  for(const id of firingSounds.keys())stopContinuous(id);
  const original=audio.createBufferSource, started=[];
  audio.createBufferSource=function(){const s=original.call(audio),start=s.start.bind(s);s.start=(...a)=>{started.push(s.buffer);return start(...a);};return s;};
  try {
    const oldWeapon=me.weapon;me.weapon='minigun';
    for(let i=0;i<20;i++)continuousFire('me','minigun',me.x,me.y,now+i*45);
    ok(started.filter(b=>b===packBuf.p_loop_minigun[0]).length===1,'one minigun loop, not twenty overlapping bursts');
    stopContinuous('me');ok(!packLoops['fire:me'],'minigun stop');me.weapon=oldWeapon;
    for(const id of ['laserA','laserB']) {remotes.set(id,{x:me.x+100,y:me.y,weapon:'laser'});shotSound(K.LASER,me.x+100,me.y,id);}
    ok(firingSounds.has('laserA')&&firingSounds.has('laserB'),'independent remote laser starts');
    continuousAudioTick(now+2000);ok(!firingSounds.size,'stale remote beams stop');
    const saved=sfxVoices;sfxVoices=29;const count=started.length;sfx('hit',1);sfx('p_kill',0.5);sfx('p_warning',0.5);sfxVoices=saved;
    ok(started.length===count+3,'damage, kill and warning survive weapon voice exhaustion');
    return ['one loop per minigun', 'independent remote lasers and timeout', 'reserved damage/kill/warning voices'];
  } finally {audio.createBufferSource=original;remotes.delete('laserA');remotes.delete('laserB');for(const id of firingSounds.keys())stopContinuous(id);}
}
