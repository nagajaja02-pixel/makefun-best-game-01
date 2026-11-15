// The game's rules and state, with no drawing and no browser in it: the player,
// the pools of bullets, enemies, orbs, gems, particles and floating text, the
// wave spawner, collisions, XP and levels, the boss, and the dash. step()
// advances one fixed step and returns what happened as bit flags, so the caller
// can react (sounds, screens) without the world knowing about them. Nothing
// here allocates after createWorld returns.

import { ENEMY, FIELD, GEM, ORB, PLAYER, POOL, WAVE, xpForLevel } from './config.js';
import { baseStats, UPGRADES } from './upgrades.js';
import { range } from './random.js';

export const EVENT_HIT = 1;
export const EVENT_KILL = 2;
export const EVENT_LEVEL = 4;
export const EVENT_WAVE_CLEAR = 8;
export const EVENT_OVER = 16;
export const EVENT_BOSS = 32;
export const EVENT_GEM = 64;
export const EVENT_DASH = 128;
export const EVENT_PLAYER_HIT = 256;

export const KIND_WISP = 'wisp';
export const KIND_MITE = 'mite';
export const KIND_SPITTER = 'spitter';
export const KIND_SPLITTER = 'splitter';
export const KIND_BRUTE = 'brute';
export const KIND_BOSS = 'boss';

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function clampToArena(x, y, r) {
  return {
    x: Math.min(FIELD.width - FIELD.margin - r, Math.max(FIELD.margin + r, x)),
    y: Math.min(FIELD.height - FIELD.margin - r, Math.max(FIELD.margin + r, y)),
  };
}

export function createWorld(random) {
  const player = {
    x: 0, y: 0, vx: 0, vy: 0, radius: PLAYER.radius,
    hp: PLAYER.maxHp, maxHp: PLAYER.maxHp,
    aimX: 1, aimY: 0, fireTimer: 0,
    dashTimer: 0, dashCooldown: 0, dashX: 0, dashY: 0,
    invulnerable: 0, facing: 1,
    level: 1, xp: 0, kills: 0,
    stats: baseStats(),
    upgrades: {},
  };

  const bullets = [];
  const enemies = [];
  const orbs = [];
  const gems = [];
  const particles = [];
  const floaters = [];
  for (let i = 0; i < POOL.bullets; i += 1) bullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, damage: 0, pierce: 0, life: 0 });
  for (let i = 0; i < POOL.enemies; i += 1) enemies.push({ active: false, kind: KIND_WISP, x: 0, y: 0, vx: 0, vy: 0, hp: 0, maxHp: 0, radius: 0, speed: 0, damage: 0, score: 0, xp: 0, touchTimer: 0, shootTimer: 0, wobble: 0, flash: 0 });
  for (let i = 0; i < POOL.orbs; i += 1) orbs.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  for (let i = 0; i < POOL.gems; i += 1) gems.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, value: 0, life: 0, bob: 0 });
  for (let i = 0; i < POOL.particles; i += 1) particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0, colour: '' });
  for (let i = 0; i < POOL.floaters; i += 1) floaters.push({ active: false, x: 0, y: 0, life: 0, text: '', colour: '' });

  const state = {
    player, bullets, enemies, orbs, gems, particles, floaters,
    score: 0, wave: 1, elapsed: 0,
    waveActive: false, spawnQueue: [], spawnTimer: 0, restTimer: 0,
    boss: null, shake: 0, time: 0, backdropTimer: 0,
    choices: [], pendingLevels: 0,
  };

  function free(pool) {
    for (let i = 0; i < pool.length; i += 1) if (!pool[i].active) return pool[i];
    return null;
  }

  function burst(x, y, colour, count, speed, size) {
    for (let i = 0; i < count; i += 1) {
      const p = free(particles);
      if (!p) return;
      const a = random() * Math.PI * 2;
      const v = speed * (0.4 + random() * 0.8);
      p.active = true;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v;
      p.maxLife = 0.35 + random() * 0.4;
      p.life = p.maxLife;
      p.size = size * (0.6 + random() * 0.8);
      p.colour = colour;
    }
  }

  function floatText(x, y, text, colour) {
    const f = free(floaters);
    if (!f) return;
    f.active = true;
    f.x = x; f.y = y;
    f.life = 0.9;
    f.text = text;
    f.colour = colour;
  }

  function spawnEnemy(kind, x, y) {
    const def = ENEMY[kind];
    const e = free(enemies);
    if (!e) return null;
    const hpScale = 1 + (state.wave - 1) * 0.12 + (kind === KIND_BOSS ? (state.wave - 5) * 0.05 : 0);
    e.active = true;
    e.kind = kind;
    e.x = x; e.y = y;
    e.vx = 0; e.vy = 0;
    e.maxHp = Math.round(def.hp * hpScale);
    e.hp = e.maxHp;
    e.radius = def.radius;
    e.speed = def.speed * (1 + Math.min(0.5, (state.wave - 1) * 0.03));
    e.damage = def.damage;
    e.score = def.score;
    e.xp = def.xp;
    e.touchTimer = 0;
    e.shootTimer = 1 + random() * 1.5;
    e.wobble = random() * Math.PI * 2;
    e.flash = 0;
    return e;
  }

  function edgeSpawn() {
    // Pick a point just inside a random arena edge, away from the player.
    for (let tries = 0; tries < 8; tries += 1) {
      const side = Math.floor(random() * 4);
      let x = FIELD.margin + 20;
      let y = FIELD.margin + 20;
      if (side === 0) { x = range(random, FIELD.margin + 20, FIELD.width - FIELD.margin - 20); y = FIELD.margin + 20; }
      else if (side === 1) { x = range(random, FIELD.margin + 20, FIELD.width - FIELD.margin - 20); y = FIELD.height - FIELD.margin - 20; }
      else if (side === 2) { x = FIELD.margin + 20; y = range(random, FIELD.margin + 20, FIELD.height - FIELD.margin - 20); }
      else { x = FIELD.width - FIELD.margin - 20; y = range(random, FIELD.margin + 20, FIELD.height - FIELD.margin - 20); }
      if (dist2(x, y, player.x, player.y) > 320 * 320) return { x, y };
    }
    return { x: FIELD.margin + 20, y: FIELD.margin + 20 };
  }

  function buildWave(wave) {
    const queue = [];
    let budget = WAVE.budgetBase + WAVE.budgetPerWave * (wave - 1);
    const kinds = Object.keys(WAVE.cost).filter((k) => wave >= WAVE.unlock[k] && k !== 'boss');
    while (budget > 0 && queue.length < 60) {
      const kind = kinds[Math.floor(random() * kinds.length)];
      const cost = WAVE.cost[kind];
      if (cost > budget && queue.length > 0) break;
      queue.push(kind);
      budget -= cost;
    }
    // Shuffle the queue so the wave does not arrive in clumps of one kind.
    for (let i = queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const t = queue[i]; queue[i] = queue[j]; queue[j] = t;
    }
    if (wave % WAVE.bossEvery === 0) queue.push('boss');
    return queue;
  }

  function dropGems(x, y, count, value) {
    for (let i = 0; i < count; i += 1) {
      const g = free(gems);
      if (!g) return;
      const a = random() * Math.PI * 2;
      g.active = true;
      g.x = x; g.y = y;
      g.vx = Math.cos(a) * 90; g.vy = Math.sin(a) * 90;
      g.value = value;
      g.life = GEM.lifeSeconds;
      g.bob = random() * Math.PI * 2;
    }
  }

  function killEnemy(e, awardScore) {
    e.active = false;
    player.kills += 1;
    if (awardScore) {
      state.score += e.score;
      floatText(e.x, e.y - e.radius, `+${e.score}`, '#ffd166');
    }
    burst(e.x, e.y, ENEMY[e.kind].colour, e.kind === KIND_BOSS ? 40 : 14, 260, 4);
    burst(e.x, e.y, '#ffffff', 6, 140, 2.5);
    dropGems(e.x, e.y, e.xp, GEM.value);
    if (e.kind === KIND_SPLITTER) {
      for (let i = 0; i < 2; i += 1) {
        const m = spawnEnemy(KIND_MITE, e.x + (i === 0 ? -14 : 14), e.y);
        if (m) { m.hp = m.maxHp; }
      }
    }
    if (e.kind === KIND_BOSS) {
      state.boss = null;
      state.shake = Math.max(state.shake, 0.5);
      dropGems(e.x, e.y, 10, GEM.value);
      floatText(e.x, e.y - 60, 'BOSS DOWN! +500', '#ff2e63');
    }
  }

  function fireBullet() {
    const stats = player.stats;
    const spread = 0.14;
    const count = stats.bullets;
    for (let i = 0; i < count; i += 1) {
      const b = free(bullets);
      if (!b) return;
      const off = (i - (count - 1) / 2) * spread;
      const cos = Math.cos(off);
      const sin = Math.sin(off);
      const dx = player.aimX * cos - player.aimY * sin;
      const dy = player.aimX * sin + player.aimY * cos;
      const crit = random() < stats.crit;
      b.active = true;
      b.x = player.x + dx * (player.radius + 6);
      b.y = player.y + dy * (player.radius + 6);
      b.vx = dx * PLAYER.bulletSpeed;
      b.vy = dy * PLAYER.bulletSpeed;
      b.damage = PLAYER.bulletDamage * stats.damageMul * (crit ? 2 : 1);
      b.pierce = stats.pierce;
      b.life = 1.1;
      b.crit = crit;
    }
  }

  function hurtPlayer(damage, fromX, fromY) {
    if (player.invulnerable > 0 || player.dashTimer > 0) return 0;
    player.hp -= damage;
    player.invulnerable = PLAYER.invulnerable;
    state.shake = Math.max(state.shake, 0.35);
    burst(player.x, player.y, '#ff5d73', 12, 220, 4);
    const dx = player.x - fromX;
    const dy = player.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    player.x += (dx / len) * 26;
    player.y += (dy / len) * 26;
    const clamped = clampToArena(player.x, player.y, player.radius);
    player.x = clamped.x; player.y = clamped.y;
    if (player.hp <= 0) {
      player.hp = 0;
      return EVENT_PLAYER_HIT | EVENT_OVER;
    }
    return EVENT_PLAYER_HIT;
  }

  function rollChoices() {
    const available = UPGRADES.filter((u) => (player.upgrades[u.id] || 0) < u.max);
    const pool = available.length > 0 ? available : UPGRADES;
    const picks = [];
    const copy = pool.slice();
    while (picks.length < 3 && copy.length > 0) {
      const i = Math.floor(random() * copy.length);
      picks.push(copy.splice(i, 1)[0]);
    }
    return picks;
  }

  function applyUpgrade(upgrade) {
    player.upgrades[upgrade.id] = (player.upgrades[upgrade.id] || 0) + 1;
    upgrade.apply(player.stats, player);
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.vx = 0; player.vy = 0;
    player.hp = PLAYER.maxHp; player.maxHp = PLAYER.maxHp;
    player.aimX = 1; player.aimY = 0; player.fireTimer = 0;
    player.dashTimer = 0; player.dashCooldown = 0;
    player.invulnerable = 0; player.facing = 1;
    player.level = 1; player.xp = 0; player.kills = 0;
    player.stats = baseStats();
    player.upgrades = {};
    for (const b of bullets) b.active = false;
    for (const e of enemies) e.active = false;
    for (const o of orbs) o.active = false;
    for (const g of gems) g.active = false;
    for (const p of particles) p.active = false;
    for (const f of floaters) f.active = false;
    state.score = 0;
    state.wave = 1;
    state.elapsed = 0;
    state.time = 0;
    state.waveActive = false;
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.restTimer = 0;
    state.boss = null;
    state.shake = 0;
    state.choices = [];
    state.pendingLevels = 0;
    state.backdropTimer = 0;
  }

  function startWave(wave) {
    state.wave = wave;
    state.spawnQueue = buildWave(wave);
    state.spawnTimer = 0.5;
    state.waveActive = true;
    state.restTimer = 0;
    if (wave % WAVE.bossEvery === 0) return EVENT_BOSS;
    return 0;
  }

  /** Begin the run: wave 1 spawns after a short beat. */
  function startRun() {
    reset();
    state.restTimer = 0.8;
  }

  /**
   * The title screen's backdrop: time passes and a few wisps drift across the
   * arena, but nothing spawns waves, nothing shoots and nothing can hurt the
   * warden, who stands in the middle waiting.
   */
  function stepBackdrop(dt) {
    state.time += dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 1.4);
    state.backdropTimer -= dt;
    let active = 0;
    for (const e of enemies) if (e.active) active += 1;
    if (state.backdropTimer <= 0 && active < 6) {
      state.backdropTimer = 1.6;
      const side = Math.floor(random() * 4);
      let x = FIELD.margin + 30;
      let y = FIELD.margin + 30;
      let vx = 40;
      let vy = 14;
      if (side === 0) { x = range(random, 120, FIELD.width - 120); y = FIELD.margin + 30; vy = 46; vx = range(random, -20, 20); }
      else if (side === 1) { x = range(random, 120, FIELD.width - 120); y = FIELD.height - FIELD.margin - 30; vy = -46; vx = range(random, -20, 20); }
      else if (side === 2) { x = FIELD.margin + 30; y = range(random, 120, FIELD.height - 120); vx = 46; vy = range(random, -20, 20); }
      else { x = FIELD.width - FIELD.margin - 30; y = range(random, 120, FIELD.height - 120); vx = -46; vy = range(random, -20, 20); }
      const e = spawnEnemy(KIND_WISP, x, y);
      if (e) { e.vx = vx; e.vy = vy; }
    }
    for (const e of enemies) {
      if (!e.active) continue;
      e.wobble += dt * 3;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.x < FIELD.margin - 40 || e.x > FIELD.width - FIELD.margin + 40 || e.y < FIELD.margin - 40 || e.y > FIELD.height - FIELD.margin + 40) {
        e.active = false;
      }
    }
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  function step(dt, move, firing, aimX, aimY, dash) {
    let events = 0;
    state.time += dt;
    state.elapsed += dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 1.4);

    // --- player movement and dash ---
    if (player.dashCooldown > 0) player.dashCooldown -= dt;
    if (player.invulnerable > 0) player.invulnerable -= dt;
    if (player.stats.regen > 0 && player.hp > 0) {
      player.hp = Math.min(player.maxHp, player.hp + player.stats.regen * dt);
    }
    if (dash && player.dashCooldown <= 0 && player.dashTimer <= 0 && (move.x !== 0 || move.y !== 0)) {
      player.dashTimer = PLAYER.dashTime;
      player.dashCooldown = PLAYER.dashCooldown * player.stats.dashCooldownMul;
      player.dashX = move.x;
      player.dashY = move.y;
      player.invulnerable = Math.max(player.invulnerable, PLAYER.dashTime + 0.08);
      events |= EVENT_DASH;
    }
    const speed = PLAYER.speed * player.stats.speedMul;
    if (player.dashTimer > 0) {
      player.dashTimer -= dt;
      player.vx = player.dashX * PLAYER.dashSpeed;
      player.vy = player.dashY * PLAYER.dashSpeed;
    } else {
      player.vx = move.x * speed;
      player.vy = move.y * speed;
    }
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    const clamped = clampToArena(player.x, player.y, player.radius);
    player.x = clamped.x; player.y = clamped.y;
    if (move.x !== 0) player.facing = move.x > 0 ? 1 : -1;

    // --- aiming and firing ---
    const aimLen = Math.hypot(aimX, aimY);
    if (aimLen > 0.01) {
      player.aimX = aimX / aimLen;
      player.aimY = aimY / aimLen;
    }
    player.fireTimer -= dt;
    if (firing && player.fireTimer <= 0) {
      fireBullet();
      player.fireTimer = PLAYER.fireInterval * player.stats.fireIntervalMul;
    }

    // --- wave flow ---
    if (!state.waveActive) {
      state.restTimer -= dt;
      if (state.restTimer <= 0) events |= startWave(state.wave);
    } else if (state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        // Enemies arrive in small groups that grow with the wave, so the arena
        // fills up instead of trickling one wisp at a time.
        const group = 1 + Math.floor(state.wave / 3);
        for (let n = 0; n < group && state.spawnQueue.length > 0; n += 1) {
          const kind = state.spawnQueue.shift();
          const spot = edgeSpawn();
          const e = spawnEnemy(kind, spot.x, spot.y);
          if (e && kind === KIND_BOSS) state.boss = e;
        }
        state.spawnTimer = Math.max(
          WAVE.spawnIntervalMin,
          WAVE.spawnInterval * Math.pow(0.94, state.wave - 1),
        );
      }
    } else {
      let alive = 0;
      for (const e of enemies) if (e.active) alive += 1;
      if (alive === 0) {
        state.waveActive = false;
        state.wave += 1;
        state.restTimer = WAVE.restSeconds;
        events |= EVENT_WAVE_CLEAR;
      }
    }

    // --- enemies ---
    for (const e of enemies) {
      if (!e.active) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.touchTimer > 0) e.touchTimer -= dt;
      e.wobble += dt * 3;
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d;
      const ny = dy / d;
      if (e.kind === KIND_WISP || e.kind === KIND_MITE) {
        e.vx = nx * e.speed;
        e.vy = ny * e.speed;
      } else if (e.kind === KIND_SPITTER) {
        // Keep a ring around the player and shoot.
        const want = 260;
        const radial = d > want + 30 ? 1 : d < want - 30 ? -1 : 0;
        e.vx = nx * e.speed * radial + Math.cos(e.wobble) * 30;
        e.vy = ny * e.speed * radial + Math.sin(e.wobble) * 30;
        e.shootTimer -= dt;
        if (e.shootTimer <= 0 && d < 520) {
          e.shootTimer = 2.4 - Math.min(0.8, (state.wave - 1) * 0.05);
          const o = free(orbs);
          if (o) {
            o.active = true;
            o.x = e.x; o.y = e.y;
            o.vx = nx * ORB.speed; o.vy = ny * ORB.speed;
            o.life = 4;
          }
        }
      } else if (e.kind === KIND_SPLITTER) {
        e.vx = nx * e.speed + Math.cos(e.wobble * 0.7) * 24;
        e.vy = ny * e.speed + Math.sin(e.wobble * 0.7) * 24;
      } else if (e.kind === KIND_BRUTE) {
        e.vx = nx * e.speed;
        e.vy = ny * e.speed;
      } else if (e.kind === KIND_BOSS) {
        e.vx = nx * e.speed;
        e.vy = ny * e.speed;
        e.shootTimer -= dt;
        if (e.shootTimer <= 0) {
          e.shootTimer = 1.7;
          // A ring of orbs.
          for (let i = 0; i < 10; i += 1) {
            const o = free(orbs);
            if (!o) break;
            const a = (i / 10) * Math.PI * 2 + state.time;
            o.active = true;
            o.x = e.x; o.y = e.y;
            o.vx = Math.cos(a) * ORB.speed * 0.8;
            o.vy = Math.sin(a) * ORB.speed * 0.8;
            o.life = 4;
          }
        }
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      const ec = clampToArena(e.x, e.y, e.radius);
      e.x = ec.x; e.y = ec.y;
      // Touch damage, throttled per enemy.
      if (e.touchTimer <= 0 && dist2(e.x, e.y, player.x, player.y) < (e.radius + player.radius) * (e.radius + player.radius)) {
        e.touchTimer = 0.8;
        events |= hurtPlayer(e.damage, e.x, e.y);
      }
    }

    // --- bullets ---
    for (const b of bullets) {
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) { b.active = false; continue; }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < FIELD.margin || b.x > FIELD.width - FIELD.margin || b.y < FIELD.margin || b.y > FIELD.height - FIELD.margin) {
        b.active = false;
        continue;
      }
      for (const e of enemies) {
        if (!e.active) continue;
        const rr = e.radius + PLAYER.bulletRadius;
        if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
          e.hp -= b.damage;
          e.flash = 0.09;
          burst(b.x, b.y, '#ffe066', 3, 120, 2.5);
          floatText(b.x, b.y - 10, String(Math.round(b.damage)), b.crit ? '#ff9f1c' : '#f4f1e8');
          if (e.hp <= 0) {
            killEnemy(e, true);
            events |= EVENT_KILL;
          } else {
            events |= EVENT_HIT;
          }
          if (b.pierce > 0) {
            b.pierce -= 1;
          } else {
            b.active = false;
          }
          break;
        }
      }
    }

    // --- enemy orbs ---
    for (const o of orbs) {
      if (!o.active) continue;
      o.life -= dt;
      if (o.life <= 0) { o.active = false; continue; }
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      if (o.x < FIELD.margin || o.x > FIELD.width - FIELD.margin || o.y < FIELD.margin || o.y > FIELD.height - FIELD.margin) {
        o.active = false;
        continue;
      }
      const rr = player.radius + ORB.radius;
      if (dist2(o.x, o.y, player.x, player.y) < rr * rr) {
        o.active = false;
        events |= hurtPlayer(ORB.damage, o.x - o.vx * 0.01, o.y - o.vy * 0.01);
      }
    }

    // --- gems ---
    const magnetR = PLAYER.magnetRadius * player.stats.magnetMul;
    for (const g of gems) {
      if (!g.active) continue;
      g.life -= dt;
      if (g.life <= 0) { g.active = false; continue; }
      g.bob += dt * 4;
      const d2 = dist2(g.x, g.y, player.x, player.y);
      const pr = PLAYER.pickupRadius;
      if (d2 < magnetR * magnetR) {
        const d = Math.sqrt(d2) || 1;
        const pull = GEM.magnetSpeed * (1 - d / (magnetR + 1));
        g.vx += ((player.x - g.x) / d) * pull * dt * 8;
        g.vy += ((player.y - g.y) / d) * pull * dt * 8;
      } else {
        g.vx *= 0.94;
        g.vy *= 0.94;
      }
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      if (d2 < pr * pr) {
        g.active = false;
        player.xp += g.value;
        events |= EVENT_GEM;
        const need = xpForLevel(player.level);
        if (player.xp >= need) {
          player.xp -= need;
          player.level += 1;
          state.pendingLevels += 1;
          state.choices = rollChoices();
          events |= EVENT_LEVEL;
        }
      }
    }

    // --- particles and floaters ---
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
    for (const f of floaters) {
      if (!f.active) continue;
      f.life -= dt;
      if (f.life <= 0) { f.active = false; continue; }
      f.y -= 34 * dt;
    }

    if (events & EVENT_OVER) {
      burst(player.x, player.y, '#ffd166', 40, 320, 5);
      burst(player.x, player.y, '#ff5d73', 24, 220, 4);
    }
    return events;
  }

  return {
    state, reset, startRun, startWave, step, stepBackdrop, applyUpgrade, rollChoices,
    xpForLevel,
  };
}
