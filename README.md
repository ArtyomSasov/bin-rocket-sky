# Bin Rocket Sky

A browser multiplayer space shooter: you fly a turquoise bin-rocket, blast other bins, chip planets and
wrecks apart and collect weapons.

**Play online:** [Open Bin Rocket Sky](https://artyomsasov.github.io/bin-rocket-sky/).

**Download:** [Latest release — standalone HTML game](https://github.com/ArtyomSasov/bin-rocket-sky/releases/latest/download/bin-rocket-sky.html).
Save the file and open it in a browser to play offline with bots. To play together online, open the site
and share the same lobby code with friends.

For local development, run `npm run build` and `npm run serve`, then open http://localhost:8000.
GitHub Pages publishes the built files from the root of `main`; run the build before pushing gameplay changes.

## Modes

Pick a mode when you create a lobby; the lobby code carries it, so friends who join with the code get the same game.

| Mode | What it is |
|---|---|
| Deathmatch | Everyone for themselves, most kills in a 5-minute round wins |
| Team Deathmatch | Red against Blue, no friendly fire, team kills count |
| Capture the Flag | Take the enemy flag from their pad to yours while your own flag is home |
| Nukes only | Everyone has unlimited nukes and nothing else |
| Railgun instagib | Unlimited railguns, one hit kills |
| Test range | Every gun at once with endless ammo, to try them all; uses the same fixed keys as matches |

Use **Random look** below the centered pilot preview to randomize all five appearance choices. The look is saved in this browser.

Small drifting asteroids exchange momentum with the bin on collision: speed increases the push, while larger asteroids resist it. The changed trajectory is shared with other players and lasts until that asteroid respawns. Hard impacts still chip the asteroid.

Bots (a slider from 0 to 24, three skill levels) join any mode and play its rules. Only the lobby's host (whoever made the
code, remembered in that browser) brings bots; players who join with the code play with the host's.

Rounds start with the full selected duration when the lobby is created. Guests adopt that lobby clock. Reaching the score limit starts a 15-second results screen immediately. Each new round clears captures, scores, combat receipts and temporary pickups.

## Offline against bots

Pick **Offline with bots** on the New game tab to play alone against bots, with any mode, map and length. Nothing
is sent or announced and nobody can join. The slider is respected offline too: 0 means an empty practice arena. Opening the page as `?offline`
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
saves `bin-rocket-sky.html` (built by `npm run build` with the sounds, sprite and QR libraries
inside, see `vendor/`). Send it over Nearby Share, AirDrop or Bluetooth; it opens in a browser with no internet
and joins a local room. (Android opens local HTML files well; on an iPhone, open the site once online instead.)

**Playing without internet** needs the game on each device first: open the page once while online (or add it
to the home screen). A service worker (`sw.js`, built from `src/sw.js` with the file list) keeps the page,
sounds and QR libraries, so it opens and plays offline afterwards.
The QR libraries are served with the game and cached on installation. Changes to sounds, images or
libraries also refresh the offline cache; opening the standalone download keeps the cached home page intact.

## Arena balance

No combat progression: every pilot has 100 HP and the same size, from the first spawn to the last.
Health Pack heals 20 up to 100; Vial heals 5 and Big Keg heals 100 up to 199.
Thigh Pads hold 50 armor (50% absorption); Body Armor holds 100 (75%); Shield Belt holds 150 (100%).
Armor refills its own layer instead of stacking repeatedly. Belt replaces other layers; total armor caps at 150.
Death clears armor and carried weapons; confirmed kills display the victim's name separately from announcements.
See [source parameters, adaptations and complete weapon table](WEAPON-BALANCE.md).

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
both CTF bases) are equal. The space layouts live in `src/js/world/arenas.js`; the station plans live in `src/js/world/stations.js` (routes and building beside it: `station-routes.js`, `station-build.js`).

| Map | Layout |
|---|---|
| Foundry | An industrial station with three connected routes, a contested reactor, mirrored bases, cross-corridors and permanent walls; no ambient space junk or world events, but combat debris remains |
| Cargo Deck | A station: a ring corridor round a pillared cargo hall, a cross through the middle and four store rooms; crates, drums and glass partitions break into pieces under fire |
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
every spot. Foundry has fixed mirrored weapon/supply pads and central Overdrive, without nuke or holy-bomb pickups. Its permanent shell blocks rails, splash damage, shock combos and secondary discharges. Each space map keeps its signature weapon pool; Large and Huge maps add repeated pads from that pool. Nuke and Holy Bomb pads are restricted to Large/Huge space maps (or their explicit special modes).

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
- **Scoreboard:** hold Tab to see every player and bot; release to hide. The Scores button toggles it on touchscreens. The round clock stays in its own top row; the wrapping status/weapon panel sits below it.
- **Weapons:** fixed 1–9, 0; Alt+1–6 for extended slots; Q/E cycles carried weapons. Right mouse button or C uses alternate fire.
- **Laser pistol:** starting gun with unlimited ammo, instant accurate red beams; alternate fire is faster with a wider spread.
- **Rocket launcher:** primary fires one straight rocket. Hold alternate fire to load one rocket every 0.45 seconds, up to three; release to launch exactly that many. Switching, death or round end cancels without spending ammo.
- **Minigun:** Stinger UT3 baseline: 14 HP hitscan at 10 shots/s; alternative fires large 38 HP projectiles every 0.28 s. Each mode uses its supplied UT loop, followed by winddown.
- **Pulse Gun:** rapid green plasma bolts; alternate fire holds a short green beam that stops at cover. One ammo per bolt or beam tick.
- **Flak Cannon:** eight ricocheting fragments; alternate fires a lofted shell that explodes for up to 70 HP and releases five fragments on impact or landing. Both modes cost one ammo; ricochets lose damage.
- **Ripper:** straight discs ricochet off walls; alternate discs explode on contact. No automatic return or Recall.
- **Shock orb:** ball travels continuously at a slower 650 px/s for easier combos; alternate beam detonates an orb for a combo; separate supplied firing, beam and combo recordings.
- **Quake weapons:** Grenade launcher (bouncing grenades; alt three-grenade volley), Gauntlet (melee; alt Lunge). Nailgun has been removed from play; its old number key remains reserved.
- **Railgun:** 80 HP per primary shot, 1.8-second recovery; no alternate fire. Instagib mode keeps its one-hit rule.
- **Remote commands:** mines and Demonic Orb retain their command slots after the last shot until their projectiles expire.
- **Trophies:** the gun a pilot dies with drops where it died, with its ammo, for 15 s; anyone can take it.

## Run locally

The game is plain HTML, CSS and JavaScript with no dependencies. It needs to be served over HTTP (the
sounds are fetched):

```sh
npm run build    # src/ -> index.html
npm run serve    # http://localhost:8000
```

Multiplayer goes through public MQTT brokers (HiveMQ, EMQX). Each active client sends the same state and
recent shots to both connected brokers at up to 8 state messages/s. The immediate-shot channel is capped
at 8 small messages/s; automatic-fire rounds between these events still ride the state journal.
Two clients can play together as long as they share a reachable broker. Duplicate and older movement states are ignored.
A silent player and its bots disappear after 7 seconds; losing one broker does not remove a player.

Shots use an immediate channel plus a repeated state journal. IDs deduplicate both broker deliveries;
reordered movement packets can still recover an unseen shot. Incoming hitscan checks a short local
position history (up to 250 ms of compensation), cleared on teleports, death and respawn.
Fast linear rounds (bullets, nails, spikes, pellets and slugs) sweep the target's piecewise movement history;
received rounds catch up at most 250 ms, with terrain blocking the swept path. Explosives and ricochets
retain their local flight simulation. Combat receipts are sent in every state, recovered even from reordered
movement packets, and credited once per victim. Shot timestamps reject expired journal entries. Hit feedback
waits for the victim's confirmation. Kills are credited per shot **and victim**, including piercing and
explosion multi-kills. Remote prediction stops after 250 ms without fresh movement.

This is still peer-to-peer, with health owned by the victim (bots by their host), not an authoritative
server. Compensation helps hitscan and fast linear rounds under ordinary latency; it cannot remove long outages or make
all projectile and moving-terrain simulations identical between clients.

The wire protocol uses `binrocket-sky/v19/` topics. Players must reload to this version to join each other;
older pages are isolated (v2–v14 use older maps, clocks or gameplay; v1 events do not identify the round). Taken terrain cells are sent in a
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
src/js/           the game code, one folder per domain (see "How the game code is organised")
  build-order.json     the order the files run in (the build and the server both read it)
  core/                config, helpers, state, the frame (update, loop)
  world/               arenas, stations, bodies (art, craters, chunks, breaking up), physics, junk, world events
  weapons/             the gun table, firing, hits, beams, projectiles, blasts, bombs, the Blood Blade, the arsenal
  pilots/              flight, numbered flight commands, bots, players' guns on the server
  match/               rules and modes, rounds, pick-ups, health and armour, damage, CTF, the announcer
  net/                 lobbies (MQTT), peers, the local room (WebRTC), the game-server client, snapshot deltas
  render/              sky, terrain, shots, bins, effects, decals, deaths, the WebGL light pass
  audio/               mixer, sound pack, cues, the synthesized jet engine and blade
  ui/                  input, gamepad, HUD, start screen, chat
test/             node tests, one file per domain (npm test); test/helpers load the whole game as the server does
tools/            the build, the browser end-to-end suite, the lab (tools/lab.mjs), map shots, the hit-registration probe
tools/build.mjs   the build (also writes sw.js, the offline cache, from src/sw.js)
manifest.webmanifest  lets the game be added to a home screen
sfx/              sound effects (see sfx/CREDITS.txt)
sfx/pack/         the author's sound pack: weapons/ (a Quake III-style weapons tree) and voice/ (announcer lines).
                  audio/pack.js matches each file to a game event by its path or a word in its name; where the pack
                  has a sound it plays instead of the built-in one. The build lists them in sfx/pack/index.json
bot.png           bin sprite
```

The files in `src/js/` are sections of one script, not separate modules: they share variables and run in the
order `src/js/build-order.json` lists them (a section may use constants of an earlier one while it loads). A new
file goes into its domain's folder and into that list, after what it needs at load time.

### How the game code is organised

- **Data tables** (`core/config.js`, `weapons/catalog.js`, `match/rules.js`): `SHOTS` (per shot kind `K.*`: life, damage, hit radius, crater, shove,
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

`npm test` runs the node tests in `test/`, one file per domain of the game: maps, weapons, combat, flight, match,
net, server, audio, offline. They load the whole game as the server does (`test/helpers/game.cjs`) and check
how it plays: every gun fires and hurts, a shot is judged where the shooter saw the target, the server flies a
player's commands exactly as their screen does, rounds and score limits, snapshot deltas over a lossy link, peers
sending nonsense, every map's pick-ups. A test describes a behaviour of the game, never the text of a file or one
particular fix. The server tests need its dependencies (`cd server && npm ci`).

`BROWSER_PATH=/path/to/chrome npm run test:browser` runs end-to-end checks in real headless Chrome (Node 22+): two
browsers over an in-process two-broker relay (no test traffic reaches public brokers), late join and terrain
repair after a lost connection, delayed shots and duplicate suppression, the six-bot smoke run, HUD layout from
320 to 1920 px, a phone viewport, every sound decoding, and no browser errors.

`node tools/lab.mjs [guns]` fires each gun at still targets and reports damage, kills and sounds (FX=1 for effect
frames); `node tools/mapshot.mjs <code>` photographs a map; `GUN=… node tools/hits.mjs` plays two browsers through a
local game server and compares the hits shown with the server's (DROP=1: cut every connection and check each page
comes back to its own pilot).

## Credits

Generic and additional effects are CC0 from OpenGameArt (Kenney, rubberduck, zer0sol, bart). Added recorded announcer lines from **Warlord** and **Dragon** by **VoiceBosch** are **CC BY-SA 4.0**; original files are unchanged. The existing user-supplied weapon/voice pack retains its own provenance. The railgun sound was made by the game's author. See `sfx/CREDITS.txt` and the credits files under `sfx/pack/`.

## Audio and visual effects update

The existing generic sound files are attributed to CC0 authors, not documented as AI-generated.
The `sfx/pack/ut` set is copied byte-for-byte from the author's BIN GAME SOUND folder.
Enforcer, rockets, Ripper, Nuke, Minigun, Flak Cannon, Shock orb, Pulse Gun and weapon draw use it.
Grenades keep their Quake sounds; Demonic Orb keeps the supplied Demonic Shot and Demonic Explosions.
Fight always waits for `voice/fight.mp3` (Q3); it cannot fall back to the old bundled voice.
Movement combines Rocket Engine by theMinesAreShakin (CC0) and Jet Engine Takeoff by dklon (CC BY 3.0).
WarpDrive_02 by Little Robot Sound Factory (CC BY 3.0) accents boost/dash. Credits and exact edits are in `sfx/pack/engine/CREDITS.txt`.
There is no constant combat compression or weapon EQ; a peak guard acts only near overload.
Thrust bypasses announcer ducking. Minigun and Pulse Gun use their authored loop recordings.
Up to six nearby projectiles have positional flight loops, stopped when the projectile disappears.
A standalone listening page is available at `audio-preview.html` (rebuild with `node tools/build-audio-preview.mjs`).
Boost, dash, teleport, respawn, warnings, shield transitions
and power-down have sample feedback. Metal collisions use three recorded cast-iron impacts; larger
ship blasts use Explosion Rumb; Nuke/Holy Bomb choose between Massive Explosion and Explosive Nuke or Holy Bomb. Quiet atmosphere and saw loops
complete the mix. The engine is enabled by default and can be disabled in Settings.

The existing First Blood, Flawless Victory and other supplied announcer lines remain. Additional recorded
lines cover the three main modes, Unstoppable, round victory and defeat. Speech is serialized at its
original pitch and ducks combat sounds. Custom events without a matching spoken recording use a cue
and text; browser speech synthesis is not used. See `sfx/AUDIO-AUDIT.md` for coverage, remaining procedural
fallbacks and sources. Decoder checks do not substitute for listening on speakers/headphones.

Hull banking, nozzle flames and particle origins share one transform. Front and side thrusters occupy fixed
mounts, the main engine can deflect slightly, and exhaust inherits ship velocity. Emission budgets and particle
drag are based on elapsed time. Hot particles cool through yellow/orange/red; cached smoke lobes expand and
rotate. Lightning topology refreshes every 45 ms instead of changing with display FPS. Low FX quality retains
reduced particle budgets and skips extra shock diamonds/arcs. No additional bitmap assets are needed.



## Weapon measurements

Settings → **Export weapon match stats** downloads local JSON for the current browser session.
Rows separate map, size, mode, round, player/bot, level, weapon and primary/alt fire.
They include volleys, network shot records (before pellet expansion), ammo cost, equipped seconds,
validated damage/hit events/kills, and separate peer hit/kill confirmations. Shot IDs retain weapon
attribution after switching weapons. No analytics are uploaded. Counters are bounded in memory.
Damage is measured for this player's targets simulated here and hosted bots; remote damage is not
estimated from nominal weapon values. Do not add peer confirmations to validated hit events.
Bots still do not reproduce most alt-fire, player shielding or both minigun modes; their results are
stability/coverage evidence, not an equal PvP balance study. See `WEAPON-IMPLEMENTATION.md`.

The minigun uses long glowing travelling tracers while its hit detection stays instantaneous; Scatter Gun pellets are real projectiles in a loose cloud, so their damage lands when they arrive.
Demonic Orb controls a visible 280 px zone: one active orb, 6 HP pulses every 0.45 s, and manual detonation up to 80 HP.
Armor pickups have distinct vest / pads / belt shapes; Foundry has extra mirrored vests, and older maps have extra pads.
