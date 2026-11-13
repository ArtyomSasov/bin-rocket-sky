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

Bots (2, 4 or 6, three skill levels) join any mode and play its rules.

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

Multiplayer goes through public MQTT brokers (HiveMQ, EMQX), so two browser tabs on the same lobby code
already play together.

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

## Credits

Sound effects are CC0 from OpenGameArt (Kenney, rubberduck, zer0sol), see `sfx/CREDITS.txt`. The railgun
sound was made by the game's author.
