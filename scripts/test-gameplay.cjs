// Includes the existing monster regressions and their TypeScript Node loader.
const { fixture, monster, p, travel, test, checkCount } = require('./test-monsters.cjs');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { LEVELS } = require('../lib/levels/data.ts');
const { generateWorld } = require('../lib/maze/world.ts');
const { edgeKey, posKey } = require('../lib/maze/graph.ts');
const { createRng } = require('../lib/maze/rng.ts');
const { scrambleMaze, eligibleEdgeCount, assertMazeIsFair } = require('../lib/maze/scramble.ts');
const { scrambleWorld } = require('../lib/modules/scramble/logic.ts');
const { nextStep, cellKey, distanceField, BOMB_FUSE_MS } = require('../lib/modules/monsters/navigation.ts');
const { tickMonsters, breakWall } = require('../lib/modules/monsters/logic.ts');
const { applyDestroy } = require('../lib/modules/utilities/logic.ts');
const { triggerTraps } = require('../lib/modules/utilities/effects.ts');
const { useGameStore: store } = require('../store/gameStore.ts');
const state = () => store.getState();
const diff = (a, b) => [...a].filter(e => !b.has(e)).length + [...b].filter(e => !a.has(e)).length;
function configure(world = fixture(8)) {
  state().loadLevel(18);
  store.setState({ world, heroCell: world.blocks[0].maze.start, currentBlockId: world.startBlockId,
    monsters: [], pickups: new Map(), facing: 'right' });
}
function advance(ms) { while (ms > 0) { const dt = Math.min(50, ms); state().tick(dt); ms -= dt; } }
function completeStep() {
  const t = state().heroTravel; assert(t);
  advance(Math.max(0, t.startedAt + t.duration - state().simulationTime));
  state().finishMove();
}

test('direct pursuit reduces displacement and Brute bombs repeatedly despite open detours', () => {
  const world = fixture(5, 3);
  world.blocks[0].maze.openEdges.delete(edgeKey(p(0).cell, p(1).cell));
  world.blocks[0].maze.openEdges.delete(edgeKey(p(1).cell, p(2).cell));
  assert.equal(nextStep(world, p(0), p(4, 2), 'phase').direction, 'right');
  assert.equal(nextStep(world, p(0), p(4, 2), 'bomb').direction, 'right');
  let result = tickMonsters(world, [monster('brute', p(0))], p(3), 0);
  assert(result.monsters[0].bomb);
  result = tickMonsters(result.world, result.monsters, p(3), BOMB_FUSE_MS);
  assert.deepEqual(result.monsters[0].travel.to, p(1));
  result = tickMonsters(result.world, result.monsters, p(3), BOMB_FUSE_MS + 400);
  assert(result.monsters[0].bomb);
  assert.deepEqual(result.monsters[0].bomb.target, p(2));
});

test('all enabled campaign blocks achieve the 70% change budget and remain fully connected', () => {
  let blocksChecked = 0;
  for (const level of LEVELS.filter(l => l.scramble.enabled)) {
    assert.equal(level.scramble.intensityRatio, 0.7); assert.equal(level.scramble.falseAlarmChance, 0);
    for (let seed = 1; seed <= 5; seed++) {
      const world = generateWorld(level.blocks, seed);
      const next = scrambleWorld(world, createRng(seed * 91), 0.7);
      next.blocks.forEach((block, i) => {
        assertMazeIsFair(block.maze);
        assert.equal(diff(world.blocks[i].maze.openEdges, block.maze.openEdges), Math.round(eligibleEdgeCount(world.blocks[i].maze) * 0.7));
        blocksChecked++;
      });
    }
  }
  console.log(`  Verified ${blocksChecked} block scrambles.`);
});

test('repeated 70% scrambles preserve destroyed and occupied passages without mutation', () => {
  let world = generateWorld(LEVELS[19].blocks, 719);
  const block = world.blocks[0];
  const a = p(0), neighbor = [...block.maze.activeCells].map(k => k.split(',').map(Number))
    .map(([x,y]) => p(x,y)).find(b => Math.abs(b.cell.x-a.cell.x)+Math.abs(b.cell.y-a.cell.y) === 1);
  assert(neighbor);
  world = breakWall(world, a, neighbor);
  const fixed = edgeKey(a.cell, neighbor.cell);
  const snapshot = new Set(world.blocks[0].maze.openEdges);
  for (let i = 0; i < 12; i++) {
    const old = world;
    world = scrambleWorld(world, createRng(i), 0.7, [travel(a, neighbor)]);
    assert(world.blocks[0].maze.openEdges.has(fixed));
    for (const b of world.blocks) assertMazeIsFair(b.maze);
    assert.notEqual(old.blocks[0].maze.openEdges, world.blocks[0].maze.openEdges);
  }
  assert(snapshot.has(fixed));
  const corridor = fixture(8).blocks[0].maze;
  const result = scrambleMaze(corridor, createRng(0), 5);
  assert.equal(result.changedEdges, 0); assertMazeIsFair(result.maze);
});

test('one countdown changes unvisited blocks and crossing a gateway does not reset it', () => {
  state().loadLevel(14);
  const s = state(), gateway = s.world.gatewaysByBlock.get(s.currentBlockId)[0];
  store.setState({ heroCell: gateway.fromCell, monsters: [] });
  const deadline = state().nextScrambleAt;
  assert(state().move(gateway.direction)); assert.equal(state().nextScrambleAt, deadline);
  const oldWorld = state().world;
  state().checkScramble(deadline);
  state().world.blocks.forEach((b,i) => assert(diff(b.maze.openEdges, oldWorld.blocks[i].maze.openEdges) > 0));
  assert(state().nextScrambleAt > deadline);
  state().loadLevel(8);
  const calm = state().world;
  state().checkScramble(Date.now() + 100000); assert.equal(state().world, calm);
});

test('each block gets every allowed charm, reachable and clear of entrances/guards; placement repeats on retry', () => {
  for (const level of LEVELS) {
    state().loadLevel(level.id);
    const s = state(), initial = [...s.pickups];
    assert.equal(s.pickups.size, level.utilities.length * s.world.blocks.length);
    const reachable = distanceField(s.world, { blockId: s.currentBlockId, cell: s.heroCell }, 'walk');
    for (const b of s.world.blocks) {
      const items = [...s.pickups].filter(([key]) => key.startsWith(b.id+':'));
      assert.deepEqual(items.map(([,type]) => type).sort(), [...level.utilities].sort());
      for (const [key] of items) {
        assert(reachable.has(key));
        assert.notEqual(key, b.id+':'+posKey(b.maze.start));
        assert.notEqual(key, b.id+':'+posKey(b.maze.end));
        assert(!s.monsters.some(m => cellKey(m.location) === key));
        assert(!(s.world.gatewaysByBlock.get(b.id) ?? []).some(g => key === b.id+':'+posKey(g.fromCell)));
      }
    }
    state().loadLevel(level.id); assert.deepEqual([...state().pickups], initial);
  }
  state().loadLevel(0); assert.equal(new Set(state().pickups.values()).size, 6);
});

test('campaign collection respects capacity and availability; scrambles do not respawn collected charms', () => {
  state().loadLevel(18);
  const [key, type] = [...state().pickups][0], [blockId, cell] = key.split(':'), [x,y] = cell.split(',').map(Number);
  store.setState({ currentBlockId: blockId, heroCell: {x,y}, monsters: [] });
  state().castSigil(type); assert.deepEqual(state().inventory, [type]); assert(!state().pickups.has(key));
  state().checkScramble(state().nextScrambleAt); assert(!state().pickups.has(key));
  const [otherKey, otherType] = [...state().pickups][0], [b,xy] = otherKey.split(':'), [xx,yy] = xy.split(',').map(Number);
  store.setState({ currentBlockId:b, heroCell:{x:xx,y:yy}, inventory:['phase','destroy'] });
  state().castSigil(otherType); assert(state().pickups.has(otherKey)); assert.equal(state().inventory.length,2);
  state().loadLevel(5); store.setState({ inventory:['shield'] });
  state().castSigil('shield'); assert.equal(state().shieldUntil,0); assert.deepEqual(state().inventory,['shield']);
});

test('Scramble charm changes every block immediately without resetting the timed schedule', () => {
  state().loadLevel(18); store.setState({ inventory:['scramble'], monsters:[], pickups:new Map() });
  const before = state().world, deadline = state().nextScrambleAt;
  state().castSigil('scramble');
  assert.equal(state().inventory.length,0); assert.equal(state().nextScrambleAt,deadline);
  state().world.blocks.forEach((b,i) => { assert(diff(b.maze.openEdges,before.blocks[i].maze.openEdges)>0); assertMazeIsFair(b.maze); });
  state().loadLevel(0); store.setState({ inventory:['scramble'], pickups:new Map() });
  const practice = state().world; state().castSigil('scramble');
  assert.notEqual(state().world,practice); assert.equal(state().nextScrambleAt,null);
});

test('Dash takes three 80ms checked steps then restores normal movement', () => {
  configure(); store.setState({ inventory:['dash'] }); state().castSigil('dash');
  for (let i = 1; i <= 3; i++) { assert.equal(state().heroCell.x,i); assert.equal(state().heroTravel.duration,80); completeStep(); }
  assert.equal(state().heroCell.x,3); assert.equal(state().simulationTime,240);
  assert.equal(state().inventory.length,0); assert.equal(state().isMoving,false);
  assert(state().move('right')); assert.equal(state().heroTravel.duration,200);
});

test('Dash rejects a blocked start without consuming a charm and stops at later walls', () => {
  configure(fixture(5,1,false)); store.setState({ inventory:['dash'] }); state().castSigil('dash');
  assert.deepEqual(state().inventory,['dash']); assert.equal(state().dashRemaining,0);
  const world=fixture(5); world.blocks[0].maze.openEdges.delete(edgeKey(p(1).cell,p(2).cell));
  configure(world); store.setState({ inventory:['dash'] }); state().castSigil('dash'); completeStep();
  assert.equal(state().heroCell.x,1); assert.equal(state().isMoving,false); assert.equal(state().dashRemaining,0);
});

test('Dash traverses gateways and cannot bypass lethal monster contact', () => {
  const world=generateWorld(LEVELS[7].blocks,118); configure(world);
  const gateway=world.gatewaysByBlock.get(world.startBlockId)[0];
  store.setState({ heroCell:gateway.fromCell, facing:gateway.direction, inventory:['dash'] });
  state().castSigil('dash'); assert.equal(state().currentBlockId,gateway.toBlockId); completeStep();
  configure(); store.setState({ inventory:['dash'], monsters:[monster('hunter',p(1))] });
  state().castSigil('dash'); advance(80); state().finishMove();
  assert.equal(state().caughtBy,'hunter'); assert.equal(state().dashRemaining,0);
});

test('Shield blocks contact for five simulation seconds, including the exact expiry boundary', () => {
  configure(); store.setState({ inventory:['shield'], monsters:[monster('hunter',p(0))] });
  state().castSigil('shield'); advance(4950);
  assert.equal(state().caughtBy,null); assert.equal(state().inventory.length,0);
  advance(50); assert.equal(state().caughtBy,'hunter');
});

test('Trap catches an approaching monster before death and allows the hero to escape', () => {
  configure(); store.setState({ inventory:['trap'], monsters:[{...monster('hunter',p(1)),travel:travel(p(1),p(0))}] });
  state().castSigil('trap'); advance(350);
  assert.equal(state().caughtBy,null); assert.equal(state().monsters[0].mode,'stunned'); assert.equal(state().traps.length,0);
  assert(state().move('right')); completeStep(); assert.equal(state().caughtBy,null);
  const until=state().monsters[0].stunnedUntil; advance(until-state().simulationTime);
  assert.notEqual(state().monsters[0].mode,'stunned');
});

test('Traps cancel bombs and suppress a trapped Stalker broadcast', () => {
  const trap={id:'test',location:p(0),expiresAt:15000};
  const brute={...monster('brute',p(0)),bomb:{target:p(1),startedAt:0,detonatesAt:1800}};
  assert.equal(triggerTraps([brute],[trap],0,50).monsters[0].bomb,null);
  const held=triggerTraps([monster('stalker',p(0))],[trap],0,50).monsters;
  assert.equal(tickMonsters(fixture(8),held,p(1),100).alert,false);
});

test('Trap expires unused, rejects duplicate placement, and all timed effects pause/reset', () => {
  configure(); store.setState({ inventory:['trap','trap','shield'] });
  state().castSigil('trap'); state().castSigil('trap'); assert.equal(state().traps.length,1); assert.equal(state().inventory.length,2);
  state().castSigil('shield'); const deadline=state().shieldUntil;
  state().setPaused(true); advance(15000); assert.equal(state().simulationTime,0); assert.equal(state().shieldUntil,deadline);
  state().setPaused(false); advance(15000); assert.equal(state().traps.length,0);
  state().loadLevel(18); assert.equal(state().shieldUntil,0); assert.equal(state().traps.length,0); assert.equal(state().dashRemaining,0);
});

test('Destroy spell openings remain permanent across heavy scrambling', () => {
  const world=fixture(3,2); world.blocks[0].maze.openEdges.delete(edgeKey(p(0).cell,p(1).cell));
  const edge=edgeKey(p(0).cell,p(1).cell);
  let maze=applyDestroy(world.blocks[0].maze,{edge,neighbor:p(1).cell});
  for(let i=0;i<20;i++) { maze=scrambleMaze(maze,createRng(i),Math.round(eligibleEdgeCount(maze)*0.7)).maze; assert(maze.openEdges.has(edge)); assertMazeIsFair(maze); }
});

const largest=generateWorld(LEVELS[19].blocks,77), started=performance.now();
scrambleWorld(largest,createRng(7),0.7);
console.log('Largest-level scramble calculation: '+(performance.now()-started).toFixed(1)+' ms on this machine (excludes rendering).');
console.log(checkCount()+' total gameplay/monster checks passed.');
