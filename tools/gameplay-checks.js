// Injected into the game scope only by browser-test.mjs; exercises real canvas and update code.
function runGameplayChecks() {
  const passed = [], check = (name, fn) => { fn(); passed.push(name); }, ok = (v, message) => { if (!v) throw Error(message); };
  const makeBody = (x, y) => {
    const b = newBody('test', 'rock', 320, 320, 8); b.x=x;b.y=y;
    b.q.fillStyle='#94a8c0';b.q.fillRect(0,0,320,320);cellsFromArt(b);return b;
  };
  const shot = (kind, x=100, y=600, vx=4200, vy=0) => ({kind,id:'test.0',x,y,px:x,py:y,ox:x,oy:y,vx,vy,life:SHOTS[kind].life,mine:true,m:1,bn:0});
  bodies=[];det=[];shots.length=0;remotes.clear();me.x=100;me.y=600;me.vx=me.vy=0;me.lv=1;me.a=0;me.ampUntil=0;me.dead=false;me.inv=0;
  check('real canvas rail cut crosses two bodies without solid or visible bridges',()=>{
    bodies=det=[makeBody(700,600),makeBody(1200,600)];const s=shot(K.RAIL);traceBeam(s);
    for(const b of bodies) for(let x=0;x<320;x++) {
      ok(!solidAt(b,b.x-160+x,600),'solid rail bridge');
      const [lx,ly]=toLocal(b,b.x-160+x,600);
      ok(b.q.getImageData(Math.floor(lx*BODY_RES),Math.floor(ly*BODY_RES),1,1).data[3]===0,'visible rail bridge');
    }
    ok(myCarves.slice(-2).every(e=>e.d.length===8),'compact line events');
  });
  check('rail has no alt fire, spends no ammo on ALT and deals 80 HP on primary',()=>{
    bodies=[];det=[];shots.length=0;me.weapon='rail';me.arsenal.rail=8;
    shoot(performance.now(),true);ok(shots.length===0&&me.arsenal.rail===8,'no alternate shot or ammo spend');
    ok(!WEAPONS.rail.alt,'no alternate mode');shoot(performance.now(),false);
    ok(Math.abs(shotDmg(shots.at(-1))-3)<1e-6&&fireCd===1.8,'100 HP (Quake 3) and slower recovery');
  });
  check('laser stops at the nearest bin and draws exactly its damage endpoint',()=>{
    shots.length=0;remotes.set('far',{x:900,y:600,lv:1,dead:false});remotes.set('near',{x:500,y:600,lv:1,dead:false});
    const s=shot(K.LASER,100,600,6400);traceBeam(s);
    ok(s.x<500 && s.x>450,'nearest target');ok(lasers.at(-1).x2===s.x,'visual endpoint');
    ok(targetHit(s,remotes.get('near'))&&!targetHit(s,remotes.get('far')),'only first target hit');remotes.clear();
  });
  check('last projectile step hits once, including a frame longer than remaining life',()=>{
    shots.length=0;me.x=200;me.y=600;me.inv=0;me.shield=0;me.lives=10;me.hitHistory=[];
    const s=shot(K.BULLET_ALT,100,600,2600);s.mine=false;s.owner='testpeer';s.life=0.04;shots.push(s);
    updateShots(0.05,performance.now());ok(Math.abs(me.lives-8.86)<.001,'terminal step still deals damage');
    updateShots(0,performance.now());ok(Math.abs(me.lives-8.86)<.001,'paused frame cannot repeat damage');
    shots.length=0;me.x=100;me.y=600;
  });
  check('delayed fast rounds sweep history and cannot skip a wall',()=>{
    shots.length=0;me.x=400;me.y=600;me.inv=0;me.shield=0;me.lives=10;me.hitHistory=[];
    const now=performance.now();recordHitPose(me,now-260);recordHitPose(me,now);
    const s=shot(K.BULLET_ALT,100,600,2600);s.mine=false;s.owner='testpeer';s.catchup=0.2;shots.push(s);
    updateShots(0.016,now);ok(Math.abs(me.lives-8.86)<.001,'catch-up hits during historical flight');
    shots.length=0;me.lives=10;const wall=makeBody(220,600);bodies=[wall];
    const blocked=shot(K.BULLET_ALT,40,600,2600);blocked.mine=false;blocked.owner='testpeer';blocked.catchup=0.2;shots.push(blocked);
    updateShots(0.016,now);ok(me.lives===10,'wall blocks catch-up');
    shots.length=0;bodies=[];me.x=100;me.y=600;me.hitHistory=[];
  });
  check('Ripper discs ricochet without automatic recall',()=>{
    shots.length=0;const s=shot(K.SAW,W-3,600,1500);shots.push(s);updateShots(0.016,performance.now());
    ok(!s.returning&&!s.stuck&&s.vx<0,'wall ricochet keeps disc outbound');
    updateShots(.3,performance.now()+300);ok(!s.returning,'disc does not home back');shots.length=0;
  });
  check('all weapon deaths dispatch and burning/electric bodies burn away',()=>{
    hulks.length=0;frags.length=0;melts.length=0;
    const b={x:700,y:600,vx:0,vy:0,a:0,lv:1,ck:[0,0,0,0,0]};
    const expected=[[K.NAIL,4],[K.SPIKE,4],[K.FIRE,5],[K.LASER,2],[K.BOLT,2],[K.ORB,3],[K.RAIL,1],[K.SAW,6],[K.MELEE,6]];
    for(const [kind,style] of expected) {ok(deathStyleOf(kind)===style,'weapon death style');deathFx(b,deathPiecesOf(kind),style,0);}
    for(const kind of [K.ROCKET,K.GREN,K.MINE,K.NUKE,K.HOLY]) ok(deathPiecesOf(kind)>=3,'blast must shatter');
    ok(hulks.some(h=>h.nails)&&hulks.some(h=>h.burn)&&hulks.some(h=>h.zap),'distinct hulks');ok(melts.length===1&&frags.length>=10,'melt and cuts');
    updateFx(6,performance.now()+6000);ok(!hulks.some(h=>h.burn||h.zap),'burnt and shocked bodies disappear');
  });
  check('nail corpse catches a thin obstacle during a long frame',()=>{
    hulks.length=0;const b=makeBody(700,600);b.cells.fill(0);b.cells[20*b.gw+20]=1;b.mass=1;bodies=[b];
    nailDeath({x:655,y:604,a:0,lv:1,ck:[0,0,0,0,0]},0);updateFx(0.05,performance.now());
    ok(hulks[0].pin?.b===b,'swept nail pin');
  });
  check('fixed thrusters oppose forward, lateral and reverse thrust, including bank',()=>{
    const b={x:100,y:200,a:0,thrust:1,lv:1,bank:0.3};
    for(const a of [0,Math.PI/2,Math.PI,-Math.PI/2]) {
      b.tdir=a;const jets=exhaustJets(b,1234), hot=jets.filter(j=>j.power>0.5);
      ok(hot.length===1,'one dominant jet');
      ok(Math.cos(hot[0].a-a)<-0.95,'exhaust opposes thrust');
      ok(jets.every(j=>Number.isFinite(j.x+j.y+j.a+j.power)),'finite nozzle transforms');
    }
    const count=hz=>{const b={};let n=0;for(let i=0;i<hz*2;i++)n+=emissionCount(b,'fx',100,1/hz);return n;};
    ok(Math.abs(count(30)-count(144))<=1,'particle budget independent of refresh');
    const b0={};ok(emissionCount(b0,'fx',100,0)===0,'hitstop emits nothing');
  });
  bodies=[];det=[];shots.length=0;me.inv=1e15;
  return passed;
}

// Optional contact sheet from the real renderers; no production debug API.
function renderDemonicPreview() {
  const c = document.createElement('canvas'); c.width = 800; c.height = 360;
  const old = g;
  try {
    g = c.getContext('2d'); g.fillStyle = '#10212b'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#c1fca5'; g.font = 'bold 22px sans-serif'; g.fillText('DEMONIC ORB', 32, 40);
    drawDemonicOrb(220, 192, 94, 1400);
    drawShot({kind:K.GAMMA, x:520,y:190,vx:420,vy:0},520,190,1400);
    g.fillStyle = '#a6c2b6'; g.font = '16px sans-serif'; g.fillText('Detail', 196, 330);g.fillText('In-game projectile', 450, 280);
    return c.toDataURL('image/png');
  } finally { g = old; }
}
function renderVfxPreview() {
  const c=document.createElement('canvas');c.width=1200;c.height=700;
  const old={g,vw,vh,cx:cam.x,cy:cam.y,lowQ};
  try {
    g=c.getContext('2d');vw=1200;vh=700;cam.x=600;cam.y=350;lowQ=false;
    g.fillStyle='#0a0b19';g.fillRect(0,0,1200,700);
    g.fillStyle='#e5eafa';g.font='24px sans-serif';g.fillText('BIN ROCKET SKY / EXHAUST & COMBAT FX',34,44);
    g.font='16px sans-serif';
    const now=performance.now(), b={a:-Math.PI/2,lv:3,lives:3,thrust:1.2,bank:0.2,boost:1,ck:[0,0,0,0,0],weapon:'fire',name:'',hue:12};
    for(const [x,tdir,label] of [[200,-Math.PI/2,'FORWARD BOOST'],[600,0,'SIDE THRUSTER'],[1000,Math.PI/2,'REVERSE THRUSTER']]) {
      b.x=x;b.y=180;b.tdir=tdir;drawBot(b,x,180,now,false);
      g.fillStyle='#b8c5df';g.fillText(label,x-85,320);
    }
    parts.length=0;impacts.length=0;rings.length=0;beams.length=0;lasers.length=0;arcs.length=0;shots.length=0;
    explode(210,500,80,220);smoke(560,500,16,70,2);
    for(const p of parts) {const age=p.x<400?0.3:0.65;p.x+=p.vx*age*0.65;p.y+=p.vy*age*0.65;p.life-=age;}
    impacts.length=0;rings.length=0;
    lasers.push({x1:800,y1:500,x2:1130,y2:490,t:0.02,hit:'body',seed:12,who:'preview'});
    drawGlow(now);drawBlastFx(now);
    g.fillStyle='#b8c5df';g.font='16px sans-serif';g.fillText('COOLING FIRE & SPARKS',110,660);g.fillText('EXPANDING SMOKE',480,660);g.fillText('ELECTRICAL DISCHARGE',840,660);
    return c.toDataURL('image/png');
  } finally {g=old.g;vw=old.vw;vh=old.vh;cam.x=old.cx;cam.y=old.cy;lowQ=old.lowQ;}
}

function renderArsenalPreview() {
  const c=document.createElement('canvas');c.width=1100;c.height=650;
  const old={g,vw,vh,cx:cam.x,cy:cam.y};
  try {
    g=c.getContext('2d');vw=1100;vh=650;cam.x=550;cam.y=325;
    g.fillStyle='#0a1721';g.fillRect(0,0,1100,650);
    const label=(txt,x,y)=>{g.fillStyle='#daebff';g.font='18px sans-serif';g.textAlign='left';g.fillText(txt,x,y);};
    label('MINIGUN · SHORT TRACERS',40,40);
    for(let i=0;i<6;i++)drawShot({kind:K.BULLET,vx:1,vy:0,m:1},80+i*70,90,1000);
    label('SCATTER · HOT PELLETS',40,170);
    for(let i=0;i<11;i++){const a=(i-5)*.066;drawShot({kind:K.PELLET,vx:Math.cos(a),vy:Math.sin(a),m:1},100+Math.cos(a)*270,235+Math.sin(a)*270,1000);}
    label('STINGER · HEAVY SHARDS',40,370);
    for(let i=0;i<3;i++)drawShot({kind:K.BULLET_ALT,vx:1,vy:0,m:1},100+i*130,415,1000);
    label('ARMOR PICKUPS',40,505);
    for(const [type,x] of [['pads',100],['shield',260],['mega',420]])drawSupply({type,x,y:560,age:1},x,560,1000);
    label('DEMONIC · VISIBLE DRAIN ZONE',610,40);
    drawShot({kind:K.GAMMA,x:800,y:325,vx:340,vy:0,m:1,life:3},800,325,1000);
    return c.toDataURL('image/png');
  }finally{g=old.g;vw=old.vw;vh=old.vh;cam.x=old.cx;cam.y=old.cy;}
}
