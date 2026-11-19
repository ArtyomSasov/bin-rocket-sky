const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = n => fs.readFileSync(`${__dirname}/../src/js/${n}`, 'utf8');
function setup() {
  const c = {}; vm.createContext(c);
  const config = read('01-config.js');
  vm.runInContext(config.slice(0, config.indexOf('  // weapon icons')), c);
  vm.runInContext(read('09-sparks-junk-health.js').slice(read('09-sparks-junk-health.js').indexOf('  function syncArmor')), c);
  return { c, run: s => vm.runInContext(s, c) };
}
test('normal health stops at 100; vial and keg reach 199 without consuming useless pickups', () => {
  const { c, run } = setup(); c.p = { lives: 2.7 };
  assert.equal(run("applySupply(p, 'med')"), true); assert.equal(c.p.lives, 3);
  assert.equal(run("applySupply(p, 'med')"), false);
  assert.equal(run("applySupply(p, 'vial')"), true); assert.equal(c.p.lives, 3.15);
  assert.equal(run("applySupply(p, 'bigmed')"), true); assert.equal(c.p.lives, 5.97);
  assert.equal(run("applySupply(p, 'bigmed')"), false);
  assert.equal(run("applySupply(p, 'med')"), false); assert.equal(c.p.lives, 5.97);
});
test('body armor absorbs 75%, does not stack repeatedly, and pads cap the total at 150', () => {
  const { c, run } = setup(); c.p = { lives: 3 };
  run("applySupply(p, 'shield')"); assert.equal(c.p.shield, 3);
  assert.equal(run("applySupply(p, 'shield')"), false);
  assert.ok(Math.abs(run('absorbArmor(p, 1.2)') - .9) < 1e-9); assert.equal(c.p.shield, 2.1);
  run("applySupply(p, 'shield'); applySupply(p, 'pads')"); assert.equal(c.p.shield, 4.5);
  assert.equal(run("applySupply(p, 'pads')"), false);
});
test('shield belt replaces armor; damage overflow reaches health; respawn clears every layer', () => {
  const { c, run } = setup(); c.p = { lives: 3 };
  run("applySupply(p, 'shield'); applySupply(p, 'pads'); applySupply(p, 'mega')");
  assert.equal(c.p.shield, 4.5); assert.equal(c.p.bodyArmor, 0);
  assert.equal(run("applySupply(p, 'shield')"), false);
  assert.equal(run('absorbArmor(p, 6)'), 4.5); assert.equal(c.p.shield, 0);
  run("applySupply(p, 'mega'); clearArmor(p)");
  assert.equal(c.p.shield + c.p.bodyArmor + c.p.beltArmor + c.p.padsArmor, 0);
});
test('progression cannot change health or hitbox; superweapons retain explicit source/adapted damage', () => {
  const { run } = setup();
  assert.equal(run('lvOf(1e9)'), 1); assert.equal(run('sizeOf(10)'), 1);
  assert.equal(run('maxLivesOf(10)'), 3); assert.equal(run('levelAfterDeath(10)'), 1);
  assert.equal(run('bombDmg(BOMBS[K.NUKE], 0)'), 30);
  // past its core the nuke still hurts, fading out at the end of its shock wave
  assert.ok(Math.abs(run('bombDmg(BOMBS[K.NUKE], BOMBS[K.NUKE].R)') - run('BOMBS[K.NUKE].edge')) < 1e-9);
  assert.equal(run('bombDmg(BOMBS[K.NUKE], BOMBS[K.NUKE].wave[0])'), 0);
  assert.equal(run('bombReach(BOMBS[K.NUKE])'), run('BOMBS[K.NUKE].wave[0]'));
});
test('source damage relationships and Stinger alternate cadence match their intended roles', () => {
  const { run } = setup();
  assert.equal(run('SHOTS[K.PISTOL].dmg'), .51);
  assert.equal(run('SHOTS[K.BULLET_ALT].dmg'), 1.14);
  assert.equal(run('WEAPONS.minigun.alt.cd'), .28);
  assert.ok(run('WEAPONS.minigun.alt.cd > WEAPONS.minigun.cd'));
  assert.equal(run('SHOTS[K.GREN].dmg'), 3);
  assert.equal(run('SHOTS[K.MELEE].dmg'), 1.5);
});
