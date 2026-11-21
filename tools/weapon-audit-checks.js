function runWeaponAuditChecks() {
  const passed = [], ok = (v, why) => { if (!v) throw Error(why); }, check = (name, f) => { f(); passed.push(name); };
  const reset = () => { bodies=[];det=[];shots.length=0;remotes.clear();keys.clear();me.x=100;me.y=500;me.a=0;me.vx=me.vy=0;me.inv=0;clearArmor(me);me.dead=false;me.lives=20;me.lv=1;me.ampUntil=0;fireCd=0;baseArsenal(); };
  const now = performance.now();reset();
  check('UT rocket loading: the press loads one, full goes by itself, release fires what is loaded; cancels spend nothing', () => {
    for (const ammo of [1,2,5]) {
      reset();cancelRocketLoad();me.weapon='rocket';me.arsenal.rocket=ammo;
      const full=Math.min(3,ammo);
      rocketLoadTick(.016,now,true,true);
      if(full===1){ok(shots.length===1&&(me.arsenal.rocket||0)===0&&rocketLoad===0,'one rocket carried: the press fires it');continue;}
      ok(rocketLoad===1&&shots.length===0&&me.arsenal.rocket===ammo,'the press loads the first rocket, spending nothing');
      for(let k=0;k<full-1;k++)rocketLoadTick(ROCKET_LOAD,now+(k+1)*700,true,true);
      ok(shots.length===full&&shots.every(s=>s.kind===K.ROCKET)&&rocketLoad===0,'full: the salvo goes by itself');
      ok((me.arsenal.rocket||0)===ammo-full,'exact cost');
      const before=shots.length;rocketLoadTick(0,now+3000,false,true);ok(shots.length===before,'letting go after the salvo fires nothing more');
    }
    reset();cancelRocketLoad();me.weapon='rocket';me.arsenal.rocket=5;
    rocketLoadTick(.016,now,true,true);rocketLoadTick(ROCKET_LOAD,now+700,true,true);ok(rocketLoad===2&&shots.length===0,'two loaded');
    rocketLoadTick(0,now+710,false,true);ok(shots.length===2&&me.arsenal.rocket===3&&rocketLoad===0,'release fires the two loaded');
    reset();cancelRocketLoad();me.weapon='rocket';me.arsenal.rocket=5;rocketLoadTick(.016,now,true,true);
    selectWeapon('fire');rocketLoadTick(0,now+1,false,true);ok(shots.length===0&&me.arsenal.rocket===5&&rocketLoad===0,'switch cancels');
    me.weapon='rocket';rocketLoadTick(.016,now,true,true);rocketLoadTick(0,now,false,false);ok(rocketLoad===0&&shots.length===0,'death/round end cancels');
  });
  check('Enforcer is hitscan; Ripper has explosive alternate discs; Flak has a broad ricochet fan', () => {
    reset();shoot(now,false);const pistol=shots.at(-1);ok(pistol.kind===K.PISTOL,'pistol replaces fireball');
    bodies=[{fixed:true,x:600,y:pistol.y,hw:20,hh:200,r:201}];updateShots(.016,now+16);
    ok(pistol.traced&&pistol.x<=580.01,'instant pistol respects cover');
    ok(WEAPONS.fire.alt.cd<WEAPONS.fire.cd&&WEAPONS.fire.alt.jitter>WEAPONS.fire.jitter,'pistol alt trades precision for rate');
    reset();me.weapon='saw';me.arsenal.saw=2;shoot(now,false);const swing=shots.at(-1);
    ok(swing&&swing.kind===K.SWORD&&SHOTS[K.SWORD].pierce&&SHOTS[K.SWORD].life>=0.3,'the Blood Blade swings its blade through an arc');
    ok(me.arsenal.saw===1,'one swing a charge');
    reset();me.weapon='shard';me.arsenal.shard=3;shoot(now,false);
    ok(shots.length===8&&shots.every(s=>s.kind===K.SHARD),'eight flak fragments');
    const s=shots[0],damage=shotDmg(s);s.bn=1;ok(shotDmg(s)<damage,'ricochets lose energy');
    shoot(now,true);const shell=shots.at(-1);shell.life=SHOTS[K.FLAK].life/2;
    ok(flakHeight(shell)>40,'visible ballistic loft');
    ok(WEAPONS.minigun.alt.cd>WEAPONS.minigun.cd&&SHOTS[K.BULLET_ALT].dmg>SHOTS[K.BULLET].dmg,'two minigun modes');
    reset();me.weapon='laser';me.arsenal.laser=20;shoot(now,false);
    ok(shots.at(-1).kind===K.PULSE_BOLT&&!HITSCAN[K.PULSE_BOLT],'Pulse primary is moving plasma');
    shoot(now,true);ok(shots.at(-1).kind===K.NOVA&&SPLASH[K.NOVA]&&shots.at(-1).m<0.6,'Pulse alternate throws a Plasma Nova, weaker uncharged');
    ok(me.arsenal.laser===14,'one ammo per pulse, five for a nova');
  });
  check('last ammo retains commands, blocks primary and removes slot after expiry', () => {
    for (const k of ['gamma','mine']) {
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
    dispatchEvent(new KeyboardEvent('keydown',{code:'Digit3',altKey:true}));ok(me.weapon==='gamma','fixed extended key');
    me.weapon='gren';me.arsenal.gren=2;rejectAt=-Infinity;shoot(now,true);
    ok(floaters.at(-1).txt==='NEED 3 AMMO','alt reason');ok(me.arsenal.gren===2,'rejected alt is free');
    keys.clear();
  });
  check('laser assist rejects cover; Laser does not chain beyond its first victim', () => {
    reset();remotes.set('target',{x:650,y:500,lv:1});ok(boltLock(me)===0,'visible lock');
    bodies=[{fixed:true,x:400,y:500,hw:20,hh:120}];ok(boltLock(me)===undefined,'covered lock');
    bodies=[];me.x=700;const before=me.lives;boltChain({id:'test.laser',kind:K.LASER,owner:'enemy'},650,500,'target',now);ok(me.lives===before,'laser chain removed');
  });
  check('Nailgun is retired; Flak and grenade alternate fire remain area attacks', () => {
    reset();me.arsenal.nail=10;ok(!hasWeapon('nail')&&!SANDBOX_GUNS.includes('nail'),'retired nailgun');
    reset();me.weapon='shard';me.arsenal.shard=10;shoot(now,true);const shell=shots.at(-1);flakBurst(shell);
    ok(shots.filter(s=>s.kind===K.SHARD).length===5&&me.arsenal.shard===9,'radial flak');
    reset();me.weapon='gren';me.arsenal.gren=10;shoot(now,true);ok(shots.filter(s=>s.kind===K.GREN).length===3&&me.arsenal.gren===7,'grenade volley');
  });
  check('lunge has a cooldown, is facing-bound and cannot be repeated by holding alt', () => {
    reset();me.weapon='gauntlet';lungeReady=0;shoot(now,true);const vx=me.vx;shoot(now+100,true);
    ok(me.vx===vx&&vx===950&&lungeReady===now+1200,'lunge cooldown');
    ok(me.inv===now+200,'lunge immunity is shorter than dash');
    lungeReady=0;
  });
  check('local measurements retain shot identity after weapon switch and count real damage', () => {
    reset();me.weapon='shard';me.arsenal.shard=10;shoot(now,false);const s=shots.at(-1),row=metricForShot(s.id);
    ok(row?.weapon==='shard'&&row.fireMode==='primary','child shot attribution');
    me.weapon='fire';const before=row.damageValidated;metricDamage(s.id,0.13,false);ok(Math.abs(row.damageValidated-before-0.13)<1e-6,'damage attribution');
    const hits=row.peerHits;metricPeer(s.id,'test',false);metricPeer(s.id,'test',false);ok(row.peerHits===hits+1,'confirmation dedupe');
  });
  check('expired Flak shell releases living fragments that travel and damage a target', () => {
    reset();me.x=50;me.y=50;me.weapon='shard';me.arsenal.shard=2;shoot(now,true);
    const shell=shots.at(-1);Object.assign(shell,{x:1000,y:1000,px:1000,py:1000,life:.001,expireAfterStep:true});
    updateShots(.016,now+16);
    const fragments=shots.filter(s=>s.kind===K.SHARD);ok(fragments.length===5,'five fragments on expiry');
    const fragment=fragments[0],startX=fragment.x;
    me.x=fragment.x+Math.cos(.2)*180;me.y=fragment.y+Math.sin(.2)*180;me.lives=3;me.inv=0;
    fragment.mine=false;fragment.owner='flak-enemy';
    updateShots(.05,now+66);ok(fragment.x>startX&&fragment.life>0,'fragment survives and travels');
    updateShots(.05,now+116);ok(me.lives<3,'fragment actually hurts a victim');
  });
  check('Shock ball never brakes in open space; Stinger primary is instant and alt is a projectile', () => {
    reset();me.x=100;me.y=100;me.weapon='orb';me.arsenal.orb=2;shoot(now,false);
    const orb=shots.at(-1),v=Math.hypot(orb.vx,orb.vy);orb.life=SHOTS[K.ORB].life-1.2;
    updateShots(.05,now+50);ok(Math.abs(Math.hypot(orb.vx,orb.vy)-v)<.001,'no late braking');
    reset();me.weapon='minigun';me.arsenal.minigun=10;shoot(now,false);const bullet=shots.at(-1);updateShots(.016,now+16);
    ok(bullet.traced,'primary hitscan');shoot(now,true);const heavy=shots.at(-1);updateShots(.016,now+32);
    ok(heavy.kind===K.BULLET_ALT&&!heavy.traced&&heavy.life>0,'heavy travelling alternate');
  });
  check('fixed health and layered armor work through real hurt, and XP never grants combat perks', () => {
    reset();me.lives=3;applySupply(me,'mega');hurt(now,3);ok(me.lives===3&&me.shield===1.5,'belt absorbs all');
    hurt(now+10,3);ok(me.lives===1.5&&me.shield===0,'belt overflow reaches health');
    clearArmor(me);applySupply(me,'shield');me.lives=3;hurt(now+20,1.2);ok(Math.abs(me.lives-2.7)<.001,'body armor leaks 25 percent');
    applySupply(me,'bigmed');ok(me.lives>3&&hpPct(me)>100,'super health displayed');
    gainXp(10000,now);ok(me.lv===1&&maxLivesOf(me.lv)===3,'no leveling');
  });
  check('a kill shows one notice in the middle (the latest) and a line each in the feed; repeats change nothing', () => {
    reset();killNotices.length=0;const id=myTag+'.notice'+now;
    reportKill(id,'Alpha','alpha');reportKill(id,'Beta','beta');reportKill(id,'Alpha','alpha');
    ok(killNotices.length===1,'one line in the middle: the latest kill');
    ok(killNoticeEl.textContent.includes('Beta')&&!killNoticeEl.textContent.includes('Alpha'),'the newest victim shown; a repeated report changes nothing');
    ok(feedEl.children.length>=2,'both kills in the feed on the right');
    killNotices.length=0;renderKillNotices();
  });
  check('minigun rounds are short travelling visuals clipped to the hit; scatter pellets really fly, in a loose cloud', () => {
    reset();beams.length=0;me.weapon='minigun';me.arsenal.minigun=20;
    bodies=[{fixed:true,x:450,y:500,hw:20,hh:200,r:201}];shoot(now,false);updateShots(.016,now+16);
    const visible=beams.filter(b=>b.round!==undefined);
    ok(visible.length===1,'one visible round');
    ok(visible.every(b=>!b.pistol&&b.x2<=434&&b.duration<=.45),'short-lived visual stops at cover');
    reset();beams.length=0;me.weapon='scatter';me.arsenal.scatter=20;bodies=[];shoot(now,false);updateShots(.016,now+16);
    const pellets=shots.filter(s=>s.kind===K.PELLET);
    ok(pellets.length===11&&pellets.every(p=>!p.traced&&p.life>0),'eleven pellets in flight, not a hitscan line');
    ok(!beams.some(b=>b.round===K.PELLET),'no instant tracer');
    const speeds=new Set(pellets.map(p=>Math.round(Math.hypot(p.vx,p.vy)/20))),gaps=pellets.map(p=>Math.atan2(p.vy,p.vx)).sort((a,b)=>a-b).slice(1).map((a,i,arr)=>a-(i?arr[i-1]:a));
    ok(speeds.size>=6,'pellets at different speeds');
    ok(new Set(gaps.slice(1).map(g=>Math.round(g*100))).size>=4,'uneven spread, not a fan');
  });
  check('Demonic has one controllable orb, a visible bounded zone, and a last-ammo remote blast', () => {
    reset();me.weapon='gamma';me.arsenal.gamma=2;shoot(now,false);
    const orb=shots.find(s=>s.kind===K.GAMMA),n=shots.length;shoot(now+2000,false);
    ok(shots.length===n&&me.arsenal.gamma===1,'second orb refused without spending ammo');
    ok(GAMMA_ZAP.r===280&&Math.hypot(orb.vx,orb.vy)===340,'slow bounded control zone');
    me.arsenal.gamma=0;shoot(now+2100,true);updateShots(.016,now+2116);
    ok(!shots.some(s=>s.kind===K.GAMMA&&s.life>0),'last-ammo manual explosion');
  });
  reset();renderWeapon();return passed;
}

async function checkContinuousAudio() {
  const now=performance.now(), ok=(v,msg)=>{if(!v)throw Error(msg);};
  for(const id of firingSounds.keys())stopContinuous(id);
  for (const v of [...priorityActive]) v.src.stop();
  await new Promise(resolve => setTimeout(resolve, 30));
  const original=audio.createBufferSource, started=[];
  audio.createBufferSource=function(){const s=original.call(audio),start=s.start.bind(s);s.start=(...a)=>{started.push(s.buffer);return start(...a);};return s;};
  try {
    const oldWeapon=me.weapon;me.weapon='minigun';
    for(let i=0;i<20;i++)continuousFire('me','minigun',me.x,me.y,now+i*45);
    ok(started.filter(b=>packBuf.p_ut_mini_fire.includes(b)).length===1,'one authored UT loop per shooter');
    ok(!started.includes(packBuf.p_loop_minigun[0]),'no buzzing minigun loop');
    continuousFire('me','minigun',me.x,me.y,now+1000,true);ok(started.includes(packBuf.p_ut_mini_alt[0]),'alternate minigun sound');
    stopContinuous('me');ok(started.includes(packBuf.p_ut_mini_stop[0]),'minigun winddown');ok(!packLoops['fire:me'],'minigun stop');me.weapon=oldWeapon;
    for(const id of ['laserA','laserB']) {remotes.set(id,{x:me.x+100,y:me.y,weapon:'laser'});shotSound(K.LASER,me.x+100,me.y,id);}
    ok(firingSounds.has('laserA')&&firingSounds.has('laserB'),'independent remote laser starts');
    ok(packLoops['fire:laserA'].src.buffer===packBuf.p_ut_pulse_bolt[0],'remote Pulse beam uses supplied loop');
    continuousAudioTick(now+2000);ok(!firingSounds.size,'stale remote beams stop');
    const saved=sfxVoices;sfxVoices=29;const count=started.length;sfx('hit',1);sfx('p_kill',0.5);sfx('p_warning',0.5);sfxVoices=saved;
    ok([sfxBuf.hit,packBuf.p_kill[0],packBuf.p_warning[0]].every(b=>b&&started.slice(count).includes(b)),'damage, kill and warning survive weapon voice exhaustion');
    return ['authored UT minigun loops and winddown', 'independent remote lasers and timeout', 'reserved damage/kill/warning voices'];
  } finally {audio.createBufferSource=original;remotes.delete('laserA');remotes.delete('laserB');for(const id of firingSounds.keys())stopContinuous(id);}
}
