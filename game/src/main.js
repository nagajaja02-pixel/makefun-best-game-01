// Boot and the one loop: input is read once per frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens: title,
// play, upgrade, paused and game over.
//
// ?seed=N fixes the spawn pattern. ?shot=start|play|upgrade|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BOSS, EVENT_DASH, EVENT_GEM, EVENT_KILL, EVENT_LEVEL, EVENT_OVER, EVENT_PLAYER_HIT, EVENT_WAVE_CLEAR } from './world.js';
import { createAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_DASH, ACTION_MUTE, ACTION_PAUSE, ACTION_PICK_1, ACTION_PICK_2, ACTION_PICK_3, ACTION_RESTART, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, upgradeCardAt } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** Seconds after game over before a click or key may restart, so the shot that killed you cannot restart it. */
const RESTART_DELAY = 0.7;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, false);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const audio = createAudio();
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let overAt = 0;
  let gemSoundAt = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.startRun();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Survive the waves.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    overAt = performance.now();
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    audio.gameOver();
    announce(`The ember fades. Score ${world.state.score}. Best ${best}. Press R to play again.`);
  }

  function nearestEnemy() {
    const p = world.state.player;
    let target = null;
    let bestD = Infinity;
    for (const e of world.state.enemies) {
      if (!e.active) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; target = e; }
    }
    return target;
  }

  /** Aim from the mouse when it has moved; otherwise at the nearest enemy. */
  function aimVector() {
    const p = world.state.player;
    const mouse = input.mouse;
    if (mouse.seen) {
      const field = renderer.toField(mouse.x, mouse.y);
      const dx = field.x - p.x;
      const dy = field.y - p.y;
      if (Math.hypot(dx, dy) > 4) return { x: dx, y: dy };
    }
    const enemy = nearestEnemy();
    if (enemy) return { x: enemy.x - p.x, y: enemy.y - p.y };
    return { x: p.aimX, y: p.aimY };
  }

  function playSounds(events, now) {
    if (events & EVENT_PLAYER_HIT) audio.hurt();
    if (events & EVENT_KILL) audio.kill();
    if (events & EVENT_LEVEL) audio.levelUp();
    if (events & EVENT_WAVE_CLEAR) audio.waveClear();
    if (events & EVENT_BOSS) audio.boss();
    if (events & EVENT_DASH) audio.dash();
    if ((events & EVENT_GEM) && now - gemSoundAt > 90) {
      gemSoundAt = now;
      audio.gem();
    }
  }

  function pickUpgrade(index) {
    const choices = world.state.choices;
    if (index < 0 || index >= choices.length) return;
    world.applyUpgrade(choices[index]);
    world.state.pendingLevels -= 1;
    if (world.state.pendingLevels > 0) {
      world.state.choices = world.rollChoices();
    } else {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  /** React to this frame's one-shot actions. Returns true when the screen changed. */
  function handleActions(actions, now) {
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        audio.unlock();
        startGame();
      }
      return;
    }
    if (screen === SCREEN_OVER) {
      if (now - overAt > RESTART_DELAY * 1000 && (actions & (ACTION_CONFIRM | ACTION_RESTART))) {
        audio.unlock();
        startGame();
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (actions & ACTION_RESTART) {
        startGame();
      }
      return;
    }
    if (screen === SCREEN_UPGRADE) {
      if (actions & ACTION_PICK_1) pickUpgrade(0);
      else if (actions & ACTION_PICK_2) pickUpgrade(1);
      else if (actions & ACTION_PICK_3) pickUpgrade(2);
      else if (actions & ACTION_CONFIRM) {
        // A click on a card picks it; a click elsewhere does nothing.
        const mouse = input.mouse;
        const field = renderer.toField(mouse.x, mouse.y);
        const index = upgradeCardAt(world.state.choices, field.x, field.y);
        if (index >= 0) pickUpgrade(index);
      }
      return;
    }
    // SCREEN_PLAY
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & ACTION_RESTART) {
      startGame();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    const dash = (actions & ACTION_DASH) !== 0;
    handleActions(actions, now);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      let firstStep = true;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        if (screen === SCREEN_TITLE) {
          world.stepBackdrop(STEP);
          accumulator -= STEP;
        } else {
          const aim = aimVector();
          const events = world.step(
            STEP,
            input.move(),
            input.firing || input.spaceHeld,
            aim.x,
            aim.y,
            firstStep && dash,
          );
          firstStep = false;
          playSounds(events, now);
          accumulator -= STEP;
          if (events & EVENT_OVER) {
            endGame();
            accumulator = 0;
            break;
          }
          if (events & EVENT_LEVEL) {
            screen = SCREEN_UPGRADE;
            announce(`Level ${world.state.player.level}. Choose an upgrade.`);
            accumulator = 0;
            break;
          }
        }
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, audio.muted);
  }

  // Leaving the tab pauses a running game rather than letting enemies swarm unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // The first gesture unlocks audio (browsers require it).
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });

  announce('Emberfall. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
