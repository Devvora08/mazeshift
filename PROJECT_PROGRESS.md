# MazeShift — Project Progress

Updated: 2026-09-12

This is a snapshot of the current source code and work completed so far. A feature listed in a level configuration is not necessarily implemented at runtime; those distinctions are recorded below.

## Current state

Performance follow-up (PERF-5): walls, ambient pickups/radar/traps, the hero, and monsters now render on isolated transparent Skia layers. A wall scramble no longer makes the hero Atlas or ambient effects redraw the wall geometry, and offscreen exit/trap effects are culled. Monster rendering retains its shallow visible-monster subscription. Hero directions remain bound to stable sheet/frame instances while only one Atlas and frame clock are active, eliminating direction-change crop glitches. Ambient pickup dust uses fixed geometry, SigilCanvas is memoized, and simulation polling remains at 50 ms. The user tested the sprite fix and isolated-layer build across multiple levels, confirmed the visual glitch is gone, and approved the subsequent sprite and spell changes on 2026-09-12. Broader measured device profiling remains pending.

MazeShift has a playable maze-navigation foundation, animated hero movement, connected maze blocks, configurable timed scrambling, visible rotating wall transitions, a spell-practice area, and four animated monster types with pursuit and death/retry gameplay. The circular D-pad and magical drawing effects are implemented. All six spell effects and campaign pickup placement are implemented. Persistent progression, audio, and boss encounters remain unfinished.

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
- Five frames for every direction. Left and right use the replacement `hero_left.png` and `hero_right.png` sheets.
- Frame advancement moved from JavaScript intervals to the UI frame clock.
- Each sprite sheet stays paired with its own frame coordinates, avoiding incorrect crops during direction changes.
- Transparent vertical padding excluded from frame bounds for more consistent size and baseline across directions.
- Every run direction uses the same overall cycle duration.
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
- Scheduled scrambles affect every block, including unvisited blocks, on one shared timer; crossing a gateway does not reset it.
- Every enabled campaign level targets 70% of eligible interior connections per scramble, with false alarms disabled. Disabled levels remain disabled.
- A connected backbone preserves reachability of every active cell. Permanent destroyed edges and occupied movement edges are excluded from the change budget. Bridge-only corridors can change less when required for safety.
- Countdown and whole-world scramble feedback are displayed in the game HUD. Offscreen blocks update without running invisible wall-transition animations.
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
| Ghost | 3 cells | Pursues directly using wall-independent shortest routes and displacement-based ties; phases through interior walls, but not inactive mask cells or exterior boundaries. Uses gateways between blocks without altering walls. |
| Brute | 7 cells | Pursues along wall-independent shortest routes rather than taking corridor detours. Bombs each blocking wall in succession with a visible 1.8-second fuse; openings remain usable by everyone and cannot be resealed by scrambling. |
| Stalker | 4 cells | Walks through corridors like Hunter and is lethal on contact. While it detects the hero, broadcasts the hero's position to every monster across the level regardless of their own radius. Broadcast ends when no Stalker detects the hero. |

- Detection uses cell proximity ignoring interior walls, respecting shape masks and actual gateway links. It is not visual line-of-sight. Detection along a monster's moving edge is interpolated.
- Monsters pursue while detection is available, investigate the last known position after detection is lost, then choose reachable patrol destinations. A lost Stalker broadcast does not keep supplying live hero positions; another monster can still detect the hero using its own radius.
- Binary-heap reverse Dijkstra fields support wall-aware walking routes and wall-independent phasing/bombing routes with displacement-based ties across the entire world. Fields are shared between matching pursuers, bounded in memory, and invalidated when the immutable world changes.
- All 16 directional PNG strips have five frames. Hunter and Stalker use the replacement `hunt_left/right` and `stalk_left/right` sheets; Brute uses the replacement `bomb_left/right` sheets. The four new Hunter/Stalker side animations have a tested 1.2× visual-size correction while retaining their foot anchor and gameplay collision. Source dimensions and crop rectangles are validated, each direction uses a fixed vertical crop/baseline, and decoded images remain paired with their own coordinates and UI frame clock.
- Continuous graph-space contact handles head-on swaps, shared junctions, and gateway crossings, without killing through an adjacent solid wall. All four monsters cause death on contact. Bomb effects open walls; no extra area damage is implemented.
- Death stops movement/casting/scrambling and presents Retry / Back to levels. Retry regenerates the level and clears monster, bomb, alert, inventory, and movement state. Reaching the final exit freezes the encounter and offers the same navigation controls. Persistent unlocking/next-level progression is still pending.
- Backgrounding or leaving the game pauses simulation and input, freezes actor movement, and shifts the next scramble deadline on resume. Scrambles preserve edges in use and reject closures that would isolate an actor or gateway.

## Spells and practice

### Implemented spell infrastructure

- Six single-stroke sigil templates and a lenient recognizer that normalizes position, scale, and rotation.
- Drawing overlay shared by all spells; strokes may be drawn anywhere on the gameplay canvas.
- Reversed and mirrored strokes, sparse input, and imperfect proportions are accepted. Phase, Scramble, Shield, and Trap have additional shape-specific tolerance.
- On release, the original stroke points are passed to recognition as one snapshot.
- Pickup acquisition requires only standing on a matching pickup and drawing its sigil anywhere on the canvas; the stroke does not need to overlap the pickup.
- Inventory capacity, item consumption for successful implemented casts, and inventory-count display.
- Feedback for acquisition, full inventory, unavailable spells, missing walls, and successful casts.
- Pulsing colored pickup markers.

### Spell status and shapes

| Spell | Drawing shape | Current effect status |
| --- | --- | --- |
| Phase | Sideways S / smooth wave | Implemented: moves the hero through the nearest adjacent interior wall, prioritizing the facing side. Stroke location does not select the wall. |
| Destroy | W-like zigzag, down–up–down–up | Implemented: permanently opens the nearest adjacent interior wall, prioritizing the facing side. Stroke location does not select the wall. |
| Scramble | Outward spiral, approximately 1.4 turns | Immediately scrambles all blocks at 70%, preserving the automatic timer and permanent openings. |
| Dash | Lightning bolt, starting bottom-left and ending upper-right | Three checked 80 ms steps in the facing direction, including gateways; stops at walls and remains vulnerable to contact. |
| Shield | U-shaped arc | Five seconds of contact immunity, with a blue aura and countdown. |
| Trap | Downward stem followed by an almost-complete curled loop | Single-use trap on the current cell, armed for 15 seconds; holds one monster for four seconds, cancelling its bomb and suppressing its Stalker alert while held. |

### Practice level

- Level ID `0`, accessible from the home screen.
- One rectangular 12 × 14 maze block.
- Timed scrambling disabled and no enemies configured.
- All six charm pickups placed using BFS visitation order so they are initially reachable.
- Inventory capacity of six.

### Campaign pickups

- Every block receives one reachable pickup of each utility allowed by its level, avoiding starts, exits, gateways, and initial monster spawn cells.
- Placement is deterministic and consumed pickups do not respawn after scrambling. Inventory limits and level utility availability are enforced.
- Unlock sequence: Phase at level 5, Destroy at 7, Scramble at 12, Dash at 14, Shield at 17, Trap at 18. Levels 18–20 have all six.
- Stand on a charm and draw its sigil anywhere on the canvas to collect it; draw anywhere again after collection to cast. Failed casts do not consume a charge.

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
| Practice and campaign pickups | `lib/levels/practice.ts`, `lib/levels/pickups.ts` |
| Maze generation, shapes, world, graph | `lib/maze/` |
| Isolated wall, ambient-effect, hero, and monster canvas composition | `components/WorldCanvas.tsx`, `components/MonsterLayer.tsx` |
| Wall rendering and transition geometry | `components/BlockWalls.tsx`, `lib/maze/wallMotion.ts` |
| Timed scramble rules | `lib/modules/scramble/` |
| Hero sheet bounds and frame clock | `lib/sprites/heroFrames.ts`, `hooks/useSpriteLoop.ts` |
| Direction controller | `components/DPad.tsx` |
| Sigil capture and magical drawing | `components/SigilCanvas.tsx` |
| Cosmetic spell particles | `lib/sprites/spellParticles.ts` |
| Spell types, templates, recognition, wall effects, traps | `lib/modules/utilities/`, `lib/modules/utilities/effects.ts` |
| Monster state, spawning, navigation, detection, bombs, contact | `lib/modules/monsters/` |
| Monster sprite frames and UI-thread rendering | `lib/sprites/monsterFrames.ts`, `components/MonsterSprite.tsx` |
| Isolated monster canvas and development frame metrics | `components/MonsterLayer.tsx`, `components/PerformanceReadout.tsx` |
| Repeatable gameplay verification | `scripts/test-monsters.cjs`, `scripts/test-gameplay.cjs` (`npm run test:gameplay`) |

## Defined or present, but not yet implemented

- Further monster balance and broader device/performance testing. The user approved the monster implementation after the Expo test handoff; runtime enemies and sprite mapping are implemented.
- Boss encounters beyond configured flags and home-screen markers.
- Persistent progress, saves, level unlocking, and a next-level flow. Basic win/death/retry navigation is implemented.
- Audio playback and sound design; an audio dependency is installed, but gameplay audio is not wired in.
- Purchases/paywalls: free/paid pack boundaries are mentioned in level-plan comments, but purchase behavior is not implemented.

## Validation and delivery history

- User tested and approved the sprite smoothness, circular controller, magical spell visuals, and wall-scramble presentation during development.
- TypeScript checks and Expo Babel/worklet compilation passed for the changed code.
- Targeted checks cover five-frame sprite sheets, slide completion in all directions, cancelled slides, particle bounds/expiry, and immutable particle updates.
- Wall-motion checks covered 150 seeded scramble scenarios, exact starting/ending geometry, fixed-length hinge rotation, interrupted transitions, unequal wall counts, and start-to-exit reachability.
- Earlier targeted checks were development scripts outside the repository. The monster work adds `scripts/test-monsters.cjs` and the `test:monsters` package command.
- Monster validation: 15 check groups pass, covering all 16 five-frame PNG sheets and bounded crops, campaign spawning, individual ranges, shared speed, routing, reciprocal gateways, mask boundaries, Stalker broadcast/release, last-known search, bomb timing/permanence, continuous contact, death/retry/pause, hero completion ordering, seeded BFS comparisons, and scramble protection scenarios.
- TypeScript passed and the Android production JavaScript export bundled successfully with all monster assets. Hermes bytecode export was blocked by Windows denying execution of the installed `hermesc.exe`; the successful bundle used `--no-bytecode`. The agent did not perform an emulator/device playtest.
- Expo was started for the user's own testing. The user subsequently approved the result and requested delivery to `main` on 2026-09-11. Test entry points: level 8 (Hunters), level 10 (Hunters/Brutes), level 11 (Hunters/Ghosts), and level 14 (all four types).
- This validation is not a comprehensive device, performance, or release test suite.
- Commit `9019f85`, **Fix sprite animation and upgrade movement, spell, and scramble UI**, was pushed to `main` on `https://github.com/Devvora08/mazeshift`.
- The user completed the previous monster delivery: local commit `f427f37`, **Implement four animated monsters with cross-block pursuit and abilities**, is present; the user reported completing the push.
- 2026-09-12 enhancements: all 30 gameplay check groups pass, including 340 campaign block scrambles reaching the rounded 70% eligible-edge target with full connectivity, repeated Brute bombing, campaign pickups, all six casts, Shield expiry, Trap timing, and Dash gateway/contact behavior.
- TypeScript and `git diff --check` pass. Android production JavaScript export succeeded with `--no-bytecode`; this update has not been device-playtested by the agent. Largest-level scramble computation measured about 7 ms locally, excluding rendering.
- Test the six charms in Practice, or level 18 for all six charms, all four monster types, and timed scrambling. Re-enter a level to generate its new pickups.
- The user approved committing and pushing the gameplay enhancements and PERF-4 rendering changes to main on 2026-09-12. Delivery includes all six spell effects, campaign pickups, direct monster pursuit, 70% scrambling across every enabled block, and the performance follow-up.
- Local commit `93128af`, **Glitch_[v1]**, isolates walls, ambient effects, hero, and monsters into separate Skia layers and retains stable direction-bound hero sheets. The user confirmed the hero crop glitch is gone and the high-load rendering is improved.
- Current sprite update replaces Hero, Hunter, Stalker, and Brute left/right sheets. The user approved the final five-frame Hunter/Stalker versions and their 1.2× side-view sizing after device playtesting.
- Current spell update makes gesture position irrelevant for acquisition and casting, adds lenient reversed/mirrored/sparse recognition with per-shape thresholds, and makes Phase/Destroy choose an adjacent wall from hero state. The user reported that this works brilliantly.
- All 32 current gameplay/monster check groups pass, including canvas-location-independent, reversed, and sparse sigil recognition plus nearest-adjacent-wall selection. TypeScript and `git diff --check` pass.

## Development setup

- Expo SDK 57, React Native 0.86.3, React 19.2.3, TypeScript.
- Skia rendering, Reanimated/worklets, Gesture Handler, Zustand, and NativeWind.
- Paper-and-ink UI with handwritten fonts and purple interaction effects.
- Run `npm start` from the project root for Expo; `npm run android` invokes the native Android run command.
- Follow the root `AGENTS.md`: consult the exact Expo SDK 57 documentation before code changes.

## Suggested next milestones

1. Continue tuning monster range, spawn density, bomb tells, and movement feel based on playtest feedback.
2. Perform broader device profiling of late-game simultaneous scrambles, monsters, effects, and continuous hero movement.
3. Build completion/retry/progression persistence and boss encounters.
4. Add optional spell guidance, gameplay audio, and release-focused testing.
