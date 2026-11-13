# Bin Rocket Sky

A browser multiplayer space shooter: you fly a turquoise bin-rocket, blast other bins, chip planets and
wrecks apart and collect weapons.

**Play:** https://artyomsasov.github.io/bin-rocket-sky/

## Modes

Pick a mode when you create a lobby; the lobby code carries it, so friends who join with the code get the same game.

| Mode | What it is |
|---|---|
| Deathmatch | Everyone for themselves, most kills in a 5-minute round wins |
| Team Deathmatch | Red against Blue, no friendly fire, team kills count |
| Capture the Flag | Take the enemy flag from their pad to yours while your own flag is home |
| Nukes only | Everyone has unlimited nukes and nothing else |
| Railgun instagib | Unlimited railguns, one hit kills |

Use **Random look** below the centered pilot preview to randomize all five appearance choices. The look is saved in this browser.

Small drifting asteroids exchange momentum with the bin on collision: speed and bin size/level increase the push, while larger asteroids resist it. The changed trajectory is shared with other players and lasts until that asteroid respawns. Hard impacts still chip the asteroid.

Bots (2, 4 or 6, three skill levels) join any mode and play its rules. Only the lobby's host (whoever made the
code, remembered in that browser) brings bots; players who join with the code play with the host's.

## Finding a game

The start screen's "Join" tab lists the games running right now (mode, map, size, pilots and bots); click one
to join. Every running lobby announces itself every few seconds on a shared topic of the public MQTT broker the
game already uses, so there is no server of our own; a lobby disappears from the list ~13 s after it goes quiet.

## Maps

Also picked with a new lobby (and carried in its code), on top of the map size:

| Map | What fills it |
|---|---|
| Classic | Planets with moons, drifting wrecks |
| Asteroid belt | Dozens of ragged rocks, hardly any wrecks |
| Shipyard | Broken ship hulls and station rings, few planets |
| Ruined city | Floating towers and container stacks |
| Solar system | A sun in the middle, big planets with two moons each |
| Waste depot | Skips, refuse trucks, giant wheelie bins and bales of crushed waste |
| Open space | Almost empty: quick duels |

## Controls

- **Move:** WASD or arrows (or hold the mouse); on a phone, the joystick. The bin has inertia: push the
  other way or hold **X** to brake.
- **Fire:** Space, F, J or Enter (or the fire button).
- **Boost / dash:** hold Shift to boost, tap it to dash.
- **Weapons:** 1–8, Q/E or the mouse wheel.

## Run locally

The game is plain HTML, CSS and JavaScript with no dependencies. It needs to be served over HTTP (the
sounds are fetched):

```sh
npm run build    # src/ -> index.html
npm run serve    # http://localhost:8000
```

Multiplayer goes through public MQTT brokers (HiveMQ, EMQX). Each active client sends the same state and
recent shots to both connected brokers at up to 8 messages/s, keeping below the backup broker's rate limit.
Two clients can play together as long as they share a reachable broker. Duplicate and older states are ignored.
A silent player and its bots disappear after 7 seconds; losing one broker does not remove a player.

The wire protocol uses `binrocket-sky/v2/` topics. Players must reload to this version to join each other;
older v1 pages are isolated because their events do not identify the round. Taken terrain cells are sent in a
rolling snapshot (one shared body per state), so late joins and reconnects recover holes after a full pass
through the map. Detached rubble is still simulated locally.

The public brokers do **not** authenticate player identities or enforce ownership of topics. Input validation,
collection limits, and round/sequence checks protect the client from malformed and stale messages; they do
not prevent impersonation or cheating. Do not treat lobby codes as private access credentials or scores as
trusted. Closing that trust boundary requires an authenticated broker with topic ACLs; authoritative game
rules additionally require a trusted server.

## Project structure

```
index.html        built page (what GitHub Pages serves) - do not edit, run the build
src/index.html    markup; the build puts the styles and script in place of <!-- @styles --> / <!-- @script -->
src/styles.css    all styling
src/js/           the game code, one file per section, joined in file-name order into one scope
  01-config.js         world size, levels, weapons, shot tables, modes, supplies, rounds
  02-helpers.js        maths and colour helpers, bin recolouring
  03-sky-art.js        stars, the Milky Way, galaxies, nebulae, far planets (placed per lobby)
  04-state-input.js    player state, keyboard / mouse / touch input
  05-sound.js          sound loading, mixing and synthesized fallbacks
  06-bodies.js         destructible planets, moons and wrecks: art, cell grids, craters, breaking apart
  07-modes.js          game modes, teams, CTF pads
  08-body-physics.js   gravity, bouncing, shots hitting bodies
  09-sparks-junk-health.js  shared pick-ups on the common clock, health bar
  10-effects.js        particles, explosions, deaths by weapon (sliced, fried, melted)
  11-weapons.js        firing, damage, rockets, rail, lightning, combos, nukes
  12-network.js        lobby, MQTT / Claude room transport, remote players and shots
  13-crates.js         weapon crates, nuke and Overdrive pick-ups
  14-ctf.js            capture-the-flag rules and drawing
  15-bots.js           bots
  16-announcer.js      announcer, kill streaks
  17-update.js         the per-frame simulation (flight with inertia, hits, pick-ups)
  18-draw.js           rendering
  19-events.js         world events: black hole, meteors, aliens, gold rain
  20-loop-hud.js       main loop, energy bar, mini map
  21-start.js          start screen, lobby and mode pickers
tools/build.mjs   the build
sfx/              sound effects (see sfx/CREDITS.txt)
bot.png           bin sprite
```

The files in `src/js/` are sections of one script, not separate modules: they share variables, and the
numeric prefixes set the order they run in.

### How the game code is organised

- **Data tables** (`01-config.js`): `SHOTS` (per shot kind `K.*`: life, damage, hit radius, crater, shove,
  sound), `WEAPONS` (per gun: shot pattern, recoil, feel, sound, muzzle fx, alt fire), `MODES` (rules:
  teams, flags, single gun, reload multipliers, instagib, supplies), `MAPS` (what fills the arena).
  A new gun, mode or map is mostly a new row here.
- **One firing path**: `volley(pilot, now, pattern, muzzle)` fires for the player and the bots alike.
- **One damage rule**: `canHurt(shot, target, id)` decides every hit, splash, blast, homing target and
  lightning jump (alive, not the shooter, not a teammate).
- **Frame = ordered systems**: `update()` calls `steerAndShoot`, `flyMe`, `updateShots`, `updateJunk`,
  `updateEvents`, `updateBots`, `ctfTick`, `updateRemotes`, `updatePickups`, `updateFx`, `netSend`;
  `draw()` paints layers back to front (`drawSky` ... `drawPilots` ... `drawScreenFx`).
- **Damage is decided by the victim**: each client reports the shot ids that hit it; shooters only show
  effects.

### Checking a change

`npm test` runs the network, round and terrain regression tests using Node's built-in test runner.
To check that the regressions fail against an earlier revision, use `TEST_REF=<commit> npm test`.

`BROWSER_PATH=/path/to/chrome npm run test:browser` runs the game in real headless Chrome (Node 22+).
It serves local assets and substitutes an in-process two-broker relay, with all external HTTPS requests
intercepted: no test traffic reaches public brokers. It checks two-window visibility with one broker offline,
late-join and reconnect terrain repair, round reset, the six-bot weapon/CTF smoke sequence, mobile rendering,
browser exceptions and packet sizes. This does not test the availability or latency of the public brokers.

Run `node tools/build.mjs --debug test.html`, serve it next to `sfx/`, and load `tools/smoke.js` in that page (see the comment at its top): it
fires every gun and alt fire, plays every death effect, runs bots and a CTF capture, and reports frame
times and errors.

## Credits

Sound effects are CC0 from OpenGameArt (Kenney, rubberduck, zer0sol), see `sfx/CREDITS.txt`. The railgun
sound was made by the game's author.
