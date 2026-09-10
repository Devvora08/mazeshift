import { useEffect, useState } from 'react';

/** Cycles 0..frameCount-1 on a fixed-rate interval, looping forever. */
export function useSpriteLoop(frameCount: number, fps: number): number {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (frameCount <= 1) return;
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % frameCount);
    }, 1000 / fps);
    return () => clearInterval(interval);
  }, [frameCount, fps]);

  return frame;
}
