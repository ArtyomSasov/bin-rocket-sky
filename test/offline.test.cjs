const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync, cpSync, mkdtempSync, appendFileSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { execFileSync } = require('node:child_process');
const root = resolve(__dirname, '..');

function worker() {
  const scope = 'https://example.github.io/bin-rocket-sky/';
  const prefix = 'brs-' + scope + '-';
  const stores = new Map(), handlers = {};
  const key = r => new URL(typeof r === 'string' ? r : r.url, scope).href;
  const cache = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
      match: async r => entries.get(key(r))?.clone(),
      put: async (r, response) => entries.set(key(r), response.clone()),
      addAll: async files => { for (const file of files) entries.set(key(file), new Response(file)); },
    };
  };
  let offline = false;
  vm.runInNewContext(readFileSync(join(root, 'src/sw.js'), 'utf8').replace('__VERSION__', 'test').replace('__FILES__', '[]'), {
    URL, Response,
    self: { registration: { scope }, location: new URL(scope + 'sw.js'),
      addEventListener: (name, fn) => { handlers[name] = fn; }, skipWaiting() {}, clients: { claim() {} } },
    caches: { open: async name => cache(name), keys: async () => [...stores.keys()], delete: async name => stores.delete(name) },
    fetch: async req => { if (offline) throw new Error('offline'); return new Response(new URL(req.url).pathname); },
  });
  return { stores, cache, prefix, scope, handlers, offline() { offline = true; }, async request(path, mode = 'navigate') {
    let result;
    handlers.fetch({ request: { url: new URL(path, scope).href, method: 'GET', mode }, respondWith(p) { result = p; } });
    return result;
  } };
}

test('visiting the standalone download does not overwrite the offline home page', async () => {
  const w = worker();
  await w.cache(w.prefix + 'test').put(w.scope + 'index.html', new Response('home'));
  await w.request('bin-rocket-sky.html');
  w.offline();
  assert.equal(await (await w.request('index.html?offline')).text(), 'home');
  assert.equal(await (await w.request('bin-rocket-sky.html')).text(), '/bin-rocket-sky/bin-rocket-sky.html');
  assert.equal((await w.request('missing.html')).type, 'error');
});

test('offline assets use the active cache and activation preserves other project caches', async () => {
  const w = worker();
  await w.cache(w.prefix + 'old').put(w.scope + 'bot.png', new Response('old sprite'));
  await w.cache(w.prefix + 'test').put(w.scope + 'bot.png', new Response('new sprite'));
  await w.cache('brs-https://example.github.io/other/-test').put(w.scope + 'bot.png', new Response('other project'));
  w.offline();
  assert.equal(await (await w.request('bot.png?v=1', 'cors')).text(), 'new sprite');
  let activation;
  w.handlers.activate({ waitUntil(p) { activation = p; } });
  await activation;
  assert.equal(w.stores.has(w.prefix + 'old'), false);
  assert.equal(w.stores.has('brs-https://example.github.io/other/-test'), true);
});

test('offline build includes local QR libraries and invalidates cache when asset contents change', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'brs-build-'));
  try {
    for (const path of ['src', 'tools', 'sfx', 'vendor', 'bot.png', 'holy.png', 'manifest.webmanifest']) {
      cpSync(join(root, path), join(fixture, path), { recursive: true });
    }
    const build = () => {
      execFileSync(process.execPath, [join(fixture, 'tools/build.mjs')]);
      return readFileSync(join(fixture, 'sw.js'), 'utf8');
    };
    let previous = build();
    const html = readFileSync(join(fixture, 'index.html'), 'utf8');
    const embedded = JSON.parse(html.match(/window\.BRS_PACK_FILES = (\[[^\n]*?\]);<\/script>/)[1]);
    assert.deepEqual(embedded, JSON.parse(readFileSync(join(fixture, 'sfx/pack/index.json'), 'utf8')));
    assert.match(previous, /"vendor\/qrcode.min.js"/);
    assert.match(previous, /"vendor\/jsQR.min.js"/);
    assert.equal(build(), previous, 'unchanged builds are reproducible');
    for (const path of ['bot.png', 'sfx/fire.wav', 'vendor/jsQR.min.js', 'src/sw.js']) {
      appendFileSync(join(fixture, path), '\n');
      const next = build();
      assert.notEqual(next.match(/const VERSION = "(.*?)"/)[1], previous.match(/const VERSION = "(.*?)"/)[1], path);
      previous = next;
    }
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});
