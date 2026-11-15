// The screenshot scenes behind ?shot=start|play|upgrade|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by
// a simple autopilot (keep clear of enemies, chase the nearest gem, aim at the
// nearest enemy and hold fire), so the frame is what a real game looks like
// and the same seed always gives the same frame. The upgrade scene plays until
// the first level-up, then stops on the card screen; the end scene's pilot is
// clumsy on purpose, so it is caught out once the waves speed up.

import { FIELD, PLAYER, STEP } from './config.js';
import { EVENT_LEVEL, EVENT_OVER, EVENT_WAVE_CLEAR } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 40;
const UPGRADE_LIMIT_SECONDS = 120;
const END_LIMIT_SECONDS = 600;

/** How far ahead, in seconds, the autopilot checks each way it could move. */
const HORIZON_PLAY = 0.8;
const HORIZON_END = 0.22;
const SAMPLE = 1 / 30;

/** Extra room, each side, it keeps between the warden and an enemy. */
const MARGIN = 14;

/**
 * Seconds until moving in `direction` runs the warden into an enemy or an orb;
 * Infinity when it never does within the horizon.
 */
function timeToHit(state, direction, horizon) {
  const p = state.player;
  const speed = PLAYER.speed;
  for (let t = SAMPLE; t <= horizon; t += SAMPLE) {
    const x = Math.min(FIELD.width - FIELD.margin - p.radius, Math.max(FIELD.margin + p.radius, p.x + direction.x * speed * t));
    const y = Math.min(FIELD.height - FIELD.margin - p.radius, Math.max(FIELD.margin + p.radius, p.y + direction.y * speed * t));
    for (const e of state.enemies) {
      if (!e.active) continue;
      const rr = e.radius + p.radius + MARGIN;
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy < rr * rr) return t;
    }
    for (const o of state.orbs) {
      if (!o.active) continue;
      const ox = o.x + o.vx * t;
      const oy = o.y + o.vy * t;
      const rr = 7 + p.radius + MARGIN;
      const dx = ox - x;
      const dy = oy - y;
      if (dx * dx + dy * dy < rr * rr) return t;
    }
  }
  return Infinity;
}

/** The nearest active enemy, or null. */
function nearestEnemy(state) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    if (!e.active) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/** The nearest active gem, or null. */
function nearestGem(state) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  for (const g of state.gems) {
    if (!g.active) continue;
    const dx = g.x - p.x;
    const dy = g.y - p.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = g; }
  }
  return best;
}

const DIRS = [
  { x: 0, y: 0 }, { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  { x: 0.707, y: 0.707 }, { x: -0.707, y: 0.707 }, { x: 0.707, y: -0.707 }, { x: -0.707, y: -0.707 },
];

/** Of the safe ways to move, the one toward the nearest gem or the arena centre. */
function autopilot(state, horizon) {
  const p = state.player;
  const gem = nearestGem(state);
  const target = gem !== null ? gem : { x: FIELD.width / 2, y: FIELD.height / 2 };
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const d = Math.hypot(dx, dy) || 1;
  const wanted = { x: dx / d, y: dy / d };
  // The direction closest to the wanted one.
  let best = DIRS[0];
  let bestDot = -2;
  for (const dir of DIRS) {
    const dot = dir.x * wanted.x + dir.y * wanted.y;
    if (dot > bestDot) { bestDot = dot; best = dir; }
  }
  let bestTime = timeToHit(state, best, horizon);
  if (bestTime === Infinity) return best;
  for (const dir of DIRS) {
    const t = timeToHit(state, dir, horizon);
    if (t > bestTime) { bestTime = t; best = dir; }
  }
  return best;
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the
 * best score to show. The play scene keeps its lives; the end scene dies.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name !== 'play' && name !== 'upgrade' && name !== 'end') {
    world.startRun();
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      world.step(STEP, { x: 0, y: 0 }, false, 1, 0, false);
    }
    return { screen: SCREEN_TITLE, best: 1250 };
  }
  world.startRun();
  const horizon = name === 'end' ? HORIZON_END : HORIZON_PLAY;
  const limit = name === 'play' ? PLAY_SECONDS : name === 'upgrade' ? UPGRADE_LIMIT_SECONDS : END_LIMIT_SECONDS;
  let leveled = false;
  for (let i = 0; i < limit / STEP; i += 1) {
    const move = autopilot(state, horizon);
    const enemy = nearestEnemy(state);
    let aimX = 1;
    let aimY = 0;
    if (enemy) {
      const dx = enemy.x - state.player.x;
      const dy = enemy.y - state.player.y;
      const d = Math.hypot(dx, dy) || 1;
      aimX = dx / d;
      aimY = dy / d;
    }
    const dash = state.player.dashCooldown <= 0 && timeToHit(state, move, 0.3) < 0.3;
    const events = world.step(STEP, move, true, aimX, aimY, dash);
    if (events & EVENT_OVER) break;
    if (name === 'upgrade' && (events & EVENT_LEVEL)) { leveled = true; break; }
    if (name === 'play') {
      // Stop mid-wave 3 or later, in the thick of it: several enemies alive,
      // bullets flying, gems on the floor — not the calm between waves.
      let alive = 0;
      for (const e of state.enemies) if (e.active) alive += 1;
      if (state.wave >= 2 && alive >= 4 && state.time > 10) break;
    }
  }
  const over = state.player.hp <= 0;
  if (name === 'upgrade' && leveled) {
    return { screen: SCREEN_UPGRADE, best: state.score };
  }
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: state.score };
}
