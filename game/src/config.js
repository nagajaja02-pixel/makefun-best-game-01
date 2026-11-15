// Emberfall — every tuning number and colour in one place.
// The arena is a fixed 1280x720 logical field; the renderer scales it to the
// window, so no rule below depends on the screen size.
export const FIELD = { width: 1280, height: 720, margin: 28 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 16,
  speed: 265,
  maxHp: 100,
  fireInterval: 0.22,
  bulletSpeed: 640,
  bulletDamage: 12,
  bulletRadius: 5,
  dashSpeed: 780,
  dashTime: 0.16,
  dashCooldown: 1.6,
  invulnerable: 1.0,
  pickupRadius: 26,
  magnetRadius: 90,
};

export const ENEMY = {
  wisp:   { radius: 15, hp: 18,  speed: 118, damage: 10, score: 10, xp: 1, colour: '#ff5d73' },
  mite:   { radius: 9,  hp: 7,   speed: 185, damage: 6,  score: 5,  xp: 1, colour: '#ff8a5c' },
  spitter:{ radius: 17, hp: 30,  speed: 82,  damage: 12, score: 20, xp: 2, colour: '#c77dff' },
  splitter:{radius: 22, hp: 42,  speed: 68,  damage: 14, score: 25, xp: 2, colour: '#ffb020' },
  brute:  { radius: 30, hp: 130, speed: 52,  damage: 22, score: 50, xp: 4, colour: '#7ee081' },
  boss:   { radius: 52, hp: 900, speed: 46,  damage: 30, score: 500, xp: 20, colour: '#ff2e63' },
};

/** Enemy projectile. */
export const ORB = { radius: 7, speed: 230, damage: 12 };

/** How a wave is built: base budget plus a per-wave rise, spent on enemy costs. */
export const WAVE = {
  budgetBase: 6,
  budgetPerWave: 5,
  spawnInterval: 0.9,
  spawnIntervalMin: 0.28,
  cost: { wisp: 1, spitter: 3, splitter: 3, brute: 6, boss: 0 },
  /** First wave each type may appear in. */
  unlock: { wisp: 1, spitter: 2, splitter: 3, brute: 4, boss: 5 },
  bossEvery: 5,
  /** Seconds of calm between waves, while the upgrade cards are offered. */
  restSeconds: 1.2,
};

export const GEM = { radius: 7, value: 1, magnetSpeed: 420, lifeSeconds: 25 };

/** XP needed to go from level L to L+1. */
export function xpForLevel(level) {
  return 5 + (level - 1) * 4 + Math.floor((level - 1) * (level - 1) * 0.6);
}

export const POOL = { enemies: 96, bullets: 160, orbs: 96, gems: 220, particles: 420, floaters: 48 };

export const PALETTE = {
  backdrop: '#0a0a14',
  arena: '#12121f',
  arenaEdge: '#2a2a44',
  grid: '#1c1c30',
  vignette: 'rgba(4,4,10,0.55)',
  player: '#ffd166',
  playerCore: '#fff3c4',
  bullet: '#ffe066',
  gem: '#4cc9f0',
  heart: '#ff5d73',
  text: '#f4f1e8',
  muted: '#9a97ad',
  panel: 'rgba(16,16,30,0.92)',
  panelEdge: '#3d3d5c',
  gold: '#ffd166',
  danger: '#ff2e63',
  heal: '#7ee081',
};

export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'emberfall.best';
