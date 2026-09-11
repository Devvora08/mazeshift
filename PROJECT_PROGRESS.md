# MazeShift — Project Progress

Updated: 2026-09-11

This is a snapshot of the current source code and work completed so far. A feature listed in a level configuration is not necessarily implemented at runtime; those distinctions are recorded below.

## Current state

MazeShift has a playable maze-navigation foundation, animated hero movement, connected maze blocks, configurable timed scrambling, visible rotating wall transitions, a spell-practice area, and four animated monster types with pursuit and death/retry gameplay. The circular D-pad and magical drawing effects are implemented. Four spell effects, campaign pickup placement, and persistent progression remain unfinished.

## Implemented gameplay

### Maze generation and navigation

- Seeded procedural maze generation, making a level's initial layout reproducible.
- Rectangular, plus, diamond, octagon, and L-shaped maze masks.
- Multi-block worlds with gateways between blocks and movement in both directions through links.
- Four-direction, cell-based movement with wall checks.
- Smooth hero position interpolation and camera pans between blocks.
- Animated exit radar and basic exit-reached text feedback during normal movement.
- A home screen listing Practice and 20 configured levels across four chapters.
- Boss markers in the level list where configured; these are metadata, not implemented boss encounters.

### Hero sprites and movement fixes

- Idle, up, down, left, and right sprite animations.
- Five frames for idle/up/down/left; eight frames for the replacement right-facing sheet.
- Frame advancement moved from JavaScript intervals to the UI frame clock.
- Each sprite sheet stays paired with its own frame coordinates, avoiding incorrect crops during direction changes.
- Transparent vertical padding excluded from frame bounds for more consistent size and baseline across directions.
- Five- and eight-frame run cycles use the same overall cycle duration.
- Movement chains from the actual slide-completion callback, replacing competing movement timers that caused pauses.
- Completion is attached to the moving axis so an unchanged axis cannot prematurely unlock the next step.
- Short retries remain for a held direction blocked by a wall.
- Active movement keeps its facing/run animation through the end of a step.

### Circular D-pad

- Sleek black circular outline with transparent background retained.
- Arrow buttons separated into explicit cross-layout slots.
- Raised button faces with animated depression and spring return.
- Purple glow on press and light haptic feedback.
- Center indicator animates toward the held direction.
- Overlapping button presses/releases track the most recently held direction.
- Direction buttons include accessibility labels.

### Scramble module and visible wall movement

- Scrambling is configurable per level: enabled state, interval range, intensity, and false-alarm probability.
- Scheduled scrambles affect the current block.
- Wall closures are rejected if they disconnect the maze's start from its exit. This is not a guarantee that every cell remains reachable after every scramble.
- Countdown and short scramble/false-alarm feedback are displayed in the game HUD.
- The previous wall crossfade has been replaced with approximately 1.05-second physical-looking transitions.
- Changed walls are paired by proximity, preferring shared corners for hinge rotations.
- Paired walls slide/rotate while retaining their length; unmatched walls fold in or out when wall counts differ.
- A small stagger makes changes readable; unchanged walls remain stationary.
- Duplicate internal wall segments are removed from rendering.
- Interrupted transitions start from their currently displayed geometry.
- Wall animation runs on the UI thread and is isolated in its own renderer and geometry module.
- These are visual transitions: the logical maze changes when the scramble is applied, rather than using collision against continuously rotating geometry.

## Monsters — implemented 2026-09-11

- Four runtime types: Hunter, Ghost (`wraith` in existing level data), Brute, and Stalker. Older `watcher` entries were replaced with Stalker and duplicate entries removed.
- One guard per maze block, cycling through the level's allowed types. Guards spawn at/near the block's outgoing gateway or final exit, at least nine wall-independent cell steps from the initial hero position. Practice and levels 1–7 remain monster-free.
- All four have a 400 ms movement step (2.5 cells/sec nominal); the hero retains its 200 ms step. Bomb preparation is an additional delay, not a faster/slower walking speed.

| Type | Detection radius | Behavior |
| --- | --- | --- |
| Hunter | 7 cells | Follows open corridors and gateways; no powers. |
| Ghost | 3 cells | Can cross interior walls, but not inactive mask cells or exterior boundaries. Uses gateways between blocks. Does not alter walls. |
| Brute | 7 cells | Chooses routes by travel time, including a 1.8-second bomb fuse for each wall shortcut. Pauses with a visible bomb tell before opening the passage; these openings remain usable by everyone and cannot be resealed by scrambling. |
| Stalker | 4 cells | Walks through corridors like Hunter and is lethal on contact. While it detects the hero, broadcasts the hero's position to every monster across the level regardless of their own radius. Broadcast ends when no Stalker detects the hero. |

- Detection uses cell proximity ignoring interior walls, respecting shape masks and actual gateway links. It is not visual line-of-sight. Detection along a monster's moving edge is interpolated.
- Monsters pursue while detection is available, investigate the last known position after detection is lost, then choose reachable patrol destinations. A lost Stalker broadcast does not keep supplying live hero positions; another monster can still detect the hero using its own radius.
- Binary-heap reverse Dijkstra fields support wall-aware, phasing, and bomb-cost routes across the entire world. Fields are shared between matching pursuers, bounded in memory, and invalidated when the immutable world changes.
- All 16 directional PNG strips have five frames. Source dimensions and 80 crop rectangles were checked; individual frame bounds avoid Hunter's baked-in separator artifacts. Each direction uses a fixed vertical crop, baseline, and scale. Decoded images remain paired with their own coordinates, with one UI frame clock per monster.
- Continuous graph-space contact handles head-on swaps, shared junctions, and gateway crossings, without killing through an adjacent solid wall. All four monsters cause death on contact. Bomb effects open walls; no extra area damage is implemented.
- Death stops movement/casting/scrambling and presents Retry / Back to levels. Retry regenerates the level and clears monster, bomb, alert, inventory, and movement state. Reaching the final exit freezes the encounter and offers the same navigation controls. Persistent unlocking/next-level progression is still pending.
- Backgrounding or leaving the game pauses simulation and input, freezes actor movement, and shifts the next scramble deadline on resume. Scrambles preserve edges in use and reject closures that would isolate an actor or gateway.

## Spells and practice

### Implemented spell infrastructure

- Six single-stroke sigil templates and a recognizer that normalizes position, scale, and rotation.
- Drawing overlay shared by all spells.
- On release, the original stroke points are passed to recognition as one snapshot.
- Pickup acquisition by standing on a matching pickup and drawing its sigil.
- Inventory capacity, item consumption for successful implemented casts, and inventory-count display.
- Feedback for acquisition, full inventory, unavailable spells, missing walls, and successful casts.
- Pulsing colored pickup markers.

### Spell status and shapes

| Spell | Drawing shape | Current effect status |
| --- | --- | --- |
| Phase | Sideways S / smooth wave | Implemented: moves the hero through the interior wall directly ahead. |
| Destroy | W-like zigzag, down–up–down–up | Implemented: permanently opens the interior wall directly ahead. |
| Scramble | Outward spiral, approximately 1.4 turns | Shape and recognition defined; player-cast effect not implemented. Timed level scrambling is a separate working feature. |
| Dash | Lightning bolt, starting bottom-left and ending upper-right | Shape and recognition defined; effect not implemented. |
| Shield | U-shaped arc | Shape and recognition defined; effect not implemented. |
| Trap | Downward stem followed by an almost-complete curled loop | Shape and recognition defined; effect not implemented. |

### Practice level

- Level ID `0`, accessible from the home screen.
- One rectangular 12 × 14 maze block.
- Timed scrambling disabled and no enemies configured.
- Phase and Destroy pickups placed using BFS visitation order so they are initially reachable.
- Inventory capacity of six.
- Pickup generation currently runs only for Practice. Campaign `utilities` lists do not yet cause campaign pickups to spawn.

### Magical drawing visuals

- Replaced the solid 4-pixel brush stroke with a 2-pixel purple line and 0.75-pixel luminous core.
- Soft violet halo and a gently pulsing fingertip light.
- Drifting purple dust and small four-point twinkling sparks.
- Particle emission spaced along the gesture rather than directly tied to refresh rate.
- Stroke fades over approximately 580 ms after release, with lingering particles.
- Particle lifetimes are approximately 420–900 ms, with a hard cap of 80 particles.
- Particle updates run on the UI thread and stop doing particle work when the effect is empty.
- Release particles are cosmetic and do not imply that a spell was successfully cast.

## Modular architecture

Level configuration composes maze block plans, scramble settings, monster types, allowed utility types, inventory capacity, and optional boss metadata. The structure supports enabling features per level, but each module still needs its own runtime implementation.

| Area | Main files |
| --- | --- |
| Home and level selection | `app/index.tsx` |
| Game screen and input orchestration | `app/game/[id].tsx` |
| Game state, movement, inventory, casts | `store/gameStore.ts` |
| Level configuration and block plans | `lib/levels/data.ts`, `lib/levels/types.ts`, `lib/levels/blockPlans.ts` |
| Practice configuration and pickups | `lib/levels/practice.ts` |
| Maze generation, shapes, world, graph | `lib/maze/` |
| World, camera, hero, exit, pickup rendering | `components/WorldCanvas.tsx` |
| Wall rendering and transition geometry | `components/BlockWalls.tsx`, `lib/maze/wallMotion.ts` |
| Timed scramble rules | `lib/modules/scramble/` |
| Hero sheet bounds and frame clock | `lib/sprites/heroFrames.ts`, `hooks/useSpriteLoop.ts` |
| Direction controller | `components/DPad.tsx` |
| Sigil capture and magical drawing | `components/SigilCanvas.tsx` |
| Cosmetic spell particles | `lib/sprites/spellParticles.ts` |
| Spell types, templates, recognition, wall effects | `lib/modules/utilities/` |
| Monster state, spawning, navigation, detection, bombs, contact | `lib/modules/monsters/` |
| Monster sprite frames and UI-thread rendering | `lib/sprites/monsterFrames.ts`, `components/MonsterSprite.tsx` |
| Repeatable monster verification | `scripts/test-monsters.cjs` (`npm run test:monsters`) |

## Defined or present, but not yet implemented

- Further monster balance and broader device/performance testing. The user approved the monster implementation after the Expo test handoff; runtime enemies and sprite mapping are implemented.
- Player-cast Scramble, Dash, Shield, and Trap effects.
- Campaign pickup placement and enforcement of campaign utility availability through the full gameplay loop.
- Boss encounters beyond configured flags and home-screen markers.
- Persistent progress, saves, level unlocking, and a next-level flow. Basic win/death/retry navigation is implemented.
- Audio playback and sound design; an audio dependency is installed, but gameplay audio is not wired in.
- Purchases/paywalls: free/paid pack boundaries are mentioned in level-plan comments, but purchase behavior is not implemented.

## Validation and delivery history

- User tested and approved the sprite smoothness, circular controller, magical spell visuals, and wall-scramble presentation during development.
- TypeScript checks and Expo Babel/worklet compilation passed for the changed code.
- Targeted checks covered five/eight-frame loops, slide completion in all directions, cancelled slides, particle bounds/expiry, and immutable particle updates.
- Wall-motion checks covered 150 seeded scramble scenarios, exact starting/ending geometry, fixed-length hinge rotation, interrupted transitions, unequal wall counts, and start-to-exit reachability.
- Earlier targeted checks were development scripts outside the repository. The monster work adds `scripts/test-monsters.cjs` and the `test:monsters` package command.
- Monster validation: 15 check groups passed, covering all 16 PNG dimensions/80 bounded crops, campaign spawning, individual ranges, shared speed, weighted routes, reciprocal gateways, mask boundaries, Stalker broadcast/release, last-known search, bomb timing/permanence, continuous contact, death/retry/pause, hero completion ordering, 40 seeded BFS comparisons, and 25 scramble protection scenarios.
- TypeScript passed and the Android production JavaScript export bundled successfully with all monster assets. Hermes bytecode export was blocked by Windows denying execution of the installed `hermesc.exe`; the successful bundle used `--no-bytecode`. The agent did not perform an emulator/device playtest.
- Expo was started for the user's own testing. The user subsequently approved the result and requested delivery to `main` on 2026-09-11. Test entry points: level 8 (Hunters), level 10 (Hunters/Brutes), level 11 (Hunters/Ghosts), and level 14 (all four types).
- This validation is not a comprehensive device, performance, or release test suite.
- Commit `9019f85`, **Fix sprite animation and upgrade movement, spell, and scramble UI**, was pushed to `main` on `https://github.com/Devvora08/mazeshift`.
- The approved monster delivery includes this progress document, monster assets, and repeatable tests. Planned commit message: **Implement four animated monsters with cross-block pursuit and abilities**. Commit/push is pending because this session's execution environment denied Git metadata writes (`.git/index.lock`).

## Development setup

- Expo SDK 57, React Native 0.86.3, React 19.2.3, TypeScript.
- Skia rendering, Reanimated/worklets, Gesture Handler, Zustand, and NativeWind.
- Paper-and-ink UI with handwritten fonts and purple interaction effects.
- Run `npm start` from the project root for Expo; `npm run android` invokes the native Android run command.
- Follow the root `AGENTS.md`: consult the exact Expo SDK 57 documentation before code changes.

## Suggested next milestones

1. Continue tuning monster range, spawn density, bomb tells, and movement feel based on playtest feedback.
2. Implement and test the four remaining spell effects.
3. Add campaign pickup placement tied to each level's utility configuration.
4. Build completion/retry/progression persistence and define behavior during wall transitions.
5. Add spell guidance, gameplay audio, and broader device/performance testing.
