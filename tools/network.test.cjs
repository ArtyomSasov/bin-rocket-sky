const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const read = name => process.env.TEST_REF
  ? execFileSync('git', ['show', `${process.env.TEST_REF}:src/js/${name}`], { cwd: root, encoding: 'utf8' })
  : fs.readFileSync(path.join(root, 'src/js', name), 'utf8');
function section(file, from, to) { const s = read(file); return s.slice(s.indexOf(from), s.indexOf(to)); }
function setup() {
  let now = 0;
  const clients = [], timers = [], els = new Map();
  const element = () => ({ classList: { toggle() {} }, textContent: '', hidden: false });
  const c = { WEAPONS: {fire:{}, rail:{}, tele:{}, nail:{disabled:true}}, metricPeer(){},
    performance: { now: () => now }, console, Date, Math, Map, Set, Number, Array, JSON, Promise,
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'),
    document: { getElementById(id) { if (!els.has(id)) els.set(id, element()); return els.get(id); }, createElement: element, head: { appendChild(s) { s.onload(); } }, addEventListener() {} },
    window: {}, navigator: {}, setInterval(f) { timers.push(f); }, setTimeout() {}, addEventListener() {}, history: { replaceState() {} }, location: {},
    mqtt: { connect(url, options) { const e = new EventEmitter(); Object.assign(e, { url, options, connected: true, sent: [], subscribe() {}, publish(topic, payload) { e.sent.push({ topic, payload: JSON.parse(payload) }); }, end() { e.ended = true; } }); clients.push(e); return e; } },
    joining: false, lan: { guest: false }, MAX_BOTS: 24, startMatch() {}, receiveMatchClock() {}, W: 1000, H: 1000, LIVES: 5, MAX_LV: 5, MAX_SHIELD: 6, DROP_LIFE: 20000,
    clamp: (v,a,b) => Math.max(a, Math.min(b,v)), num: (v,d) => Number.isFinite(v) ? v : d,
    remotes: new Map(), botById: new Map(), bots: [], drops: new Map(), grabbed: new Set(), credited: new Set(), myTag: 'local',
    stats: { round: 1, hits: 0, kills: 0, deaths: 0, streak: 0, best: 0 }, me: { score: 0 }, floaters: [],
    pruneRockMotion() {}, setMatch() {}, clockNow: () => now, showScore() {}, reportKill() {}, myKillAnnounce() {}, blip() {}, settleTeam() {}, applyTerrain() {},
    mapOf: () => 'm', modeOf: () => 'd', mapThemeOf: () => 'c', setMapSize() {}, buildPlanets() {}, setMode() {}, spawnPoint: () => ({}),
    MODES: { d: { label: 'DM' } }, MODE: 'd', MAPS: { c: { label: 'Classic' } }, playing: true,
    sizeOf: () => 1, clockTarget: 0, clockOff: 0, clockBase: 0, lerpAng: () => 0, vw: 1, vh: 1, wrapD: x => x,
    confirmShotHit() {}, gainXp() {}, killXp: () => 10, announce() {}, killStyle() {}, gunDrops: new Map(), DEATH_KINDS: 6, WEAPON_KEYS: ['fire', 'rail', 'tele'],
  };
  vm.createContext(c);
  vm.runInContext(read('12-network.js') + '\nglobalThis.api = {applyRemote, initNet, chooseLobby, botsOf, net};', c);
  return { c, clients, timers, advance: n => { now += n; }, async start() { const p = c.api.initNet(); c.api.chooseLobby('test'); await p; } };
}
const state = (q, extra = {}) => ({ x: 10, y: 10, q, rd: 1, ...extra });
const deliver = (client, id, p) => client.emit('message', 'binrocket-sky/v17/test/s/' + id, Buffer.from(JSON.stringify(p)));

test('malformed JSON values do not break the message callback; next state still arrives', async () => {
  const { c, clients, start } = setup(); await start();
  for (const p of [null, [], 0, false, 'bad']) assert.doesNotThrow(() => deliver(clients[1], 'pother', p));
  deliver(clients[1], 'pother', state(1)); assert.equal(c.remotes.size, 1);
});
test('both brokers receive identical states, and backup-only peers can return messages', async () => {
  const { c, clients, start } = setup(); await start();
  const msg = state(1, { f: [['shot', 1, 2, 3, 4, 0]] }); c.api.net.send(msg);
  assert.equal(clients[1].sent.length, 1); assert.equal(clients[2].sent.length, 1);
  assert.deepEqual(clients[1].sent[0], clients[2].sent[0]);
  clients[1].connected = false; c.api.net.send(state(2));
  assert.equal(clients[2].sent.length, 2);
  assert.equal(c.api.net.shotsInState, true); assert.ok(c.api.net.hz <= 9);
  deliver(clients[2], 'pother', state(1)); assert.equal(c.remotes.size, 1);
});
test('trophies accept only a real gun index; keys like "length" or "map" are refused', () => {
  const { c } = setup();
  c.api.applyRemote('pother', state(1, { wd: [['ga', 5, 5, 'length', 3], ['gb', 5, 5, 'map', 3], ['gc', 5, 5, -1, 3], ['gd', 5, 5, 3, 3], ['ge', 5, 5, 2, 3], ['gf', 5, 5, 0, 3]] }));
  assert.equal(c.gunDrops.size, 0);
  c.api.applyRemote('pother', state(2, { wd: [['gg', 5, 5, 1, 4]] }));
  assert.deepEqual([...c.gunDrops.values()].map(d => d.type + ':' + d.ammo), ['rail:4']);
});
test('the push direction (td) never touches the facing target (ta), with or without td', () => {
  const { c } = setup();
  c.api.applyRemote('pother', state(1, { a: 1.5, t: 1, td: -2 }));
  c.api.applyRemote('pother', state(2, { a: 1.2, t: 0 }));   // stopped pushing: no td
  const r = c.remotes.get('pother'); assert.equal(r.ta, 1.2); assert.equal(r.tdir, undefined);
  c.api.applyRemote('pother', state(3, { a: 0.4, t: 1, td: 3 }));
  assert.equal(r.ta, 0.4); assert.equal(r.tdir, 3);
});
test('duplicate and older states cannot roll back team, flags, or captures', () => {
  const { c } = setup();
  c.api.applyRemote('pother', state(2, { tm: 0, fc: -1, cp: [1, 2] }));
  for (const q of [1, 2]) c.api.applyRemote('pother', state(q, { tm: 1, fc: 0, cp: [1, 0] }));
  const r = c.remotes.get('pother'); assert.equal(r.tm, 0); assert.equal(r.fc, -1); assert.equal(r.caps, 2);
});
test('old-round reports cannot be credited after reset; current-round hits still work', () => {
  const { c } = setup();
  c.api.applyRemote('pother', state(1, { hb: ['local.1'], ko: ['local.1'] }));
  assert.equal(c.stats.hits, 1); assert.equal(c.stats.kills, 1);
  c.stats.round = 2; c.stats.hits = c.stats.kills = 0; c.credited.clear();
  c.api.applyRemote('pother', state(2, { hb: ['local.1'], ko: ['local.1'] }));
  assert.equal(c.stats.hits, 0); assert.equal(c.stats.kills, 0);
  c.api.applyRemote('pother', state(3, { rd: 2, hb: ['local.2'], ko: ['local.2'] }));
  assert.equal(c.stats.hits, 1); assert.equal(c.stats.kills, 1);
});
test('peer and drop admission is bounded before any animation frame runs', () => {
  const { c } = setup();
  for (let i = 0; i < 2000; i++) c.api.applyRemote('p' + i, state(i, { dr: [['d' + i, 1, 1, 1]] }));
  assert.ok(c.remotes.size <= 128); assert.ok(c.drops.size <= 256);
  for (let i = 2000; i < 4000; i++) c.api.applyRemote('p0', state(i, { dr: [['d' + i, 1, 1, 1]] }));
  assert.ok(c.drops.size <= 256);
});
test('background housekeeping expires remote drops and host ownership without a frame', async () => {
  const { c, clients, start, advance } = setup(); await start();
  deliver(clients[1], 'phost', state(1, { bots: [['pbchild', state(1)]], dr: [['drop', 1, 1, 1]] }));
  // Load the production timer body, without starting rendering.
  Object.assign(c, { parts: [], MAX_PARTS: 100, impacts: [], rings: [], arcs: [], beams: [], seenShots: new Map(), grabbed: { prune() {} }, myDrops: [], myGunDrops: [], gunDrops: new Map(), GUN_DROP_LIFE: 15000 });
  const timers = []; c.setInterval = f => timers.push(f);
  vm.runInContext(section('20-loop-hud.js', '  setInterval(() => {', '  let resCheckAt'), c);
  advance(21000); timers[0]();
  assert.equal(c.remotes.size, 0); assert.equal(c.drops.size, 0); assert.equal(c.api.botsOf.size, 0);
});
test('frame-based timeout also removes host ownership', async () => {
  const { c, clients, start, advance } = setup(); await start();
  deliver(clients[1], 'phost', state(1, { bots: [] })); advance(8000);
  vm.runInContext(section('17-update.js', '  function updateRemotes', '  // sparks, spilled stars'), c);
  c.updateRemotes(0.016, 8000); assert.equal(c.api.botsOf.size, 0);
});
test('CTF stops scoring during results and still scores in a live round', () => {
  const { c } = setup();
  Object.assign(c, { bases: [{ x: 0, y: 0 }, { x: 1000, y: 1000 }], roundLive: false, onTeam: () => true,
    me: { tm: 0, x: 0, y: 0, fc: 1, caps: 0, lv: 1, dead: false, score: 0 }, gainXp() {}, announce() {}, sfx() {}, rings: [], TEAM_NAME: ['red', 'blue'], TEAM_HEX: ['red', 'blue'], TEAM_RGB: ['1', '2'], renderBoard() {} });
  vm.runInContext(read('14-ctf.js'), c); c.ctfTick(0); assert.equal(c.me.caps, 0);
  c.roundLive = true; c.ctfTick(0); assert.equal(c.me.caps, 1);
});
function terrainFixture() {
  const { c } = setup();
  const body = () => ({ cells: new Uint8Array(16).fill(1), initialCells: new Uint8Array(16).fill(1), gw: 4, gh: 4, cs: 8, mass: 16, q: { clearRect() {} }, dead: false, free: false });
  c.det = [body()]; c.rebuildBodies = () => {}; c.sweepOrphans = () => {};
  vm.runInContext(section('06-bodies.js', '  let terrainCursor', '  // ---------- breaking apart:'), c);
  return { c, body };
}
test('late join and reconnect recover old holes; stale snapshots never fill holes', () => {
  const { c, body } = terrainFixture();
  c.det[0].cells[2] = c.det[0].cells[9] = 0;
  const snapshot = c.nextTerrain(); c.det = [body()]; c.applyTerrain(snapshot);
  assert.equal(c.det[0].cells[2], 0); assert.equal(c.det[0].cells[9], 0); assert.equal(c.det[0].mass, 14);
  c.det[0].cells[5] = 0; c.det[0].mass--;
  c.applyTerrain(snapshot); assert.equal(c.det[0].cells[5], 0); assert.equal(c.det[0].mass, 13);
  c.det[0].cells[11] = 0; const repaired = c.nextTerrain(); c.det = [body()]; c.applyTerrain(repaired);
  assert.equal(c.det[0].cells[11], 0);
});
test('terrain rejects wrong rounds, invalid encodings and body IDs; gone bodies synchronize', () => {
  const { c } = terrainFixture();
  for (const s of [[0, 0, 1, ''], [1, -1, 1, ''], [1, 0, 0, '!!!!'], [1, 0, 0, ''], [1, 0, 1, 'bad']]) c.applyTerrain(s);
  assert.equal(c.det[0].mass, 16); assert.equal(c.det[0].dead, false);
  c.applyTerrain([1, 0, 1, '']); assert.equal(c.det[0].dead, true);
});
test('malformed nested appearance and death data cannot throw during packet handling', async () => {
  const { c, clients, start } = setup(); await start();
  c.cleanCustom = a => a.map(Number); // same coercion used by the appearance sanitizer
  const bad = { toString: null, valueOf: null };
  deliver(clients[1], 'pother', state(1));
  assert.doesNotThrow(() => deliver(clients[1], 'pother', state(2, { ck: [bad, 0, 0, 0, 0] })));
  assert.doesNotThrow(() => deliver(clients[1], 'pother', state(3, { ds: bad })));
});
test('a host cannot take ownership of another host’s bot', async () => {
  const { c, clients, start } = setup(); await start();
  deliver(clients[1], 'pone', state(1, { bots: [['pbchild', state(1)]] }));
  deliver(clients[1], 'ptwo', state(1, { bots: [['pbchild', state(2)]] }));
  assert.equal(c.remotes.get('pbchild').host, 'pone');
});

function enableShots(c) {
  const config=read('01-config.js');
  vm.runInContext(config.slice(config.indexOf('  const K ='),config.indexOf('  // weapons:'))+'\nglobalThis.K=K;globalThis.SHOTS=SHOTS;',c);
  vm.runInContext(section('11-weapons.js','  const straightShot','  function recordHitPose'),c);
  Object.assign(c,{shots:[],seenShots:new Map(),REWIND_MS:250,QUAD:4,BOMBS:{},railBeam(){},laserBeam(){},shotSound(){},scatterPellets(s){c.shots.push(s)},shardSpray(s){c.shots.push(s)},nailSpray(s){c.shots.push(s)}});
}
test('instant shots are published before a state and their repeated journals never duplicate them',async()=>{
  const {c,clients,start}=setup();enableShots(c);await start();
  c.api.applyRemote('pother',state(1,{tg:'other'}));
  const f=['other.1',10,10,6400,0,c.K.SHOCK,1,0,0,Date.now()];
  c.api.net.shot(f);assert.ok(clients[1].sent[0].topic.includes('/f/'));assert.deepEqual(clients[1].sent[0],clients[2].sent[0]);
  const packet={rd:1,ts:Date.now(),f:[f]};
  for(const client of clients.slice(1))client.emit('message','binrocket-sky/v17/test/f/pother',Buffer.from(JSON.stringify(packet)));
  deliver(clients[1],'pother',state(2,packet));
  assert.equal(c.shots.length,1);assert.equal(c.shots[0].vx,6400,'shock velocity must not be clamped to 4500');
});
test('a reordered state recovers unseen shots without rolling movement back; stale/invalid shots are ignored',()=>{
  const {c}=setup();enableShots(c);c.api.applyRemote('pother',state(5,{tg:'other',x:500}));
  const ts=Date.now(),f=['other.1',10,10,4200,0,c.K.RAIL,1,0,0,ts];
  c.api.applyRemote('pother',state(4,{ts,x:20,f:[f]}));
  assert.equal(c.shots.length,1);assert.equal(c.remotes.get('pother').q,5);assert.equal(c.remotes.get('pother').x,500);
  c.api.applyRemote('pother',state(3,{ts:ts+2000,f:[['other.old',10,10,4200,0,c.K.RAIL,1,0,0,ts]]}));
  c.api.applyRemote('pother',state(2,{ts,f:[['other.bad',10,10,NaN,0,5],['spoof.1',10,10,4200,0,5],['other.bad2',10,10,1000,0,999]]}));
  assert.equal(c.shots.length,1);
});
test('piercing and explosion multi-kills count once for each victim, not once per shot',()=>{
  const {c}=setup();
  const result={hb:['local.rail'],ko:['local.rail']};
  c.api.applyRemote('pone',state(1,result));c.api.applyRemote('ptwo',state(1,result));
  assert.equal(c.stats.kills,2);assert.equal(c.stats.hits,2);
  c.api.applyRemote('pone',state(2,result));c.api.applyRemote('ptwo',state(2,result));
  assert.equal(c.stats.kills,2);assert.equal(c.stats.hits,2);
});
test('remote prediction does not double-advance velocity and freezes during a network gap',()=>{
  const {c}=setup();vm.runInContext(section('17-update.js','  function updateRemotes','  // sparks, spilled stars'),c);
  const r={x:100,y:100,tx:100,ty:100,vx:600,vy:0,a:0,ta:0,seen:0,dead:true};c.remotes.set('pother',r);
  c.updateRemotes(0.016,16);assert.ok(Math.abs(r.x-109.6)<1e-8);assert.equal(r.x,r.tx);
  const x=r.x;c.updateRemotes(0.016,500);assert.equal(r.x,x);assert.equal(r.tx,x);
});
test('late combat confirmations survive reordered movement and cannot score twice',()=>{
  const {c}=setup();c.api.applyRemote('pother',state(10,{x:500}));
  c.api.applyRemote('pother',state(9,{x:20,hb:['local.1'],ko:['local.1']}));
  assert.equal(c.stats.hits,1);assert.equal(c.stats.kills,1);assert.equal(c.remotes.get('pother').x,500);
  c.api.applyRemote('pother',state(8,{hb:['local.1'],ko:['local.1']}));assert.equal(c.stats.kills,1);
  c.api.applyRemote('pother',state(7,{rd:0,hb:['local.2'],ko:['local.2']}));assert.equal(c.stats.kills,1);
});
test('reordered host packets recover bot confirmations without rolling host ownership back',async()=>{
  const {c,clients,start}=setup();await start();
  deliver(clients[1],'phost',state(10,{bots:[['pbbot',state(10)]]}));
  deliver(clients[1],'phost',state(9,{bots:[['pbbot',state(9,{hb:['local.1'],ko:['local.1']})]]}));
  assert.equal(c.stats.kills,1);assert.equal(c.remotes.get('pbbot').q,10);
  deliver(clients[1],'pintruder',state(10,{bots:[]}));
  deliver(clients[1],'pintruder',state(9,{bots:[['pbbot',state(11,{ko:['local.2']})]]}));
  assert.equal(c.stats.kills,1);assert.equal(c.remotes.get('pbbot').host,'phost');
});
test('old shots cannot replay after duplicate cache expiry via an old snapshot',()=>{
  const {c}=setup();enableShots(c);const ts=Date.now();
  c.api.applyRemote('pother',state(10,{tg:'other',ts}));
  c.api.applyRemote('pother',state(1,{ts:ts-6000,f:[['other.1',10,10,1000,0,c.K.NAIL,1,0,0,ts-6000]]}));
  assert.equal(c.shots.length,0);
  c.api.applyRemote('pother',state(11,{ts,f:[['other.2',10,10,1000,0,c.K.NAIL,1,0,0,ts]]}));
  assert.equal(c.shots.length,1);assert.ok(c.shots[0].catchup>0&&c.shots[0].catchup<=0.25);
});
test('a fireball and a rocket start caught up with the delay; a grenade keeps its own flight',()=>{
  const {c}=setup();enableShots(c);const ts=Date.now();
  c.api.applyRemote('pother',state(1,{tg:'other',ts}));
  c.api.applyRemote('pother',state(2,{ts,f:[['other.1',10,10,1000,0,c.K.FIRE,1,0,0,ts-100],['other.2',10,10,1350,0,c.K.ROCKET,1,0,0,ts-100],['other.3',10,10,900,0,c.K.GREN,1,0,0,ts-100]]}));
  assert.equal(c.shots.length,3);
  assert.ok(c.shots[0].catchup>=0.1&&c.shots[0].catchup<=0.25);assert.ok(c.shots[1].catchup>=0.1&&c.shots[1].catchup<=0.25);
  assert.equal(c.shots[2].catchup,0);
});
