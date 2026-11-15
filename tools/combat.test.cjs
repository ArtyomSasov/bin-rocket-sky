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
    canHurt:(s,o,id)=>!o.dead && id!==s.owner, sweepOrphans(){},
    toLocal:(b,x,y)=>[x-b.x+b.hw,y-b.y+b.hh], toWorld:(b,x,y)=>[x+b.x-b.hw,y+b.y-b.hh],
    rubbleFx(){}, bodies:[],det:[],stats:{round:1},myCarves:[],carveSeq:0,MAX_CARVES:320,seenCarves:new Set(),carveRnd(){},carveLocal(){return 0;}
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
  const s={kind:c.K.BULLET,px:0,py:0,x:200,y:0,stepFrom:900,stepTo:1000};
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
  const s={kind:c.K.BULLET,px:0,py:0,x:200,y:0,stepFrom:900,stepTo:1000};
  assert.equal(c.targetHit(s,o),false);
  o.x=100;o.y=80;o.inv=2000;o.hitHistory=[];c.recordHitPose(o,900);o.y=-80;c.recordHitPose(o,1000);
  assert.equal(c.targetHit(s,o),false);
});
