const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const read = n => fs.readFileSync(path.join(__dirname, '../src/js', n), 'utf8');
const part = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b));
function setup() {
  const cues = [], c = { shots: [], bodies: [], me: { weapon:'gamma', arsenal:{fire:Infinity,gauntlet:Infinity,gamma:1},x:0,y:0 },
    performance:{now:()=>1000}, audioCue:n=>cues.push(n), packPlay(){}, floaters:[], renderAmmo(){},renderWeapon(){},
    solidAny:()=>false, WEAPON_KEYS:['fire','gamma','mine','saw'], MODE:'d', MODES:{d:{}}, COARSE:false };
  vm.createContext(c);
  const cfg=read('01-config.js');vm.runInContext(part(cfg,'  const K =','  let PICKS'),c);
  vm.runInContext(read('11a-weapon-state.js')+'\nglobalThis.hasWeapon=hasWeapon;globalThis.weaponKey=weaponKey;',c);
  vm.runInContext(part(read('11-weapons.js'),'  function spend(', '  // quick dodge:'),c);
  c.cues=cues;return c;
}
test('last gamma and mine ammo keeps its command slot until the live projectile disappears',()=>{
  for(const [weapon,kind] of [['gamma',13],['mine',6]]) {
    const c=setup();c.me.weapon=weapon;c.me.arsenal[weapon]=1;c.shots=[{mine:true,life:2,kind}];
    c.spend(weapon,1);assert.equal(c.me.weapon,weapon);assert.equal(c.me.arsenal[weapon],0);
    assert.equal(c.hasWeapon(weapon),true);c.shots[0].life=0;assert.equal(c.hasWeapon(weapon),false);
  }
});
test('slot keys are stable when inventory changes and every slot has its own usable key combination',()=>{
  const c=setup(),keys=vm.runInContext('WEAPON_SLOTS.map(weaponKey)',c);
  assert.equal(new Set(keys).size,keys.length);assert.ok(keys.length>=16);assert.ok(keys.every(k=>/^(Alt\+)?[0-9]$/.test(k)));
  const before=c.weaponKey('rail');c.me.arsenal={rail:2,fire:Infinity};assert.equal(c.weaponKey('rail'),before);
  assert.equal(c.weaponKey('fire'),'1');assert.equal(c.weaponKey('saw'),'2');
});
test('permanent walls block through-wall segments, allow same-side blasts and open doorways',()=>{
  const c=setup();c.bodies=[{fixed:true,x:100,y:100,hw:10,hh:80}];
  assert.equal(c.fixedCover(0,100,200,100),true);
  assert.equal(c.fixedCover(90,100,0,100),false,'blast on near face reaches the near room');
  assert.equal(c.fixedCover(90,100,200,100),true,'blast on near face cannot reach far room');
  assert.equal(c.fixedCover(0,200,200,200),false);
  c.bodies[0].fixed=false;assert.equal(c.fixedCover(0,100,200,100),false,'destructible terrain keeps its blast rules');
});
test('alt refusal feedback is throttled, with a readable reason',()=>{
  const c=setup();c.rejectFire('NO ACTIVE MINES',1000);c.rejectFire('NO ACTIVE MINES',1016);
  assert.deepEqual(c.cues,['refuse']);assert.equal(c.floaters.length,1);assert.equal(c.floaters[0].txt,'NO ACTIVE MINES');
  c.rejectFire('NEED 3 AMMO',1800);assert.equal(c.floaters.length,2);
});
test('laser assist stays within beam range and a narrow cone and rejects hidden targets',()=>{
  const c=setup();Object.assign(c,{remotes:new Map(),mates:()=>false,angD:x=>x});
  vm.runInContext(part(read('11-weapons.js'),'  const BOLT_LOCK_R','  // and it jumps on:'),c);
  const p={x:0,y:0,a:0,id:'self'};
  c.remotes.set('enemy',{x:750,y:0});assert.equal(c.boltLock(p),undefined);
  c.remotes.set('enemy',{x:600,y:0});assert.equal(c.boltLock(p),0);
  c.bodies=[{fixed:true,x:300,y:0,hw:20,hh:80}];assert.equal(c.boltLock(p),undefined);
  c.bodies=[];c.remotes.set('enemy',{x:400,y:150});assert.equal(c.boltLock(p),undefined);
});
