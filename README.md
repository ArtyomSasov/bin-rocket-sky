# Bin Rocket Sky

A browser multiplayer space shooter: you fly a turquoise bin-rocket, blast other bins, chip planets and
wrecks apart and collect weapons.

**Play:** the repository is private, so GitHub Pages is off: run it locally (`npm run build && npm run serve`, then
http://localhost:8000) or open the one-file game `bin-rocket-sky.html`.

## Modes

Pick a mode when you create a lobby; the lobby code carries it, so friends who join with the code get the same game.

| Mode | What it is |
|---|---|
| Deathmatch | Everyone for themselves, most kills in a 5-minute round wins |
| Team Deathmatch | Red against Blue, no friendly fire, team kills count |
| Capture the Flag | Take the enemy flag from their pad to yours while your own flag is home |
| Nukes only | Everyone has unlimited nukes and nothing else |
| Railgun instagib | Unlimited railguns, one hit kills |
| Test range | Every gun at once with endless ammo and 99 teleport jumps, to try them all (9 and 0 pick the 9th and 10th gun) |

Use **Random look** below the centered pilot preview to randomize all five appearance choices. The look is saved in this browser.

Small drifting asteroids exchange momentum with the bin on collision: speed and bin size/level increase the push, while larger asteroids resist it. The changed trajectory is shared with other players and lasts until that asteroid respawns. Hard impacts still chip the asteroid.

Bots (2, 4 or 6, three skill levels) join any mode and play its rules. Only the lobby's host (whoever made the
code, remembered in that browser) brings bots; players who join with the code play with the host's.

## Offline against bots

Pick **Offline with bots** on the New game tab to play alone against bots, with any mode, map and length. Nothing
is sent or announced and nobody can join. If you picked "No bots", 4 bots fly. Opening the page as `?offline`
starts there without even loading the multiplayer library, and when that library can't be loaded (no
connection) the game switches to offline by itself.

## Local room (no internet)

Devices in one place play together over the same Wi-Fi, with no internet: a phone hotspot is enough (on many
Android phones it works without mobile data). Pick **Local room** on the New game tab:

- **Host:** pick the game and take off. A QR code appears (later: "+ Add player nearby").
- **Guest:** tap "Join a room nearby", scan the host's code, then let the host scan the code on your screen.

The two codes carry a WebRTC handshake (only local-network addresses), so the browsers connect to each other
directly; the host relays every pilot's state, and its bots join everyone. No camera? Copy and paste the codes.

**Someone has no internet and never opened the game?** On the start screen, "Download the game as one file"
saves `bin-rocket-sky.html` (about 2 MB, built by `npm run build` with the sounds, sprite and QR libraries
inside, see `vendor/`). Send it over Nearby Share, AirDrop or Bluetooth; it opens in a browser with no internet
and joins a local room. (Android opens local HTML files well; on an iPhone, open the site once online instead.)

**Playing without internet** needs the game on each device first: open the page once while online (or add it
to the home screen). A service worker (`sw.js`, built from `src/sw.js` with the file list) keeps the page,
sounds and QR libraries, so it opens and plays offline afterwards.

## Levels

XP comes from kills (10, plus 3 for each level the victim is above you, and a bounty on the crown), sparks,
stars, planets and flags. Every level adds a perk and they stack: 2 faster energy, 3 double dash, 4 twin
fireballs, 5 magnet, 6 the shield regrows out of combat, 7 piercing fireballs, 8 a teleport jump on every
respawn, 9 more health, 10 **the crown** (+25% damage, a gold ring on everyone's mini map). Health grows from
3 to 5 lives. Dying costs two levels. Bots level up the same way.

## Your own server

By default players meet through free public MQTT brokers (HiveMQ, then EMQX). They are shared with the
world, so ping can jump. With your own broker close to your players it is steadier:

```sh
cd server
DOMAIN=game.example.com docker compose up -d     # a domain pointing at this machine, ports 80/443 open
```

Then open the game as `https://artyomsasov.github.io/bin-rocket-sky/?broker=wss://game.example.com/mqtt`
(everyone in a lobby must use the same broker). `server/` holds Mosquitto (WebSockets) behind Caddy, which
fetches the TLS certificate itself. The game shows each player's ping in the scoreboard.

The game logic stays in the browsers (damage is decided by whoever is hit); the broker only relays messages.

## Finding a game

The start screen's "Join" tab lists the games running right now (mode, map, size, pilots and bots); click one
to join. Every running lobby announces itself every few seconds on a shared topic of the public MQTT broker the
game already uses, so there is no server of our own; a lobby disappears from the list ~13 s after it goes quiet.

## Maps

Also picked with a new lobby (and carried in its code), on top of the map size. Every map is hand-laid and always
the same, in every lobby, so it can be learned. Each layout is mirrored through the centre, so both halves (and
both CTF bases) are equal. The layouts live in `src/js/01b-arenas.js`.

| Map | Layout |
|---|---|
| Twin Worlds | Two ringed giants and two ice worlds; two towers form a gate round an open centre with Overdrive |
| The Ring | A ring of asteroids round the centre with four gates, rock clusters in two corners |
| Drydocks | Rows of moored hulls above and below, ring stations either side of a small moonbase |
| Downtown | Two blocks of towers, the main street between the bases, a fallen hull in the middle |
| Orrery | A sun in the middle, giants with moons, two hot little worlds on the axis |
| The Tip | A landfill hill in the middle, a convoy of refuse trucks, skips and bales round the edge |
| Duel | Almost empty: two ice pillars between the bases |

**Weapons and supplies lie on fixed spots.** Each spot always holds the same gun (or medkit, shield, Overdrive,
nuke, holy bomb) and keeps it until someone takes it: nothing expires. A taken one comes back at the start of
that spot's next cycle (20 s for most guns, 26–45 s for the strong ones, 20 s for supplies, 60–95 s for the
power-ups). The empty pad shows what comes back and the countdown. The mini map shows the arena's outline and
every spot. Every map has every gun: its own layout places its signature ones, the rest go into its widest gaps
(always the same places). Large and Huge maps add a few more bodies and spots.

**Boost pads** (glowing rings with running chevrons, arrows on the mini map) fling whoever flies over them their
way. **Gravity slingshot:** skimming fast along a planet's rim adds speed. Bots fly by the same flight model as
players (they face where they steer, so they make attack runs, break off and loop back) and use both.

## Controls

- **Move:** WASD or arrows; on a phone, the joystick. The bin has inertia: push the other way or hold **X** to brake.
- **Aim (mouse):** the gun follows the cursor wherever you fly; the crosshair is the cursor and the view leans
  toward it. Shots keep only the bin's speed along their own line, so they go where you point. Settings →
  Mouse → Steers brings back the old way (hold the button to fly toward the pointer).
- **Mouse capture:** after take-off the mouse is captured like in a shooter: no system cursor, the mouse moves
  only the crosshair. Esc lets it go; a click on the game takes it back.
- **Fire:** the left mouse button, Space, F, J or Enter (or the fire button).
- **Boost / dash:** hold Shift to boost, tap it to dash.
- **Brake / drift:** hold X to brake; X with a direction drifts (you slide on while the nose swings round).
- **Scoreboard:** the arrow by the gear folds it to the timer and your own row; hold Tab to see everyone.
- **Weapons:** 1–9, 0 or Q/E (not the mouse wheel: a touch-surface mouse scrolls by accident). **Alt fire:** right mouse button or C — every gun has one: laser
  pulse (shoves), minigun burst (no spin-up, overheats), railgun charge (hold up to 1.1 s, let go: a wide blue slug, up to 150%), flak (bursts into eight
  shards), shock beam (combo on your orb), gamma detonate, rocket salvo, shotgun slug, thrown mine, saw fan.
- **Quake's three:** the Nailgun (a fan of seven nails that fly far; alt a piercing Spike), the Grenade launcher
  (grenades bounce off rock and go off after 2.5 s or on a bin; alt three at once) and the Gauntlet everyone carries
  (hold fire: the blade spins and tears into a bin within reach; alt a Lunge). Quad damage multiplies by 4.
- **Trophies:** the gun a pilot dies with drops where it died, with its ammo, for 15 s; anyone can take it.
- **Teleporter:** T throws the beacon, T again jumps onto it (a pick-up gives three jumps).

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

The wire protocol uses `binrocket-sky/v11/` topics. Players must reload to this version to join each other;
older pages are isolated (v2–v10 built different maps, guns or levels, v1 events do not identify the round). Taken terrain cells are sent in a
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
  01b-arenas.js        the hand-made map layouts: bodies, gun and supply spots
  02-helpers.js        maths and colour helpers, bin recolouring, world event timing
  03-sky-art.js        stars, the Milky Way, galaxies, nebulae, far planets (placed per lobby)
  04-state-input.js    player state, keyboard / mouse / touch input
  05-sound.js          sound loading, mixing and synthesized fallbacks
  06-bodies.js         destructible planets, moons and wrecks: art, cell grids, craters, breaking apart
  07-modes.js          game modes, teams, CTF pads
  08-body-physics.js   gravity, bouncing, shots hitting bodies
  09-sparks-junk-health.js  shared pick-ups on the common clock, health bar
  10-effects.js        particles, explosions, deaths by weapon (sliced, fried, melted)
  11-weapons.js        firing, damage, rockets, rail, lightning, combos, nukes and the holy bomb
  12-network.js        lobby, MQTT / Claude room transport, remote players and shots
  12b-lan.js           the local room: WebRTC between devices nearby, QR-code handshake
  13-crates.js         the fixed spots: weapon crates, supplies, nuke / holy bomb and Overdrive
  14-ctf.js            capture-the-flag rules and drawing
  15-bots.js           bots
  16-announcer.js      announcer, kill streaks
  17-update.js         the per-frame simulation (flight with inertia, hits, pick-ups)
  18-draw.js           rendering
  19-events.js         world events: black hole (pulls in planets, wrecks, junk and pick-ups), meteors, aliens, gold rain
  20-loop-hud.js       main loop, energy bar, mini map (pilots only)
  21-start.js          start screen, lobby and mode pickers
tools/build.mjs   the build (also writes sw.js, the offline cache, from src/sw.js)
manifest.webmanifest  lets the game be added to a home screen
sfx/              sound effects (see sfx/CREDITS.txt)
sfx/pack/         the author's sound pack: weapons/ (a Quake III-style weapons tree) and voice/ (announcer lines).
                  05-sound.js matches each file to a game event by its path or a word in its name; where the pack
                  has a sound it plays instead of the built-in one. The build lists them in sfx/pack/index.json
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
