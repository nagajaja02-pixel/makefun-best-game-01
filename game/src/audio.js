// All sound is synthesised with WebAudio: no audio files, nothing to load.
// Short blips and thuds for actions, and a slow two-oscillator drone with a
// wandering arpeggio for the arena's mood. Created lazily on the first user
// gesture, so browsers allow it; muted with M.

export function createAudio() {
  let context = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;

  // A minor pentatonic ladder the arpeggio walks, in Hz.
  const SCALE = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25];

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      musicGain = context.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      startMusic();
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!context || muted) return;
    const t0 = context.currentTime + (delay || 0);
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(dur, vol, lowpass) {
    if (!context || muted) return;
    const t0 = context.currentTime;
    const length = Math.max(1, Math.floor(context.sampleRate * dur));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = context.createGain();
    gain.gain.value = vol;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t0);
  }

  function startMusic() {
    // A slow drone: two detuned triangle waves a fifth apart.
    const drone = context.createOscillator();
    drone.type = 'triangle';
    drone.frequency.value = 110;
    const drone2 = context.createOscillator();
    drone2.type = 'triangle';
    drone2.frequency.value = 164.81;
    const droneGain = context.createGain();
    droneGain.gain.value = 0.05;
    drone.connect(droneGain);
    drone2.connect(droneGain);
    droneGain.connect(musicGain);
    drone.start();
    drone2.start();
    // One arpeggio note every 240 ms, wandering up and down the scale.
    musicTimer = window.setInterval(() => {
      if (muted || !context) return;
      musicStep += Math.random() < 0.5 ? 1 : -1;
      if (musicStep < 0) musicStep = 0;
      if (musicStep >= SCALE.length) musicStep = SCALE.length - 1;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = 'sine';
      osc.frequency.value = SCALE[musicStep];
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(0.12, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(musicGain);
      osc.start();
      osc.stop(context.currentTime + 0.55);
    }, 240);
  }

  return {
    unlock() {
      ensure();
    },
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    shoot() {
      tone(720, 0.09, 'square', 0.10, 340);
    },
    hit() {
      tone(180, 0.07, 'triangle', 0.14, 90);
    },
    kill() {
      noise(0.16, 0.22, 900);
      tone(320, 0.18, 'sawtooth', 0.10, 60);
    },
    hurt() {
      tone(140, 0.25, 'sawtooth', 0.22, 55);
      noise(0.2, 0.18, 500);
    },
    gem() {
      tone(880 + Math.random() * 220, 0.08, 'sine', 0.10, 1320);
    },
    dash() {
      noise(0.14, 0.14, 2400);
    },
    levelUp() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.22, 'sine', 0.14, null, i * 0.07));
    },
    waveClear() {
      [392.0, 523.25, 659.25].forEach((f, i) => tone(f, 0.25, 'triangle', 0.12, null, i * 0.09));
    },
    boss() {
      tone(98, 0.7, 'sawtooth', 0.2, 49);
      tone(147, 0.7, 'sawtooth', 0.14, 73.5);
    },
    gameOver() {
      [392.0, 329.63, 261.63, 196.0].forEach((f, i) => tone(f, 0.4, 'triangle', 0.14, null, i * 0.16));
    },
    destroy() {
      if (musicTimer !== null) window.clearInterval(musicTimer);
      if (context) context.close().catch(() => {});
    },
  };
}
