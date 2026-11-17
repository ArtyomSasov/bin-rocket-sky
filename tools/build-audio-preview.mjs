// Standalone listening comparison using the production mixer and minigun player.
import { readFileSync, writeFileSync } from 'node:fs';
const sound = readFileSync('src/js/05-sound.js', 'utf8');
const mixer = sound.slice(sound.indexOf('  function createSoundMix'), sound.indexOf('  // a big room'));
const continuous = readFileSync('src/js/05c-continuous-audio.js', 'utf8');
const burstPlayer = continuous.slice(0, continuous.indexOf('  function continuousAudioTick'));
const loops = sound.slice(sound.indexOf('  function packLoop('), sound.indexOf('  document.addEventListener("visibilitychange"'));
const files = {
  engine: 'engine/jet-thrust.wav', warp: 'engine/warp-dash.wav',
  shard: 'ut/shard-cannon-fire.wav', demonic: 'user/demonic-shot.wav',
  enforcer: 'ut/default-weapon-fire.wav', rocket: 'ut/rocket-launcher-fire.wav', fight: 'voice/fight.mp3',
  p_ut_mini_fire: 'ut/minigun-regfire.wav', p_ut_mini_alt: 'ut/minigun-altfire.wav', p_ut_mini_stop: 'ut/minigun-winddown.wav',
  p_ut_pulse_fire: 'ut/pulse-gun-fire.wav', p_loop_laser: 'ut/pulse-gun-bolt.wav', p_stop_laser: 'ut/pulse-gun-down.wav'
};
const data = Object.fromEntries(Object.entries(files).map(([k, p]) => [k, 'data:' + (p.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav') + ';base64,' + readFileSync('sfx/pack/' + p).toString('base64')]));
writeFileSync('audio-preview.html', `<!doctype html><html lang="ru"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Bin Rocket Sky — звук</title>
<style>body{background:#101820;color:#e6f2f5;font:17px system-ui;max-width:760px;margin:60px auto;padding:24px}button{font:inherit;padding:14px;margin:6px;border:1px solid #579ca3;border-radius:8px;background:#1b343e;color:white;cursor:pointer}a{color:#85e1d9}small{color:#a6b7bd}#status{min-height:2em}</style>
<h1>Тяга, варп и оружие</h1><p>Тяга звучит 5 секунд. На третьей секунде включается ускорение с варп-рывком.</p>
<button data-play="engine">Тяга → ускорение</button><button data-play="minigun">Миниган · 2 секунды</button>
<button data-play="minigun-alt">Миниган ALT</button><button data-play="pulse">Pulse Gun</button><button data-play="pulse-alt">Pulse Gun ALT</button><button data-play="enforcer">Enforcer</button><button data-play="rocket">Rocket launcher</button><button data-play="fight">Fight · Q3</button><button data-play="shard">Flak Cannon</button><button data-play="demonic">Demonic Orb</button><button id="stop">Остановить</button><p id="status" aria-live="polite">Выбери звук.</p>
<p><a href="index.html">Вернуться в игру</a></p><small>Тяга: <a href="https://opengameart.org/content/rocket-engine">theMinesAreShakin</a> (CC0), <a href="https://opengameart.org/content/jet-engine-takeoff">dklon</a> (CC BY 3.0), обработаны и сведены. Варп: <a href="https://opengameart.org/content/sci-fi-sound-effects-library">Little Robot Sound Factory</a> (<a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a>), обрезан. Оружие: файлы автора игры.</small>
<script>
const files=${JSON.stringify(data)};
${mixer}
let audio=null, sfxBus=null, engineBus=null, timer=null, finish=null, generation=0;
const me={x:0,y:0}, packBuf={}, packLoops={};
const SOUND_OVERRIDE={};
const packHas=ev=>!!packBuf[ev]?.length;
function packPlay(ev,vol){if(!audio||!packHas(ev))return;const s=audio.createBufferSource(),g=audio.createGain();s.buffer=packBuf[ev][0];g.gain.value=vol;s.connect(g).connect(sfxBus);s.start();}
${loops}
${burstPlayer}
function stop(){generation++;clearInterval(timer);clearTimeout(finish);firingSounds.clear();for(const k of Object.keys(packLoops))delete packLoops[k];if(audio)audio.close();audio=null;document.querySelector('#status').textContent='Остановлено.';}
document.querySelector('#stop').onclick=stop;
document.querySelectorAll('[data-play]').forEach(button=>button.onclick=async()=>{
  stop();const token=generation, ctx=audio=new AudioContext(), bus=createSoundMix(ctx);sfxBus=bus.effects;engineBus=bus.engine;
  const mode=button.dataset.play;document.querySelector('#status').textContent='Загрузка…';
  try {
    const decoded=Object.fromEntries(await Promise.all(Object.entries(files).map(async([key,url])=>[key,await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer())])));
    if(token!==generation)return;for(const [k,b] of Object.entries(decoded))packBuf[k]=[b];await ctx.resume();
    const play=(name,volume,target=bus.effects,at=ctx.currentTime,loop=false)=>{const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=decoded[name];s.loop=loop;g.gain.value=volume;s.connect(g).connect(target);s.start(at);return {s,g};};
    document.querySelector('#status').textContent=button.textContent;
    if(mode==='engine'){
      const t=ctx.currentTime,{s,g}=play('engine',0,bus.engine,t,true);g.gain.linearRampToValueAtTime(.425,t+.15);g.gain.setValueAtTime(.425,t+2);g.gain.linearRampToValueAtTime(.585,t+2.15);g.gain.setValueAtTime(.585,t+4);g.gain.linearRampToValueAtTime(0,t+5);s.playbackRate.setValueAtTime(1.04,t);s.playbackRate.linearRampToValueAtTime(1.14,t+2.2);s.stop(t+5);play('warp',.65,bus.engine,t+2);
    }else if(mode.startsWith('minigun')||mode.startsWith('pulse')){
      const weapon=mode.startsWith('minigun')?'minigun':'laser',alt=mode.endsWith('-alt');continuousFire('me',weapon,0,0,performance.now(),alt);timer=setInterval(()=>continuousFire('me',weapon,0,0,performance.now(),alt),90);finish=setTimeout(()=>{clearInterval(timer);stopContinuous('me');},2000);
    }else play(mode,mode==='fight'?1:.9,mode==='fight'?bus.voice:bus.effects);
  }catch(e){if(token===generation)document.querySelector('#status').textContent='Не удалось воспроизвести: '+e.message;}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
</script></html>`);
console.log('wrote audio-preview.html (standalone, production mixer and UT loops)');
