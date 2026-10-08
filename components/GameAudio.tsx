import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useAudioPlayer, useAudioPlayerStatus, type AudioPlayer } from 'expo-audio';

import { useGameStore } from '../store/gameStore';
import { useProgressStore } from '../store/progressStore';

const GAME_MUSIC_GAP_MS = 3000;
const SCRAMBLE_WARNING_MS = 5000;

export const GameAudio = memo(function GameAudio({ heroHeld }: { heroHeld: boolean }) {
  const heroMoving = useGameStore((state) => state.isMoving);
  const heroRunning = heroHeld || heroMoving;
  const musicEnabled = useProgressStore((state) => state.settings.musicEnabled);
  const soundEffectsEnabled = useProgressStore((state) => state.settings.soundEffectsEnabled);
  const nextScrambleAt = useGameStore((state) => state.nextScrambleAt);
  const scrambleFlashUntil = useGameStore((state) => state.scrambleFlashUntil);
  // Any monster in the hero's block growls, regardless of distance.
  const nearbyMonster = useGameStore((state) => state.currentBlockId !== null
    && state.monsters.some((monster) => monster.location.blockId === state.currentBlockId));
  const caughtBy = useGameStore((state) => state.caughtBy);
  const reachedExit = useGameStore((state) => state.reachedExit);
  const paused = useGameStore((state) => state.paused);
  const runId = useGameStore((state) => state.runId);
  const [now, setNow] = useState(Date.now());

  const music = useAudioPlayer(require('../assets/audio/game_music.mp3'));
  const musicStatus = useAudioPlayerStatus(music);
  const footsteps = useAudioPlayer(require('../assets/audio/hero_runs.wav'));
  const timer = useAudioPlayer(require('../assets/audio/timer_end.wav'));
  const scramble = useAudioPlayer(require('../assets/audio/scramble.wav'));
  const grunt = useAudioPlayer(require('../assets/audio/monster_grunt.wav'));
  const lose = useAudioPlayer(require('../assets/audio/player_loses.wav'));
  const win = useAudioPlayer(require('../assets/audio/win_level.wav'));
  const previousScramble = useRef<number | null>(null);
  const deathPlayedForRun = useRef<number | null>(null);
  const winPlayedForRun = useRef<number | null>(null);
  const playbackGeneration = useRef(0);
  const gameplayActive = !paused && !caughtBy && !reachedExit;
  const musicActive = musicEnabled && gameplayActive;
  const effectsActive = soundEffectsEnabled && gameplayActive;

  // Cancel pending seek completions on unmount, player replacement, or playback changes.
  // useAudioPlayer owns native disposal; cleanup must not call a released player.
  useEffect(() => {
    playbackGeneration.current += 1;
    return () => { playbackGeneration.current += 1; };
  }, [music, footsteps, timer, scramble, grunt, lose, win, musicActive, effectsActive, runId]);

  const replay = useCallback((player: AudioPlayer) => {
    const generation = playbackGeneration.current;
    void (async () => {
      try {
        await player.seekTo(0);
        if (generation === playbackGeneration.current) player.play();
      } catch (error) {
        if (generation === playbackGeneration.current) console.warn('Could not replay game audio', error);
      }
    })();
  }, []);

  useEffect(() => {
    music.loop = false; music.volume = 0.10;
    footsteps.loop = true; footsteps.volume = 0.18;
    timer.loop = true; timer.volume = 0.22;
    scramble.volume = 0.34;
    grunt.volume = 0.28;
    lose.volume = 0.36;
    win.volume = 0.32;
  }, [music, footsteps, timer, scramble, grunt, lose, win]);

  // A play() issued before the source finishes loading can be dropped on Android,
  // leaving a level silent; wait for the load, then start (or restart a finished track).
  const musicLoaded = musicStatus.isLoaded;
  useEffect(() => {
    if (!musicLoaded) return;
    if (!musicActive) { music.pause(); return; }
    const finished = music.duration > 0 && music.currentTime >= music.duration - 0.05;
    if (finished) replay(music);
    else music.play();
  }, [musicActive, musicLoaded, music, replay]);

  useEffect(() => {
    if (!musicStatus.didJustFinish || !musicActive) return;
    const timeout = setTimeout(() => replay(music), GAME_MUSIC_GAP_MS);
    return () => clearTimeout(timeout);
  }, [musicStatus.didJustFinish, musicActive, music, replay]);

  useEffect(() => {
    if (effectsActive && heroRunning) footsteps.play();
    else footsteps.pause();
  }, [effectsActive, heroRunning, footsteps]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, []);

  const warning = nextScrambleAt !== null
    && nextScrambleAt > now
    && nextScrambleAt - now <= SCRAMBLE_WARNING_MS;
  useEffect(() => {
    if (effectsActive && warning) timer.play();
    else timer.pause();
  }, [effectsActive, warning, timer]);

  useEffect(() => {
    if (scrambleFlashUntil !== null
      && scrambleFlashUntil !== previousScramble.current
      && soundEffectsEnabled && !paused) replay(scramble);
    previousScramble.current = scrambleFlashUntil;
  }, [scrambleFlashUntil, soundEffectsEnabled, paused, scramble, replay]);

  const playGrunt = useCallback(() => replay(grunt), [grunt, replay]);
  useEffect(() => {
    if (!effectsActive || !nearbyMonster) return;
    let timeout: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timeout = setTimeout(() => {
        playGrunt();
        schedule();
      }, 4000 + Math.random() * 4000);
    };
    schedule();
    return () => clearTimeout(timeout);
  }, [effectsActive, nearbyMonster, playGrunt]);

  useEffect(() => {
    if (soundEffectsEnabled && caughtBy && deathPlayedForRun.current !== runId) {
      deathPlayedForRun.current = runId;
      replay(lose);
    }
  }, [soundEffectsEnabled, caughtBy, runId, lose, replay]);

  useEffect(() => {
    if (soundEffectsEnabled && reachedExit && winPlayedForRun.current !== runId) {
      winPlayedForRun.current = runId;
      replay(win);
    }
  }, [soundEffectsEnabled, reachedExit, runId, win, replay]);

  useEffect(() => {
    if (!soundEffectsEnabled) {
      footsteps.pause(); timer.pause(); scramble.pause(); grunt.pause(); lose.pause(); win.pause();
    }
  }, [soundEffectsEnabled, footsteps, timer, scramble, grunt, lose, win]);

  return null;
});
