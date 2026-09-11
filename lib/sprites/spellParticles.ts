/** Cosmetic particles only; spell recognition always receives the original gesture. */
export interface SpellParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  radius: number;
  phase: number;
  star: boolean;
}

export const MAX_SPELL_PARTICLES = 80;

export function emitSpellParticles(
  existing: SpellParticle[], x: number, y: number, count: number,
): SpellParticle[] {
  'worklet';
  const added: SpellParticle[] = [];
  for (let i = 0; i < Math.min(count, MAX_SPELL_PARTICLES); i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 9 + Math.random() * 23;
    added.push({
      x: x + (Math.random() - 0.5) * 5,
      y: y + (Math.random() - 0.5) * 5,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 10,
      age: 0,
      life: 420 + Math.random() * 480,
      radius: 0.7 + Math.random() * 1.15,
      phase: Math.random() * Math.PI * 2,
      star: Math.random() < 0.24,
    });
  }
  return [...existing, ...added].slice(-MAX_SPELL_PARTICLES);
}

export function advanceSpellParticles(particles: SpellParticle[], deltaMs: number): SpellParticle[] {
  'worklet';
  const seconds = deltaMs / 1000;
  return particles.filter(p => p.age + deltaMs < p.life).map(p => ({
    ...p,
    age: p.age + deltaMs,
    x: p.x + p.vx * seconds,
    y: p.y + p.vy * seconds,
  }));
}
