const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function setup() {
  let now=5000;
  const c={Map,Math,Number,Array,W:2000,H:2000,ROCKS:36,ROCK_PERIOD:22,myTag:'pilot',clockNow:()=>now,
    hash:()=>0.5,sizeOf:lv=>1+(lv-1)*0.09,mod:(v,s)=>((v%s)+s)%s,
    bounceIn:(v,lo,hi)=>lo+(hi-lo)-Math.abs((((v-lo)%(2*(hi-lo)))+2*(hi-lo))%(2*(hi-lo))-(hi-lo))};
  vm.createContext(c);
  const s=fs.readFileSync(path.join(__dirname,'../src/js/09-sparks-junk-health.js'),'utf8');
  vm.runInContext(s.slice(s.indexOf('  // ---------- space junk'),s.indexOf('  // ---------- hearts'))+'\nglobalThis.motion=rockMotion;',c);
  return {c,advance:ms=>now+=ms};
}
const rock=()=>({slot:0,gen:0,x:1000,y:1000,vx:0,vy:0,r:30});
function hit(speed,lv=1,r=30){const {c}=setup(),k=rock();k.r=r;const p={x:1000-r-25,y:1000,vx:speed,vy:0,lv};c.collideRock(p,k);return {c,k,p};}
test('impact exchanges momentum and produces restitution 0.6, without adding kinetic energy',()=>{
 const {k,p}=hit(300);assert.ok(Math.abs(p.vx+k.vx-300)<1e-8);assert.ok(Math.abs((k.vx-p.vx)/300-0.6)<1e-8);
 assert.ok(p.vx*p.vx+k.vx*k.vx<=300*300);assert.ok(k.vx>0);
});
test('higher speed and heavier bin push harder; larger asteroid moves less',()=>{
 assert.ok(hit(600).k.vx>hit(300).k.vx);assert.ok(hit(300,10).k.vx>hit(300,1).k.vx);
 assert.ok(hit(300,1,40).k.vx<hit(300,1,22).k.vx);
});
test('relative velocity and contact normal preserve tangential motion; separating bodies receive no impulse',()=>{
 const {c}=setup(),k=rock(),p={x:945,y:1000,vx:100,vy:75,lv:1};k.vx=200;k.vy=20;
 assert.equal(c.collideRock(p,k),0);assert.equal(k.vx,200);assert.equal(p.vy,75);
 p.x=945;p.vx=400;c.collideRock(p,k);assert.equal(p.vy,75);assert.equal(k.vy,20);
});
test('impact persists across frames and remote snapshots reproduce the same trajectory',()=>{
 const {c,k}=hit(300),packet=c.nextRockMotion(),other=setup().c;
 other.applyRockMotion(packet);
 for(const t of [5000,5500,7000]){
   const a=c.rock(0,t),b=other.rock(0,t);for(const key of ['x','y','vx','vy'])assert.ok(Math.abs(a[key]-b[key])<1e-8);
 }
 assert.ok(c.rock(0,5500).x>k.x);
 other.applyRockMotion(packet);assert.equal(other.motion.size,1);
 const older=packet.map(e=>e.slice());older[0][2]-=100;older[0][5]=0;other.applyRockMotion(older);
 assert.equal(other.motion.get(0).vx,k.vx);
});
test('wall reflection reverses velocity and old generations are removed without animation',()=>{
 const {c,advance}=setup();const [x,v]=c.rockAxis(1950,200,1,1960);assert.equal(x,1770);assert.equal(v,-200);
 c.applyRockMotion([[0,0,5000,1000,1000,200,0,'pilot']]);assert.equal(c.motion.size,1);
 advance(22000);c.pruneRockMotion(c.clockNow());assert.equal(c.motion.size,0);
});
test('malformed, out-of-range, future and expired motion cannot create state',()=>{
 const {c}=setup();const valid=[0,0,5000,1000,1000,200,0,'pilot'];
 for(const [index,value] of [[0,-1],[0,36],[1,1],[2,9000],[2,-30000],[3,0],[4,3000],[5,5000],[6,NaN],[7,{}]]){
  const e=valid.slice();e[index]=value;c.applyRockMotion([e]);
 }
 c.applyRockMotion([null,[],[1]]);assert.equal(c.motion.size,0);
});
