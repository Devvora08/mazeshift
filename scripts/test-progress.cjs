/* Node checks of saved progress: records, checkpoints and run ownership, with
 * AsyncStorage replaced by an in-memory map (optionally slow, to test ordering). */
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

const disk = new Map();
let readDelay = 0;
const storage = {
  getItem: key => new Promise(resolve => setTimeout(() => resolve(disk.get(key) ?? null), readDelay)),
  setItem: async (key, value) => { disk.set(key, value); },
};
const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === '@react-native-async-storage/async-storage') return { __esModule: true, default: storage };
  return load.call(this, request, ...rest);
};

const { screenOwnsRun } = require('../lib/runGuard.ts');
const KEY = '@mazeshift/profile/v1';
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log('PASS ' + name); }
const settle = () => new Promise(resolve => setTimeout(resolve, 20));
function freshStore() {
  delete require.cache[require.resolve('../store/progressStore.ts')];
  return require('../store/progressStore.ts').useProgressStore;
}
const saved = () => JSON.parse(disk.get(KEY));

(async () => {
  await test('a screen only owns the run it loaded, on its own level', () => {
    assert.equal(screenOwnsRun({ runId: 4, level: { id: 3 } }, 4, 3), true);
    assert.equal(screenOwnsRun({ runId: 4, level: { id: 3 } }, null, 3), false, 'nothing loaded yet');
    assert.equal(screenOwnsRun({ runId: 4, level: { id: 3 } }, 4, 1), false, 'previous level still in the store');
    assert.equal(screenOwnsRun({ runId: 5, level: { id: 3 } }, 4, 3), false, 'a newer run replaced it');
  });

  await test('a zero or negative time never becomes a best time', async () => {
    disk.clear(); const store = freshStore(); await store.getState().hydrate();
    store.getState().startRun(2);
    store.getState().completeLevel(2, 0);
    assert.equal(store.getState().levels['2'].bestTimeMs, null);
    assert.equal(store.getState().levels['2'].completed, true);
    store.getState().completeLevel(2, 41000);
    store.getState().completeLevel(2, -5);
    store.getState().completeLevel(2, 0);
    assert.equal(store.getState().levels['2'].bestTimeMs, 41000);
    store.getState().completeLevel(2, 39000);
    assert.equal(store.getState().levels['2'].bestTimeMs, 39000);
    await settle(); assert.equal(saved().levels['2'].bestTimeMs, 39000);
  });

  await test('existing zero best times are repaired on launch and saved', async () => {
    disk.clear();
    disk.set(KEY, JSON.stringify({ version: 1, highestUnlockedLevel: 4, activeRun: null, premiumUnlocked: false,
      settings: { musicEnabled: true, soundEffectsEnabled: true, hapticsEnabled: true },
      levels: { 1: { completed: true, attempts: 3, deaths: 1, bestTimeMs: 0, lastCompletedAt: null },
        2: { completed: true, attempts: 1, deaths: 0, bestTimeMs: 52000, lastCompletedAt: null } } }));
    const store = freshStore(); await store.getState().hydrate(); await settle();
    assert.equal(store.getState().levels['1'].bestTimeMs, null);
    assert.equal(store.getState().levels['1'].attempts, 3, 'everything else is kept');
    assert.equal(store.getState().levels['2'].bestTimeMs, 52000);
    assert.equal(saved().levels['1'].bestTimeMs, null);
    assert.equal(saved().highestUnlockedLevel, 4);
  });

  await test('nothing is written before saved progress has loaded', async () => {
    disk.clear();
    const original = JSON.stringify({ version: 1, highestUnlockedLevel: 9, activeRun: null, premiumUnlocked: true,
      settings: { musicEnabled: true, soundEffectsEnabled: true, hapticsEnabled: true }, levels: {} });
    disk.set(KEY, original);
    readDelay = 50;
    const store = freshStore();
    const loading = store.getState().hydrate();
    store.getState().setMusicEnabled(false); // tapped before the profile finished loading
    await settle();
    assert.equal(disk.get(KEY), original, 'the default profile must not overwrite real progress');
    await loading; readDelay = 0;
    assert.equal(store.getState().highestUnlockedLevel, 9);
    assert.equal(store.getState().premiumUnlocked, true);
    store.getState().setMusicEnabled(false); await settle();
    assert.equal(saved().settings.musicEnabled, false); assert.equal(saved().highestUnlockedLevel, 9);
  });

  await test('checkpoints only touch the active run of the same level', async () => {
    disk.clear(); const store = freshStore(); await store.getState().hydrate();
    store.getState().startRun(5);
    store.getState().checkpointRun(5, 12000);
    store.getState().checkpointRun(4, 99000);
    assert.equal(store.getState().activeRun.elapsedMs, 12000);
    store.getState().completeLevel(5, 30000);
    store.getState().checkpointRun(5, 31000);
    assert.equal(store.getState().activeRun, null, 'a finished run is never revived by a late checkpoint');
  });

  console.log(checks + ' progress checks passed.');
})().catch(error => { console.error(error); process.exit(1); });
