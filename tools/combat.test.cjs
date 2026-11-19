const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const read = n => fs.readFileSync(path.join(__dirname, '../src/js', n), 'utf8');
const section = (n, a, b) => { const s = read(n); return s.slice(s.indexOf(a), s.indexOf(b)); };
function setup() {
  const c = { Math, Map, Set, Number, Array, Uint8Array, performance: {now:()=>1000},
    clamp:(v,a,b)=>Math.max(a,Math.min(b,v)), binR:()=>40, botById:new Map(), bots:[], remotes:new Map(),
    me:{x:1000,y:1000,lv:1}, playing:false, W:4000,H:4000,
    audioCue(){}, canHurt:(s,o,id)=>!o.dead && id!==s.owner, sweepOrphans(){},
    toLocal:(b,x,y)=>[x-b.x+b.hw,y-b.y+b.hh], toWorld:(b,x,y)=>[x+b.x-b.hw,y+b.y-b.hh],
    rubbleFx(){}, WALL_CARVE:+fs.readFileSync(path.join(__dirname,'../src/js/01-config.js'),'utf8').match(/WALL_CARVE = (\d+)/)[1], solidAt:()=>false, bodies:[],det:[],stats:{round:1},myCarves:[],carveSeq:0,MAX_CARVES:320,seenCarves:new Set(),carveRnd(){},carveLocal(){return 0;}
  };
  vm.createContext(c);
  vm.runInContext(section('01-config.js','  const K =','  // weapons:') + '\nglobalThis.K=K;globalThis.SHOTS=SHOTS;',c);
  vm.runInContext(section('10-effects.js','  function segHit(', '  function rrect('),c);
  vm.runInContext(section('11-weapons.js','  const REWIND_MS', '  const pierces'),c);
  vm.runInContext(section('11-weapons.js','  function beamReach(', "  // the laser's look:"),c);
  vm.runInContext(section('11-weapons.js','  function returnSaw(', '  // the nailgun:'),c);
  vm.runInContext(section('17-update.js','  const HITSCAN', '  function traceBeam('),c);
  vm.runInContext(section('06-bodies.js','  function carveLineLocal(', '  // Repair missed'),c);
  return c;
}
function body() {
  const q={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},clearRect(){}};
  return {q,cs:10,gw:40,gh:40,hw:200,hh:200,x:500,y:500,r:283,mass:1600,cells:new Uint8Array(1600).fill(1)};
}
test('rail cuts are continuous horizontally, vertically, diagonally and on repeated shots',()=>{
  const c=setup();
  for(const [x1,y1,x2,y2] of [[0,201,400,201],[201,0,201,400],[0,0,400,400],[0,87,400,313]]){
    const b=body();c.carveLineLocal(b,x1,y1,x2,y2,14);
    for(let i=0;i<=399;i++){
      const t=i/400,x=x1+(x2-x1)*t,y=y1+(y2-y1)*t;
      assert.equal(b.cells[Math.floor(y/10)*40+Math.floor(x/10)],0,`bridge at ${x},${y}`);
    }
    const mass=b.mass;assert.equal(c.carveLineLocal(b,x1,y1,x2,y2,14),0);assert.equal(b.mass,mass);
  }
});
test('one compact rail event reproduces the same cells remotely and rejects bad endpoints',()=>{
  const c=setup(), b=body();c.bodies=[b];c.det=[b];
  c.carveBeam({px:0,py:500,x:1000,y:500,mine:true},14);
  assert.equal(c.myCarves.length,1);
  const copy=body();c.det=[copy];c.applyRemoteCarves('peer',c.myCarves.map(e=>e.d));
  assert.deepEqual(copy.cells,b.cells);
  const mass=copy.mass;c.applyRemoteCarves('peer',c.myCarves.map(e=>e.d));assert.equal(copy.mass,mass);
  c.applyRemoteCarves('bad',[[1,0,0,0,14,4,9999,4]]);assert.equal(copy.mass,mass);
});
test('breach cutter makes a flyable wider cut and its visible range matches collision reach',()=>{
  const c=setup(), narrow=body(),wide=body();
  c.carveLineLocal(narrow,0,200,400,200,14);c.carveLineLocal(wide,0,200,400,200,72);
  assert.ok(wide.mass<narrow.mass);
  for(let j=16;j<=23;j++) assert.equal(wide.cells[j*40+20],0);
  const s={x:100,y:100,vx:4200,vy:0,kind:c.K.GAUSS,cut:72};assert.equal(c.beamReach(s),1100);
  s.x=3500;assert.equal(c.beamReach(s),500);
});
test('incoming hitscan uses interpolated historical pose; projectiles use current pose',()=>{
  const c=setup(), o={x:500,y:200,lv:1,inv:0};
  c.recordHitPose(o,800);o.y=300;c.recordHitPose(o,900);o.y=400;c.recordHitPose(o,1000);
  const s={kind:c.K.RAIL,owner:'peer',px:0,py:250,x:1000,y:250,hitTime:850};
  assert.equal(c.targetHit(s,o),true);
  s.kind=c.K.ROCKET;assert.equal(c.targetHit(s,o),false);
  s.kind=c.K.RAIL;s.hitTime=1000;assert.equal(c.targetHit(s,o),false);
});
test('teleport, death and spawn invulnerability discard old hitbox history',()=>{
  const c=setup(),o={x:100,y:100,lv:1,inv:0};c.recordHitPose(o,800);
  o.x=1000;c.recordHitPose(o,900);assert.equal(o.hitHistory.length,1);
  o.dead=true;c.recordHitPose(o,920);assert.equal(o.hitHistory.length,1);
  o.dead=false;o.inv=3000;c.recordHitPose(o,940);assert.equal(o.hitHistory.length,1);
  assert.equal(c.targetHit({kind:c.K.RAIL,owner:'peer',hitTime:950,px:0,py:100,x:2000,y:100},o),false);
});
test('first beam target is nearest, regardless of remote insertion order',()=>{
  const c=setup();c.remotes.set('far',{x:800,y:100,lv:1});c.remotes.set('near',{x:300,y:100,lv:1});
  assert.equal(c.firstBinAlong({kind:c.K.LASER,px:0,py:100,vx:1000,vy:0},1200),260.5);
});
test('a saw returns through combat, resets hits only once, and is caught by its owner',()=>{
  const c=setup();c.me={x:100,y:100,lv:1};
  const s={kind:c.K.SAW,mine:true,x:800,y:100,vx:1500,vy:0,life:3.2,hits:new Set(['enemy'])};
  c.steerSaw(s,0.55);assert.ok(s.returning);assert.ok(s.vx<0);assert.equal(s.hits.size,0);
  s.hits.add('enemy');c.returnSaw(s);assert.equal(s.hits.size,1);
  s.x=120;c.steerSaw(s,0.016);assert.equal(s.life,0);
});
test('recall only affects the shooter’s blades',()=>{
  const c=setup();c.shots=[{kind:c.K.SAW,mine:true,life:1},{kind:c.K.SAW,owner:'other',life:1}];
  c.recallSaws({mine:true});assert.ok(c.shots[0].returning);assert.equal(c.shots[1].returning,undefined);
});
test('new announcer filenames map to first blood and flawless victory',()=>{
  const c={};vm.createContext(c);vm.runInContext(section('05-sound.js','  const PACK_PATHS','  const packBuf'),c);
  assert.equal(c.packEventFor('voice/announcer_1stblood_01.mp3'),'a_firstblood');
  assert.equal(c.packEventFor('voice/flawless-victory-mk-x.mp3'),'v_flawless');
});
test('a fast round hits a target crossing between frames, but not a near miss',()=>{
  const c=setup(),o={x:100,y:80,lv:1,inv:0};
  c.recordHitPose(o,900);o.y=-80;c.recordHitPose(o,1000);
  const s={kind:c.K.BULLET_ALT,px:0,py:0,x:200,y:0,stepFrom:900,stepTo:1000};   // a flying round (bullets are hitscan now)
  assert.equal(c.targetHit(s,o),true);
  s.py=s.y=150;assert.equal(c.targetHit(s,o),false);
});
test('projectile catch-up respects a change of direction in the target history',()=>{
  const c=setup(),o={x:100,y:80,lv:1,inv:0};
  c.recordHitPose(o,800);o.y=0;c.recordHitPose(o,900);o.y=80;c.recordHitPose(o,1000);
  assert.equal(c.targetHit({kind:c.K.NAIL,px:0,py:0,x:200,y:0,stepFrom:800,stepTo:1000},o),true);
});
test('projectile history never sweeps through a teleport or an invulnerability interval',()=>{
  const c=setup(),o={x:100,y:-200,lv:1,inv:0};
  c.recordHitPose(o,900);o.y=200;c.recordHitPose(o,1000);
  const s={kind:c.K.BULLET_ALT,px:0,py:0,x:200,y:0,stepFrom:900,stepTo:1000};   // a flying round (bullets are hitscan now)
  assert.equal(c.targetHit(s,o),false);
  o.x=100;o.y=80;o.inv=2000;o.hitHistory=[];c.recordHitPose(o,900);o.y=-80;c.recordHitPose(o,1000);
  assert.equal(c.targetHit(s,o),false);
});
test('slow straight projectiles catch up with network delay; steered, bouncing and sticking ones do not',()=>{
  const c=setup(), K=c.K;
  for(const k of ['FIRE','ROCKET','FLAK','ORB','GAMMA','BULLET','PELLET','SLUG','NAIL','SPIKE'])assert.equal(vm.runInContext(`straightShot(K.${k})`,c),true,k);
  for(const k of ['HROCKET','GREN','MINE','SAW','SHARD','NUKE','HOLY','BEACON','RAIL'])assert.equal(vm.runInContext(`straightShot(K.${k})`,c),false,k);
});
test('a protected bin neither stops a shot nor is hit by it; an unprotected one does both',()=>{
  const c=setup(), K=c.K;
  const target={x:500,y:0,lv:1,inv:true};c.remotes.set('pother',target);
  const rocket=()=>({kind:K.ROCKET,px:0,py:0,x:900,y:0,vx:1350,vy:0,owner:'pshooter'});
  assert.equal(c.firstBinAlong(rocket(),900),900,'flag from another browser');
  assert.equal(c.targetHit(rocket(),target),false);
  target.inv=false;
  assert.ok(Math.abs(c.firstBinAlong(rocket(),900)-(500-40-8+0.5))<1e-6);
  assert.equal(c.targetHit(rocket(),target),true);
  target.inv=2000;   // my own bins keep the time protection ends (the clock here reads 1000)
  assert.equal(c.firstBinAlong(rocket(),900),900,'time kept locally');
  const swept={...rocket(),stepFrom:984,stepTo:1000};
  assert.equal(c.firstBinAlong(swept,900),900,'swept catch-up step');
  target.inv=500;
  assert.ok(c.firstBinAlong(swept,900)<460);
});
test('a shot far from a bin skips its recorded path, and one that crosses it still finds the contact',()=>{
  const c=setup(), K=c.K;
  const history=Array.from({length:40},(_,i)=>({at:600+i*10,x:500,y:0,lv:1,inv:false,dead:false}));
  const far={x:500,y:3000,lv:1,hitHistory:history.map(h=>({...h,y:3000}))}, near={x:500,y:0,lv:1,hitHistory:history};
  const s={kind:K.BULLET,px:0,py:0,x:900,y:0,vx:2600,vy:0,stepFrom:750,stepTo:1000};
  assert.equal(c.projectileContact(s,far),Infinity);
  assert.ok(Math.abs(c.projectileContact(s,near)*900-460)<1e-6);
});
test('a delayed hitscan bullet is judged against where the victim was when it was fired, along the whole beam',()=>{
  const c=setup(), K=c.K;
  // the victim sat on the line until 760 ms, then moved 300 px off it by 1000 ms (now)
  const history=[];for(let t=600;t<=1000;t+=10)history.push({at:t,x:1800,y:t<=760?0:(t-760)/240*300,lv:1,inv:false,dead:false});
  const victim={x:1800,y:300,lv:1,hitHistory:history};c.remotes.set('pvictim',victim);
  for(const kind of [K.BULLET]){
    // a remote round fired 250 ms ago, traced this frame across 2000 px (catch-up makes its step start then)
    const s={kind,px:0,py:0,x:2000,y:0,vx:6000,vy:0,owner:'pother',hitTime:750,stepFrom:734,stepTo:1000};
    assert.equal(c.targetHit(s,victim),true,'rewound to fire time: '+kind);
    assert.ok(Math.abs(c.firstBinAlong(s,2000)-(1800-40+0.5))<1e-6,'the beam stops on the rewound victim');
  }
});
