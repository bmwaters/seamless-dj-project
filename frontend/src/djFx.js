let audioContext = null;
let fxMaster = null;
let airhornCurve = null;

function getContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    return null;
  }
  if (!audioContext) {
    audioContext = new AudioCtx();
    fxMaster = null;
  }
  return audioContext;
}

function getFxMaster(ctx) {
  if (fxMaster) {
    return fxMaster;
  }

  const input = ctx.createGain();
  input.gain.value = 1;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 12;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.15;

  const output = ctx.createGain();
  output.gain.value = 2.6;

  input.connect(compressor);
  compressor.connect(output);
  output.connect(ctx.destination);
  fxMaster = input;
  return fxMaster;
}

export async function unlockDjFx() {
  const ctx = getContext();
  if (ctx && ctx.state === 'suspended') {
    await ctx.resume();
  }
}

function noiseBuffer(ctx, seconds) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function playNoiseSweep({ startFreq, endFreq, duration, peakGain, q, delay = 0 }) {
  const ctx = getContext();
  if (!ctx) {
    return;
  }

  const now = ctx.currentTime + delay;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, duration + 0.05);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(startFreq, now);
  filter.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 40), now + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peakGain, now + duration * 0.2);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(getFxMaster(ctx));
  source.start(now);
  source.stop(now + duration + 0.02);
}

export async function playWhoosh() {
  await unlockDjFx();
  playNoiseSweep({
    startFreq: 220,
    endFreq: 4800,
    duration: 3,
    peakGain: 1.1,
    q: 1.2,
  });
}

export async function playScratch() {
  await unlockDjFx();
  const bursts = [
    { startFreq: 1800, endFreq: 420, delay: 0 },
    { startFreq: 700, endFreq: 2400, delay: 0.35 },
    { startFreq: 2100, endFreq: 380, delay: 0.7 },
    { startFreq: 900, endFreq: 2600, delay: 1.1 },
    { startFreq: 1600, endFreq: 450, delay: 1.45 },
    { startFreq: 800, endFreq: 2200, delay: 1.85 },
    { startFreq: 1900, endFreq: 360, delay: 2.2 },
    { startFreq: 650, endFreq: 2000, delay: 2.6 },
  ];

  bursts.forEach((burst) => {
    playNoiseSweep({
      startFreq: burst.startFreq,
      endFreq: burst.endFreq,
      duration: 0.22,
      peakGain: 1.6,
      q: 2.4,
      delay: burst.delay,
    });
  });
}

function playSpinHit(startAt, duration, startFreq, endFreq, oscGainLevel, noiseGain) {
  const ctx = getContext();
  if (!ctx) {
    return;
  }

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(startFreq, startAt);
  osc.frequency.exponentialRampToValueAtTime(endFreq, startAt + duration);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(oscGainLevel, startAt);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  osc.connect(oscGain);
  oscGain.connect(getFxMaster(ctx));
  osc.start(startAt);
  osc.stop(startAt + duration);

  playNoiseSweep({
    startFreq: startFreq * 2.2,
    endFreq: endFreq * 1.4,
    duration,
    peakGain: noiseGain,
    q: 2.4,
    delay: Math.max(0, startAt - ctx.currentTime),
  });
}

export async function playSpinback() {
  await unlockDjFx();
  const ctx = getContext();
  if (!ctx) {
    return;
  }
  playSpinHit(ctx.currentTime, 3, 880, 55, 0.28, 0.7);
}

export async function playHypeSpins() {
  await unlockDjFx();
  const ctx = getContext();
  if (!ctx) {
    return;
  }

  const now = ctx.currentTime;
  const hits = [0, 0.38, 0.76, 1.14, 1.52];
  hits.forEach((offset, index) => {
    const startFreq = 920 - index * 40;
    playSpinHit(now + offset, 0.32, startFreq, 70, 0.36, 0.75);
  });
}

function getAirhornCurve() {
  if (airhornCurve) {
    return airhornCurve;
  }
  const samples = 44100;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(x * 6);
  }
  airhornCurve = curve;
  return airhornCurve;
}

function playAirhornBlast(startAt, duration, startFreq, endFreq) {
  const ctx = getContext();
  if (!ctx) {
    return;
  }

  const mix = ctx.createGain();
  mix.gain.value = 0.7;

  const shaper = ctx.createWaveShaper();
  shaper.curve = getAirhornCurve();
  shaper.oversample = '4x';

  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 180;

  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 0.7;
  band.frequency.setValueAtTime(2600, startAt);
  band.frequency.exponentialRampToValueAtTime(720, startAt + duration);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, startAt);
  env.gain.exponentialRampToValueAtTime(2.4, startAt + 0.008);
  env.gain.setValueAtTime(2.2, startAt + Math.max(0.04, duration - 0.07));
  env.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  // Downward "bwa" scoop on a brassy dual-tone horn.
  const ratios = [1, 1.24, 2, 2.48];
  const types = ['square', 'square', 'sawtooth', 'square'];
  ratios.forEach((ratio, index) => {
    const osc = ctx.createOscillator();
    osc.type = types[index];
    osc.frequency.setValueAtTime(startFreq * ratio, startAt);
    osc.frequency.exponentialRampToValueAtTime(endFreq * ratio, startAt + duration);
    osc.connect(mix);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.02);
  });

  playNoiseSweep({
    startFreq: 1800,
    endFreq: 400,
    duration: Math.min(duration, 0.16),
    peakGain: 0.55,
    q: 1.4,
    delay: Math.max(0, startAt - ctx.currentTime),
  });

  mix.connect(shaper);
  shaper.connect(highpass);
  highpass.connect(band);
  band.connect(env);
  env.connect(getFxMaster(ctx));
}

export async function playAirhorn() {
  await unlockDjFx();
  const ctx = getContext();
  if (!ctx) {
    return;
  }
  const now = ctx.currentTime;
  playAirhornBlast(now, 0.11, 700, 310);
  playAirhornBlast(now + 0.15, 0.11, 700, 310);
  playAirhornBlast(now + 0.3, 0.11, 700, 310);
  playAirhornBlast(now + 0.45, 0.78, 660, 270);
}

export async function playVinylStop() {
  await unlockDjFx();
  const ctx = getContext();
  if (!ctx) {
    return;
  }
  playSpinHit(ctx.currentTime, 0.85, 420, 28, 0.32, 0.75);
}

export async function playSiren() {
  await unlockDjFx();
  const ctx = getContext();
  if (!ctx) {
    return;
  }

  const now = ctx.currentTime;
  const duration = 1.7;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(320, now);
  osc.frequency.exponentialRampToValueAtTime(1400, now + duration);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 8;
  filter.frequency.setValueAtTime(900, now);
  filter.frequency.exponentialRampToValueAtTime(3200, now + duration);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(1.4, now + 0.05);
  env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(filter);
  filter.connect(env);
  env.connect(getFxMaster(ctx));
  osc.start(now);
  osc.stop(now + duration + 0.02);

  playNoiseSweep({
    startFreq: 400,
    endFreq: 2800,
    duration,
    peakGain: 0.45,
    q: 1.1,
  });
}

export async function playImpact() {
  await unlockDjFx();
  const ctx = getContext();
  if (!ctx) {
    return;
  }

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(90, now);
  osc.frequency.exponentialRampToValueAtTime(32, now + 0.42);

  const env = ctx.createGain();
  env.gain.setValueAtTime(2.8, now);
  env.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

  osc.connect(env);
  env.connect(getFxMaster(ctx));
  osc.start(now);
  osc.stop(now + 0.48);

  playNoiseSweep({
    startFreq: 200,
    endFreq: 60,
    duration: 0.18,
    peakGain: 1.4,
    q: 0.8,
  });
}

export async function playEchoOut() {
  await unlockDjFx();
  const ctx = getContext();
  if (!ctx) {
    return;
  }

  const now = ctx.currentTime;
  for (let i = 0; i < 8; i += 1) {
    const startAt = now + i * 0.26;
    const level = 1.3 * Math.pow(0.68, i);
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, startAt);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800 - i * 160, startAt);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, startAt);
    env.gain.exponentialRampToValueAtTime(Math.max(level, 0.02), startAt + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.18);

    osc.connect(filter);
    filter.connect(env);
    env.connect(getFxMaster(ctx));
    osc.start(startAt);
    osc.stop(startAt + 0.2);
  }
}
