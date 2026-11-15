// The level-up cards. Each upgrade has a name, a short line for its card, a
// colour, a cap, and an apply() that raises the player's stats. The world keeps
// the level of each upgrade on the player, so the same card can be offered
// again until it is maxed.

export const UPGRADES = [
  {
    id: 'damage',
    name: 'Ember Might',
    line: '+25% bullet damage',
    colour: '#ff5d73',
    max: 5,
    apply(stats) { stats.damageMul *= 1.25; },
  },
  {
    id: 'firerate',
    name: 'Rapid Sparks',
    line: '+20% fire rate',
    colour: '#ffd166',
    max: 5,
    apply(stats) { stats.fireIntervalMul *= 0.83; },
  },
  {
    id: 'multishot',
    name: 'Twin Flames',
    line: '+1 bullet per shot',
    colour: '#ff8a5c',
    max: 3,
    apply(stats) { stats.bullets += 1; },
  },
  {
    id: 'pierce',
    name: 'Ghost Embers',
    line: 'Bullets pierce +1 enemy',
    colour: '#c77dff',
    max: 3,
    apply(stats) { stats.pierce += 1; },
  },
  {
    id: 'speed',
    name: 'Swift Boots',
    line: '+12% move speed',
    colour: '#4cc9f0',
    max: 4,
    apply(stats) { stats.speedMul *= 1.12; },
  },
  {
    id: 'maxhp',
    name: 'Stone Heart',
    line: '+25 max HP and heal 25',
    colour: '#7ee081',
    max: 4,
    apply(stats, player) {
      player.maxHp += 25;
      player.hp = Math.min(player.maxHp, player.hp + 25);
    },
  },
  {
    id: 'magnet',
    name: 'Shard Lure',
    line: '+60% pickup radius',
    colour: '#4cc9f0',
    max: 3,
    apply(stats) { stats.magnetMul *= 1.6; },
  },
  {
    id: 'dash',
    name: 'Blink Step',
    line: '-30% dash cooldown',
    colour: '#e0aaff',
    max: 3,
    apply(stats) { stats.dashCooldownMul *= 0.7; },
  },
  {
    id: 'regen',
    name: 'Warm Glow',
    line: 'Regenerate +0.8 HP/s',
    colour: '#7ee081',
    max: 4,
    apply(stats) { stats.regen += 0.8; },
  },
  {
    id: 'crit',
    name: 'Cinder Edge',
    line: '+10% critical chance (2x damage)',
    colour: '#ffb020',
    max: 4,
    apply(stats) { stats.crit += 0.1; },
  },
];

/** The player's starting stats; upgrades multiply these. */
export function baseStats() {
  return {
    damageMul: 1,
    fireIntervalMul: 1,
    bullets: 1,
    pierce: 0,
    speedMul: 1,
    magnetMul: 1,
    dashCooldownMul: 1,
    regen: 0,
    crit: 0.05,
  };
}
