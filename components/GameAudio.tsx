import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioPlayer, useAudioPlayerStatus, type AudioPlayer } from 'expo-audio';

import { useGameStore } from '../store/gameStore';
import { useProgressStore } from '../store/progressStore';

const GAME_MUSIC_GAP_MS = 3000;
const SCRAMBLE_WARNING_MS = 5000;

function replay(player: AudioPlayer) {
  void player.seekTo(0).then(() => player.play());
}

export function GameAudio({ heroRunning }: { heroRunning: boolean }) {
  const musicEnabled = useProgressStore((state) => state.settings.musicEnabled);
  const soundEffectsEnabled = useProgressStore((state) => state.settings.soundEffectsEnabled);
  const nextScrambleAt = useGameStore((state) => state.nextScrambleAt);
  const scrambleFlashUntil = useGameStore((state) => state.scrambleFlashUntil);
  const nearbyMonster = useGameStore((state) => state.heroCell !== null && state.currentBlockId !== null
    && state.monsters.some((monster) => monster.location.blockId === state.currentBlockId
      && Math.abs(monster.location.cell.x - state.heroCell!.x)
        + Math.abs(monster.location.cell.y - state.heroCell!.y) <= 4));
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

  useEffect(() => {
    music.loop = false; music.volume = 0.10;
    footsteps.loop = true; footsteps.volume = 0.18;
    timer.loop = true; timer.volume = 0.22;
    scramble.volume = 0.34;
    grunt.volume = 0.28;
    lose.volume = 0.36;
    win.volume = 0.32;
  }, [music, footsteps, timer, scramble, grunt, lose, win]);

  const gameplayActive = !paused && !caughtBy && !reachedExit;
  const musicActive = musicEnabled && gameplayActive;
  const effectsActive = soundEffectsEnabled && gameplayActive;

  useEffect(() => {
    if (musicActive) music.play();
    else music.pause();
    return () => music.pause();
  }, [musicActive, music]);

  useEffect(() => {
    if (!musicStatus.didJustFinish || !musicActive) return;
    const timeout = setTimeout(() => replay(music), GAME_MUSIC_GAP_MS);
    return () => clearTimeout(timeout);
  }, [musicStatus.didJustFinish, musicActive, music]);

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
  }, [scrambleFlashUntil, soundEffectsEnabled, paused, scramble]);

  const playGrunt = useCallback(() => replay(grunt), [grunt]);
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
  }, [soundEffectsEnabled, caughtBy, runId, lose]);

  useEffect(() => {
    if (soundEffectsEnabled && reachedExit && winPlayedForRun.current !== runId) {
      winPlayedForRun.current = runId;
      replay(win);
    }
  }, [soundEffectsEnabled, reachedExit, runId, win]);

  useEffect(() => {
    if (!soundEffectsEnabled) {
      footsteps.pause(); timer.pause(); scramble.pause(); grunt.pause(); lose.pause(); win.pause();
    }
  }, [soundEffectsEnabled, footsteps, timer, scramble, grunt, lose, win]);

  useEffect(() => () => {
    music.pause(); footsteps.pause(); timer.pause(); scramble.pause(); grunt.pause(); lose.pause(); win.pause();
  }, [music, footsteps, timer, scramble, grunt, lose, win]);

  return null;
}
