// Real Web Audio API synthesizer for Streetwear Boom-Bap & 808 beats

let audioCtx: AudioContext | null = null;
let currentLoopTimer: number | null = null;
let isLoopPlaying = false;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function play808Kick(ctx: AudioContext, time: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);

  gain.gain.setValueAtTime(0.8, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.45);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(time);
  osc.stop(time + 0.5);
}

export function playSnare(ctx: AudioContext, time: number) {
  // Noise buffer
  const bufferSize = ctx.sampleRate * 0.15;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 800;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.4, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noise.start(time);
  noise.stop(time + 0.15);
}

export function playHiHat(ctx: AudioContext, time: number) {
  const bufferSize = ctx.sampleRate * 0.05;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 6000;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.25, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noise.start(time);
  noise.stop(time + 0.05);
}

export function toggleBeatPlayback(onStateChange?: (playing: boolean) => void) {
  const ctx = getAudioContext();

  if (isLoopPlaying) {
    if (currentLoopTimer !== null) {
      window.clearInterval(currentLoopTimer);
      currentLoopTimer = null;
    }
    isLoopPlaying = false;
    onStateChange?.(false);
    return false;
  }

  isLoopPlaying = true;
  onStateChange?.(true);

  let step = 0;
  const bpm = 92;
  const stepTime = (60 / bpm) / 4; // 16th note

  const playStep = () => {
    if (!isLoopPlaying) return;
    const now = ctx.currentTime;

    // Pattern (16 steps)
    // Kicks on 0, 7, 10
    if (step === 0 || step === 7 || step === 10) {
      play808Kick(ctx, now);
    }
    // Snares on 4, 12
    if (step === 4 || step === 12) {
      playSnare(ctx, now);
    }
    // HiHats on every second 16th
    if (step % 2 === 0) {
      playHiHat(ctx, now);
    }

    step = (step + 1) % 16;
  };

  playStep();
  currentLoopTimer = window.setInterval(playStep, stepTime * 1000);
  return true;
}
