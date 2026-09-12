/* Deterministic Node checks of the actual TS runtime, without a native simulator. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
require.extensions['.png'] = (module, filename) => { module.exports = filename; };
const { edgeKey } = require('../lib/maze/graph.ts');
const { generateWorld } = require('../lib/maze/world.ts');
const { createRng } = require('../lib/maze/rng.ts');
const { scrambleMaze } = require('../lib/maze/scramble.ts');
const { LEVELS } = require('../lib/levels/data.ts');
const { spawnMonsters, tickMonsters, touches, breakWall } = require('../lib/modules/monsters/logic.ts');
const { cellKey, sameCell, graphFor, nextStep, distanceField, detectionDistances, TRACK_RADIUS, MONSTER_STEP_MS, BOMB_FUSE_MS } = require('../lib/modules/monsters/navigation.ts');
const { MONSTER_SHEETS } = require('../lib/sprites/monsterFrames.ts');
const { useGameStore } = require('../store/gameStore.ts');
let checks = 0;
function test(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
const p = (x, y = 0, blockId = 'b0') => ({ blockId, cell: { x, y } });
function fixture(width, height = 1, open = true) {
  const world = generateWorld([{ width, height, shape: 'rect' }], 7);
  // Fixture ignores generated shape labels and explicitly builds a rectangle.
  const maze = world.blocks[0].maze;
  maze.activeCells = new Set(); maze.openEdges = new Set();
  maze.start = { x: 0, y: 0 }; maze.end = { x: width - 1, y: height - 1 };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    maze.activeCells.add(`${x},${y}`);
    if (open && x + 1 < width) maze.openEdges.add(edgeKey({ x, y }, { x: x + 1, y }));
    if (open && y + 1 < height) maze.openEdges.add(edgeKey({ x, y }, { x, y: y + 1 }));
  }
  return world;
}
function monster(type, location, id = type) {
  return { id, type, location, facing: 'down', travel: null, bomb: null, blast: null,
    mode: 'roam', lastKnown: null, patrolTarget: null, patrolSequence: 0 };
}
function travel(from, to, startedAt = 0, duration = 400) { return { from, to, startedAt, duration }; }

test('16 five-frame sheets: exact PNG dimensions, nonoverlapping bounded crops, fixed cycle height', () => {
  for (const directions of Object.values(MONSTER_SHEETS)) for (const sheet of Object.values(directions)) {
    const png = fs.readFileSync(sheet.asset);
    assert.equal(png.readUInt32BE(16), sheet.imageWidth);
    assert.equal(png.readUInt32BE(20), sheet.imageHeight);
    assert.equal(sheet.frames.length, 5);
    for (const [i, f] of sheet.frames.entries()) {
      assert(f.x >= 0 && f.y >= 0 && f.width > 0 && f.height > 0);
      assert(f.x + f.width <= sheet.imageWidth && f.y + f.height <= sheet.imageHeight);
      assert.equal(f.height, sheet.frames[0].height);
      assert.equal(f.y, sheet.frames[0].y);
      if (i) assert(sheet.frames[i - 1].x + sheet.frames[i - 1].width <= f.x);
    }
  }
  assert.equal(MONSTER_SHEETS.hunter.left.frames.length, 5);
  assert.equal(MONSTER_SHEETS.hunter.right.frames.length, 5);
  assert.equal(MONSTER_SHEETS.stalker.left.frames.length, 5);
  assert.equal(MONSTER_SHEETS.stalker.right.frames.length, 5);
  assert.equal(MONSTER_SHEETS.brute.left.frames.length, 5);
  assert.equal(MONSTER_SHEETS.brute.right.frames.length, 5);
  assert.equal(MONSTER_SHEETS.hunter.left.sizeMultiplier, 1.2);
  assert.equal(MONSTER_SHEETS.hunter.right.sizeMultiplier, 1.2);
  assert.equal(MONSTER_SHEETS.stalker.left.sizeMultiplier, 1.2);
  assert.equal(MONSTER_SHEETS.stalker.right.sizeMultiplier, 1.2);
});

test('walkers detour; Ghost and Brute choose direct pursuit through walls', () => {
  const world = fixture(3, 2);
  world.blocks[0].maze.openEdges.delete(edgeKey(p(0).cell, p(1).cell));
  assert.equal(nextStep(world, p(0), p(2), 'walk').direction, 'down');
  assert.equal(nextStep(world, p(0), p(2), 'phase').direction, 'right');
  assert.equal(nextStep(world, p(0), p(2), 'bomb').direction, 'right');
  const sealed = fixture(2, 1, false);
  assert.equal(nextStep(sealed, p(0), p(1), 'walk'), null);
  assert.equal(nextStep(sealed, p(0), p(1), 'bomb').wall, true);
  assert.equal(distanceField(sealed, p(1), 'bomb').get(cellKey(p(0))), 1);
});

test('every generated gateway can be traversed both ways; masks cannot be phased out of', () => {
  const world = generateWorld(LEVELS[13].blocks, 343);
  for (const gateways of world.gatewaysByBlock.values()) for (const g of gateways) {
    const a = { blockId: g.fromBlockId, cell: g.fromCell }, b = { blockId: g.toBlockId, cell: g.toCell };
    for (const mobility of ['walk', 'phase', 'bomb']) assert.equal(nextStep(world, a, b, mobility).to, cellKey(b));
    assert.equal(detectionDistances(world, a).get(cellKey(b)), 1);
  }
  for (const links of graphFor(world).links.values()) for (const link of links) assert(graphFor(world).cells.has(link.to));
});

test('multi-block route reaches target, and new wall topology invalidates cached fields', () => {
  const world = generateWorld(LEVELS[13].blocks, 129);
  let at = { blockId: world.startBlockId, cell: world.blocks[0].maze.start };
  const target = { blockId: world.endBlockId, cell: world.blocks.at(-1).maze.end };
  let steps = 0;
  const expected = distanceField(world, target, 'walk').get(cellKey(at));
  while (!sameCell(at, target) && steps < 10000) {
    const link = nextStep(world, at, target, 'walk'); assert(link && !link.wall);
    at = graphFor(world).cells.get(link.to); steps++;
  }
  assert.equal(steps, expected);
  const sealed = fixture(2, 1, false);
  assert.equal(nextStep(sealed, p(0), p(1), 'walk'), null);
  const opened = breakWall(sealed, p(0), p(1));
  assert.equal(nextStep(opened, p(0), p(1), 'walk').direction, 'right');
  assert.equal(sealed.blocks[0].maze.openEdges.size, 0);
});

test('distinct radius boundaries; all four types have identical step duration', () => {
  for (const type of ['hunter', 'wraith', 'brute', 'stalker']) {
    const world = fixture(20);
    const radius = TRACK_RADIUS[type];
    let result = tickMonsters(world, [monster(type, p(radius))], p(0), 0);
    assert.equal(result.monsters[0].mode, 'chase');
    assert.equal(result.monsters[0].travel.duration, 400);
    result = tickMonsters(world, [monster(type, p(radius + 1))], p(0), 0);
    assert.equal(result.monsters[0].mode, 'roam');
    assert.equal(result.monsters[0].lastKnown, null);
  }
});

test('Stalker broadcasts across blocks, releases outside radius, no live tracking after loss', () => {
  const world = generateWorld(LEVELS[13].blocks, 453);
  const hero = { blockId: world.startBlockId, cell: world.blocks[0].maze.start };
  const far = { blockId: world.endBlockId, cell: world.blocks.at(-1).maze.end };
  let result = tickMonsters(world, [monster('stalker', hero), monster('wraith', far)], hero, 0);
  assert(result.alert);
  assert.deepEqual(result.monsters[1].lastKnown, hero);
  const movedHero = { blockId: world.blocks[1].id, cell: world.blocks[1].maze.start };
  // Keep the Stalker stationary at its original position for this detection assertion.
  result = tickMonsters(world, [monster('stalker', hero), result.monsters[1]], movedHero, 50);
  assert.equal(result.alert, false);
  assert.deepEqual(result.monsters[1].lastKnown, hero);
  assert.equal(result.monsters[1].mode, 'search');
});

test('Brute waits entire fuse, opens real passage, and scrambles never reseal it', () => {
  let world = fixture(2, 1, false);
  let result = tickMonsters(world, [monster('brute', p(0))], p(1), 0);
  assert(result.monsters[0].bomb); assert.equal(result.monsters[0].travel, null);
  result = tickMonsters(result.world, result.monsters, p(1), BOMB_FUSE_MS - 1);
  assert.equal(result.world.blocks[0].maze.openEdges.size, 0);
  result = tickMonsters(result.world, result.monsters, p(1), BOMB_FUSE_MS);
  assert(result.world.blocks[0].maze.openEdges.has(edgeKey(p(0).cell, p(1).cell)));
  assert(result.monsters[0].travel); assert(result.monsters[0].blast);
  for (let seed = 0; seed < 30; seed++) {
    const scrambled = scrambleMaze(result.world.blocks[0].maze, createRng(seed), 10).maze;
    assert(scrambled.openEdges.has(edgeKey(p(0).cell, p(1).cell)));
  }
  assert.equal(breakWall(world, p(0), p(8)), world);
});

test('continuous contact handles stationary, head-on, shared junction, and gateway swaps', () => {
  assert(touches(p(0), null, p(0), null, 0, 50));
  assert(!touches(p(0), null, p(1), null, 0, 50));
  assert(touches(p(0), travel(p(0), p(1)), p(1), travel(p(1), p(0)), 150, 250));
  assert(!touches(p(0), travel(p(0), p(1)), p(1), travel(p(1), p(0)), 0, 50));
  assert(touches(p(0), travel(p(0), p(1)), p(1, 1), travel(p(1, 1), p(1)), 350, 400));
  const a = p(0, 0, 'b0'), b = p(10, 8, 'b1');
  assert(touches(a, travel(a, b), b, travel(b, a), 150, 250));
  assert(!touches(p(0), travel(p(0), p(1)), p(0, 1), travel(p(0, 1), p(1, 1)), 0, 400));
});

test('campaign spawns match allowed types, are safely distant, and Practice is empty', () => {
  for (const level of LEVELS) {
    const world = generateWorld(level.blocks, level.id * 104729);
    const spawned = spawnMonsters(world, level.monsters);
    assert.equal(spawned.length, level.monsters.length ? world.blocks.length : 0);
    const start = { blockId: world.startBlockId, cell: world.blocks[0].maze.start };
    const distances = distanceField(world, start, 'phase');
    for (const m of spawned) {
      assert(level.monsters.includes(m.type));
      assert(distances.get(cellKey(m.location)) > 8);
      assert(graphFor(world).cells.has(cellKey(m.location)));
    }
  }
  useGameStore.getState().loadLevel(0);
  assert.equal(useGameStore.getState().monsters.length, 0);
});

test('caught state blocks input/spells/ticks; retry resets; pause freezes simulation', () => {
  const store = useGameStore;
  store.getState().loadLevel(8);
  let s = store.getState();
  store.setState({ monsters: [monster('hunter', { blockId: s.currentBlockId, cell: s.heroCell })] });
  s.tick(50); assert.equal(store.getState().caughtBy, 'hunter');
  assert.equal(store.getState().move('right'), false);
  const dead = store.getState(); dead.tick(50); assert.equal(store.getState().simulationTime, dead.simulationTime);
  dead.castSigil('phase'); assert.equal(store.getState().feedback, dead.feedback);
  dead.loadLevel(8); assert.equal(store.getState().caughtBy, null);
  assert.equal(store.getState().heroTravel, null);
  store.getState().setPaused(true);
  const paused = store.getState(); paused.tick(50); assert.equal(store.getState().simulationTime, paused.simulationTime);
  assert.equal(store.getState().move('right'), false);
  paused.setPaused(false); store.getState().tick(50); assert.equal(store.getState().simulationTime, 50);
});

test('hero movement unlocks only on slide completion; death wins over exit arrival', () => {
  const store = useGameStore; store.getState().loadLevel(8);
  const world = fixture(3);
  store.setState({ world, currentBlockId: 'b0', heroCell: p(0).cell, monsters: [], simulationTime: 0 });
  assert(store.getState().move('right'));
  for (let i = 0; i < 4; i++) store.getState().tick(50);
  assert(store.getState().isMoving);
  store.getState().finishMove(); assert(!store.getState().isMoving);
  store.setState({ monsters: [monster('stalker', p(2))] });
  assert(store.getState().move('right'));
  for (let i = 0; i < 4; i++) store.getState().tick(50);
  store.getState().finishMove();
  assert.equal(store.getState().caughtBy, 'stalker'); assert.equal(store.getState().reachedExit, false);
});

test('seeded walker routes agree with independent BFS before and after scrambling', () => {
  for (let seed = 1; seed <= 40; seed++) {
    let world = generateWorld(LEVELS[10].blocks, seed);
    if (seed % 2 === 0) world = { ...world, blocks: world.blocks.map(b => ({ ...b,
      maze: scrambleMaze(b.maze, createRng(seed + b.index), 15).maze })) };
    const graph = graphFor(world), target = { blockId: world.endBlockId, cell: world.blocks.at(-1).maze.end };
    const queue = [cellKey(target)], bfs = new Map([[cellKey(target), 0]]);
    for (let i = 0; i < queue.length; i++) for (const link of graph.links.get(queue[i])) {
      if (link.wall || bfs.has(link.to)) continue;
      bfs.set(link.to, bfs.get(queue[i]) + 1); queue.push(link.to);
    }
    const field = distanceField(world, target, 'walk');
    assert.equal(field.size, bfs.size);
    for (const [key, value] of bfs) assert.equal(field.get(key), value);
  }
});

test('runtime hunter journeys back through multiple blocks to last known hero location', () => {
  const world = generateWorld(LEVELS[7].blocks, 78);
  const target = { blockId: world.startBlockId, cell: world.blocks[0].maze.start };
  const start = { blockId: world.endBlockId, cell: world.blocks.at(-1).maze.end };
  let m = { ...monster('hunter', start), lastKnown: target };
  const visited = new Set([start.blockId]);
  for (let now = 0; now < 1000000 && !sameCell(m.location, target); now += MONSTER_STEP_MS) {
    m = tickMonsters(world, [m], target, now).monsters[0];
    visited.add(m.location.blockId);
    if (m.travel && m.travel.from.blockId === m.travel.to.blockId) {
      const block = world.blocks.find(b => b.id === m.travel.from.blockId);
      assert(block.maze.openEdges.has(edgeKey(m.travel.from.cell, m.travel.to.cell)));
    }
  }
  assert(sameCell(m.location, target)); assert.equal(visited.size, world.blocks.length);
});

test('Ghost crosses a wall without opening it; searching stops at last seen cell', () => {
  const world = fixture(3, 1, false);
  let m = tickMonsters(world, [monster('wraith', p(0))], p(2), 0).monsters[0];
  assert.deepEqual(m.travel.to, p(1)); assert.equal(world.blocks[0].maze.openEdges.size, 0);
  m = tickMonsters(world, [m], p(2), 400).monsters[0];
  assert.deepEqual(m.location, p(1)); assert.equal(world.blocks[0].maze.openEdges.size, 0);
  const open = fixture(20);
  const searcher = { ...monster('hunter', p(2)), mode: 'search', lastKnown: p(2) };
  const next = tickMonsters(open, [searcher], p(19), 0).monsters[0];
  assert.equal(next.lastKnown, null); assert.equal(next.mode, 'roam'); assert(next.patrolTarget);
});

test('scrambling preserves occupied passages and actor/gateway reachability', () => {
  const store = useGameStore;
  for (let seed = 0; seed < 25; seed++) {
    store.getState().loadLevel(14);
    const s = store.getState(), block = s.world.blocks[0];
    const from = { blockId: block.id, cell: block.maze.start };
    const link = graphFor(s.world).links.get(cellKey(from)).find(l => !l.wall);
    const to = graphFor(s.world).cells.get(link.to);
    store.setState({ heroTravel: travel(from, to), rng: createRng(seed), nextScrambleAt: 0 });
    store.getState().checkScramble(1);
    const updated = store.getState().world;
    if (from.blockId === to.blockId) assert(updated.blocks[0].maze.openEdges.has(edgeKey(from.cell, to.cell)));
    const field = distanceField(updated, from, 'walk');
    for (const m of store.getState().monsters) assert(field.has(cellKey(m.location)));
    for (const gateways of updated.gatewaysByBlock.values()) for (const g of gateways) {
      assert(field.has(cellKey({ blockId: g.fromBlockId, cell: g.fromCell })));
    }
  }
});

console.log(`${checks} monster checks passed.`);
module.exports = { fixture, monster, p, travel, test, checkCount: () => checks };
