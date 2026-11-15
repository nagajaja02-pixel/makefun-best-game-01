// Everything the player sees, drawn on one canvas: the arena, the warden, the
// enemies, bullets, gems and particles, the HUD, and the title, upgrade,
// pause and game-over screens. The canvas is sized to the window; the game is
// drawn in a fixed 1280x720 logical field, letterboxed and scaled, so the
// screenshots match what a player sees.

import { FIELD, FONT, PALETTE, xpForLevel } from './config.js';
import { ENEMY } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

/** The upgrade cards' layout, shared by drawUpgrade and upgradeCardAt. */
const CARD = { width: 300, height: 240, gap: 28, y: 240 };

/** Which upgrade card (by index) a field point falls on, or -1. */
export function upgradeCardAt(choices, fieldX, fieldY) {
  const totalW = choices.length * CARD.width + (choices.length - 1) * CARD.gap;
  const startX = (FIELD.width - totalW) / 2;
  if (fieldY < CARD.y || fieldY > CARD.y + CARD.height) return -1;
  for (let i = 0; i < choices.length; i += 1) {
    const x = startX + i * (CARD.width + CARD.gap);
    if (fieldX >= x && fieldX <= x + CARD.width) return i;
  }
  return -1;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let cssWidth = 0;
  let cssHeight = 0;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cssWidth = window.innerWidth;
    cssHeight = window.innerHeight;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scale = Math.min(cssWidth / FIELD.width, cssHeight / FIELD.height);
    offsetX = (cssWidth - FIELD.width * scale) / 2;
    offsetY = (cssHeight - FIELD.height * scale) / 2;
  }

  resize();
  window.addEventListener('resize', resize);

  /** Convert a mouse position in CSS pixels to field coordinates. */
  function toField(cssX, cssY) {
    return { x: (cssX - offsetX) / scale, y: (cssY - offsetY) / scale };
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawArena(state) {
    const g = ctx.createRadialGradient(
      FIELD.width / 2, FIELD.height / 2, 80,
      FIELD.width / 2, FIELD.height / 2, 720,
    );
    g.addColorStop(0, '#1a1a2e');
    g.addColorStop(1, PALETTE.backdrop);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);

    // Grid.
    ctx.strokeStyle = PALETTE.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = FIELD.margin; x <= FIELD.width - FIELD.margin; x += 64) {
      ctx.moveTo(x, FIELD.margin);
      ctx.lineTo(x, FIELD.height - FIELD.margin);
    }
    for (let y = FIELD.margin; y <= FIELD.height - FIELD.margin; y += 64) {
      ctx.moveTo(FIELD.margin, y);
      ctx.lineTo(FIELD.width - FIELD.margin, y);
    }
    ctx.stroke();

    // Arena border, glowing ember orange.
    ctx.strokeStyle = '#ff8a3d';
    ctx.globalAlpha = 0.55 + 0.1 * Math.sin(state.time * 2);
    ctx.lineWidth = 3;
    ctx.strokeRect(FIELD.margin, FIELD.margin, FIELD.width - FIELD.margin * 2, FIELD.height - FIELD.margin * 2);
    ctx.globalAlpha = 1;

    // Corner torches: steady flames that mark the arena's edges.
    const corners = [
      [FIELD.margin, FIELD.margin],
      [FIELD.width - FIELD.margin, FIELD.margin],
      [FIELD.margin, FIELD.height - FIELD.margin],
      [FIELD.width - FIELD.margin, FIELD.height - FIELD.margin],
    ];
    for (const [cx, cy] of corners) {
      const flicker = 0.75 + 0.25 * Math.sin(state.time * 6 + cx);
      const rg = ctx.createRadialGradient(cx, cy, 2, cx, cy, 34 * flicker);
      rg.addColorStop(0, 'rgba(255, 190, 80, 0.9)');
      rg.addColorStop(0.5, 'rgba(255, 110, 40, 0.35)');
      rg.addColorStop(1, 'rgba(255, 110, 40, 0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(cx, cy, 34 * flicker, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGems(state) {
    for (const g of state.gems) {
      if (!g.active) continue;
      const bob = Math.sin(g.bob) * 2;
      const pulse = 0.8 + 0.2 * Math.sin(g.bob * 2);
      ctx.save();
      ctx.translate(g.x, g.y + bob);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#4cc9f0';
      ctx.globalAlpha = 0.9;
      ctx.shadowColor = '#4cc9f0';
      ctx.shadowBlur = 10 * pulse;
      const s = 6 * pulse;
      ctx.fillRect(-s, -s, s * 2, s * 2);
      ctx.restore();
    }
  }

  function drawPlayer(state) {
    const p = state.player;
    if (p.hp <= 0) return;
    const blink = p.invulnerable > 0 && Math.floor(state.time * 14) % 2 === 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (blink) ctx.globalAlpha = 0.35;

    // Dash trail glow.
    if (p.dashTimer > 0) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(-p.dashX * 26, -p.dashY * 26, p.radius * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = blink ? 0.35 : 1;
    }

    // Ember aura.
    const aura = ctx.createRadialGradient(0, 0, 4, 0, 0, p.radius + 18);
    aura.addColorStop(0, 'rgba(255, 209, 102, 0.35)');
    aura.addColorStop(1, 'rgba(255, 209, 102, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, p.radius + 18, 0, Math.PI * 2);
    ctx.fill();

    // Cloak: a triangle pointing at the aim.
    const aimAngle = Math.atan2(p.aimY, p.aimX);
    ctx.rotate(aimAngle);
    ctx.fillStyle = '#e07b39';
    ctx.beginPath();
    ctx.moveTo(p.radius + 6, 0);
    ctx.lineTo(-p.radius * 0.7, -p.radius * 0.75);
    ctx.lineTo(-p.radius * 0.4, 0);
    ctx.lineTo(-p.radius * 0.7, p.radius * 0.75);
    ctx.closePath();
    ctx.fill();
    // Body.
    ctx.fillStyle = PALETTE.player;
    ctx.shadowColor = '#ffd166';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Core and eyes.
    ctx.fillStyle = PALETTE.playerCore;
    ctx.beginPath();
    ctx.arc(0, 0, p.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.arc(p.radius * 0.35, -p.radius * 0.22, 2.6, 0, Math.PI * 2);
    ctx.arc(p.radius * 0.35, p.radius * 0.22, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEnemies(state) {
    for (const e of state.enemies) {
      if (!e.active) continue;
      const colour = ENEMY[e.kind].colour;
      ctx.save();
      ctx.translate(e.x, e.y);
      // Flash white on hit.
      const body = e.flash > 0 ? '#ffffff' : colour;
      ctx.shadowColor = colour;
      ctx.shadowBlur = 12;
      if (e.kind === 'wisp') {
        // A spiky wisp: a circle with jagged points.
        ctx.fillStyle = body;
        ctx.beginPath();
        const spikes = 8;
        for (let i = 0; i <= spikes * 2; i += 1) {
          const a = (i / (spikes * 2)) * Math.PI * 2 + e.wobble * 0.3;
          const r = i % 2 === 0 ? e.radius : e.radius * 0.62;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#1a1a2e';
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * 0.35, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === 'mite') {
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a1a2e';
        ctx.beginPath();
        ctx.arc(e.radius * 0.3, 0, 2.4, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === 'spitter') {
        // A diamond with a hollow mouth.
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = body;
        ctx.fillRect(-e.radius * 0.8, -e.radius * 0.8, e.radius * 1.6, e.radius * 1.6);
        ctx.fillStyle = '#1a1a2e';
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.rotate(-Math.PI / 4);
      } else if (e.kind === 'splitter') {
        // Two overlapping circles, ready to split.
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(-e.radius * 0.4, 0, e.radius * 0.62, 0, Math.PI * 2);
        ctx.arc(e.radius * 0.4, 0, e.radius * 0.62, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a1a2e';
        ctx.beginPath();
        ctx.arc(-e.radius * 0.4, -3, 2.4, 0, Math.PI * 2);
        ctx.arc(e.radius * 0.4, -3, 2.4, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === 'brute') {
        // A heavy hexagon with armour plates.
        ctx.fillStyle = body;
        ctx.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
          const px = Math.cos(a) * e.radius;
          const py = Math.sin(a) * e.radius;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * 0.55, 0, Math.PI * 2);
        ctx.stroke();
      } else if (e.kind === 'boss') {
        // The Hollow King: a big crowned ring.
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a1a2e';
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * 0.68, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff2e63';
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
        // Crown spikes.
        ctx.fillStyle = '#ffd166';
        for (let i = -2; i <= 2; i += 1) {
          const a = -Math.PI / 2 + i * 0.32;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a - 0.12) * e.radius * 0.9, Math.sin(a - 0.12) * e.radius * 0.9);
          ctx.lineTo(Math.cos(a) * (e.radius + 18), Math.sin(a) * (e.radius + 18));
          ctx.lineTo(Math.cos(a + 0.12) * e.radius * 0.9, Math.sin(a + 0.12) * e.radius * 0.9);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
      // HP bar for tough enemies.
      if (e.hp < e.maxHp && (e.kind === 'brute' || e.kind === 'splitter' || e.kind === 'boss' || e.kind === 'spitter')) {
        const w = e.radius * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(e.x - w / 2, e.y - e.radius - 12, w, 5);
        ctx.fillStyle = colour;
        ctx.fillRect(e.x - w / 2, e.y - e.radius - 12, w * (e.hp / e.maxHp), 5);
      }
    }
  }

  function drawBullets(state) {
    for (const b of state.bullets) {
      if (!b.active) continue;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Math.atan2(b.vy, b.vx));
      ctx.fillStyle = b.crit ? '#ff9f1c' : PALETTE.bullet;
      ctx.shadowColor = '#ffd166';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (const o of state.orbs) {
      if (!o.active) continue;
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.fillStyle = '#c77dff';
      ctx.shadowColor = '#c77dff';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f3e8ff';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      if (!p.active) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.colour;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'center';
    for (const f of state.floaters) {
      if (!f.active) continue;
      ctx.globalAlpha = Math.min(1, f.life / 0.5);
      ctx.fillStyle = f.colour;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function bar(x, y, w, h, frac, fill, back) {
    ctx.fillStyle = back;
    roundRect(x, y, w, h, h / 2);
    ctx.fill();
    if (frac > 0) {
      ctx.fillStyle = fill;
      roundRect(x, y, w * Math.min(1, frac), h, h / 2);
      ctx.fill();
    }
  }

  function drawHud(state, best, muted, screen) {
    const p = state.player;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // Top-left: score and wave.
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 30px ${FONT}`;
    ctx.fillText(`SCORE ${state.score}`, 48, 66);
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(`WAVE ${state.wave}   •   KILLS ${p.kills}   •   BEST ${best}`, 48, 92);
    // Top-right: level and XP.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillText(`LEVEL ${p.level}`, FIELD.width - 48, 62);
    const need = xpForLevel(p.level);
    bar(FIELD.width - 268, 74, 220, 10, p.xp / need, '#4cc9f0', 'rgba(255,255,255,0.14)');
    ctx.font = `15px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(`${p.xp} / ${need} XP`, FIELD.width - 48, 104);
    // Bottom-left: HP bar and dash.
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillText(`HP ${Math.ceil(p.hp)} / ${p.maxHp}`, 48, FIELD.height - 78);
    bar(48, FIELD.height - 66, 240, 14, p.hp / p.maxHp, p.hp / p.maxHp > 0.3 ? '#7ee081' : '#ff5d73', 'rgba(255,255,255,0.14)');
    const dashFrac = p.dashCooldown <= 0 ? 1 : 1 - p.dashCooldown / 1.6;
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `14px ${FONT}`;
    ctx.fillText(p.dashCooldown <= 0 ? 'DASH READY  [Shift]' : 'DASH …', 48, FIELD.height - 42);
    bar(48, FIELD.height - 32, 120, 8, dashFrac, '#e0aaff', 'rgba(255,255,255,0.14)');
    // Bottom-right: controls hint and mute.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `14px ${FONT}`;
    ctx.fillText('WASD move  •  Mouse aim  •  Click shoot  •  Shift dash  •  P pause', FIELD.width - 48, FIELD.height - 36);
    ctx.fillText(muted ? 'MUTED [M]' : 'SOUND ON [M]', FIELD.width - 48, FIELD.height - 58);
    // Boss bar.
    if (state.boss && state.boss.active) {
      const b = state.boss;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff2e63';
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillText('THE HOLLOW KING', FIELD.width / 2, 66);
      bar(FIELD.width / 2 - 220, 76, 440, 12, b.hp / b.maxHp, '#ff2e63', 'rgba(255,255,255,0.14)');
    }
    // Wave banner while the next wave rests (play screen only: the upgrade
    // screen has its own overlay and the banner would bleed through it).
    if (!state.waveActive && p.hp > 0 && screen === SCREEN_PLAY) {
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.text;
      ctx.font = `bold 44px ${FONT}`;
      ctx.fillText(state.wave === 1 ? 'SURVIVE THE HOLLOW' : `WAVE ${state.wave}`, FIELD.width / 2, FIELD.height / 2 - 90);
      ctx.font = `18px ${FONT}`;
      ctx.fillStyle = PALETTE.muted;
      ctx.fillText('Get ready…', FIELD.width / 2, FIELD.height / 2 - 58);
    }
  }

  function drawTitle(state, best) {
    ctx.fillStyle = 'rgba(6, 6, 14, 0.45)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    // Ember glow behind the title.
    const glow = ctx.createRadialGradient(FIELD.width / 2, 250, 10, FIELD.width / 2, 250, 320);
    glow.addColorStop(0, 'rgba(255, 150, 60, 0.35)');
    glow.addColorStop(1, 'rgba(255, 150, 60, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(FIELD.width / 2 - 340, 0, 680, 520);
    ctx.fillStyle = '#ff9f1c';
    ctx.font = `bold 26px ${FONT}`;
    ctx.fillText('— A SURVIVAL ARENA —', FIELD.width / 2, 168);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 96px ${FONT}`;
    ctx.shadowColor = '#ff8a3d';
    ctx.shadowBlur = 34;
    ctx.fillText('EMBERFALL', FIELD.width / 2, 262);
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `20px ${FONT}`;
    ctx.fillText('The last ember-warden stands alone in the Hollow.', FIELD.width / 2, 306);
    ctx.fillText('Hold the arena. Slay the waves. Grow stronger with every shard.', FIELD.width / 2, 336);
    // Controls card.
    ctx.fillStyle = PALETTE.panel;
    roundRect(FIELD.width / 2 - 330, 372, 660, 118, 14);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 19px ${FONT}`;
    ctx.fillText('WASD / ARROWS — move      MOUSE — aim      CLICK / HOLD — shoot', FIELD.width / 2, 412);
    ctx.fillText('SHIFT — dash through danger      1 / 2 / 3 — pick an upgrade', FIELD.width / 2, 444);
    ctx.fillText('P — pause      M — mute      R — restart', FIELD.width / 2, 470);
    // Start prompt, pulsing.
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 4);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `bold 30px ${FONT}`;
    ctx.fillText('PRESS SPACE OR CLICK TO BEGIN', FIELD.width / 2, 556);
    ctx.globalAlpha = 1;
    if (best > 0) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `18px ${FONT}`;
      ctx.fillText(`Best score: ${best}`, FIELD.width / 2, 596);
    }
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `15px ${FONT}`;
    ctx.fillText('Waves grow harder. Every 5th wave the Hollow King comes. Survive as long as you can.', FIELD.width / 2, 664);
  }

  function drawUpgrade(state) {
    const choices = state.choices;
    ctx.fillStyle = 'rgba(6, 6, 14, 0.62)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `bold 40px ${FONT}`;
    ctx.fillText(`LEVEL ${state.player.level} — CHOOSE YOUR POWER`, FIELD.width / 2, 150);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `19px ${FONT}`;
    ctx.fillText('Click a card, or press 1, 2 or 3.', FIELD.width / 2, 186);
    const cardW = CARD.width;
    const cardH = CARD.height;
    const gap = CARD.gap;
    const totalW = choices.length * cardW + (choices.length - 1) * gap;
    const startX = (FIELD.width - totalW) / 2;
    const y = CARD.y;
    choices.forEach((u, i) => {
      const x = startX + i * (cardW + gap);
      const level = (state.player.upgrades[u.id] || 0) + 1;
      ctx.fillStyle = PALETTE.panel;
      roundRect(x, y, cardW, cardH, 16);
      ctx.fill();
      ctx.strokeStyle = u.colour;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = u.colour;
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillText(`LEVEL ${level} / ${u.max}`, x + cardW / 2, y + 34);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `bold 26px ${FONT}`;
      const words = u.name.split(' ');
      if (words.length > 1 && u.name.length > 12) {
        ctx.fillText(words.slice(0, -1).join(' '), x + cardW / 2, y + 84);
        ctx.fillText(words.slice(-1).join(' '), x + cardW / 2, y + 116);
      } else {
        ctx.fillText(u.name, x + cardW / 2, y + 98);
      }
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `19px ${FONT}`;
      ctx.fillText(u.line, x + cardW / 2, y + 158);
      ctx.fillStyle = u.colour;
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillText(`[ ${i + 1} ]`, x + cardW / 2, y + 206);
    });
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(6, 6, 14, 0.6)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 56px ${FONT}`;
    ctx.fillText('PAUSED', FIELD.width / 2, FIELD.height / 2 - 10);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `20px ${FONT}`;
    ctx.fillText('Press P or Space to keep fighting — R restarts the run', FIELD.width / 2, FIELD.height / 2 + 34);
  }

  function drawOver(state, best) {
    const p = state.player;
    ctx.fillStyle = 'rgba(10, 4, 8, 0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5d73';
    ctx.font = `bold 72px ${FONT}`;
    ctx.shadowColor = '#ff2e63';
    ctx.shadowBlur = 28;
    ctx.fillText('THE EMBER FADES', FIELD.width / 2, 220);
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 34px ${FONT}`;
    ctx.fillText(`SCORE  ${state.score}`, FIELD.width / 2, 300);
    ctx.font = `22px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(`Wave ${state.wave}  •  ${p.kills} slain  •  Level ${p.level}`, FIELD.width / 2, 342);
    const isBest = state.score >= best && state.score > 0;
    if (isBest) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `bold 26px ${FONT}`;
      ctx.fillText('★ NEW BEST SCORE ★', FIELD.width / 2, 392);
    } else {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `20px ${FONT}`;
      ctx.fillText(`Best: ${best}`, FIELD.width / 2, 392);
    }
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 4);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `bold 28px ${FONT}`;
    ctx.fillText('PRESS R OR CLICK TO PLAY AGAIN', FIELD.width / 2, 470);
    ctx.globalAlpha = 1;
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `16px ${FONT}`;
    ctx.fillText('The Hollow keeps what it takes. Light it up again.', FIELD.width / 2, 640);
  }

  function draw(state, screen, best, muted) {
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    // Screen shake, in field space.
    if (state.shake > 0) {
      const s = state.shake * 14;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    ctx.beginPath();
    ctx.rect(0, 0, FIELD.width, FIELD.height);
    ctx.clip();
    drawArena(state);
    drawGems(state);
    drawBullets(state);
    drawEnemies(state);
    drawPlayer(state);
    drawParticles(state);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_UPGRADE) {
      drawHud(state, best, muted, screen);
    }
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_UPGRADE) drawUpgrade(state);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawOver(state, best);
    // Vignette.
    const v = ctx.createRadialGradient(
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.42,
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.85,
    );
    v.addColorStop(0, 'rgba(4,4,10,0)');
    v.addColorStop(1, PALETTE.vignette);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.restore();
  }

  return { draw, resize, toField };
}
