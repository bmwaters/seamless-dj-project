let audioContext = null;
let fxMaster = null;
const bufferCache = new Map();

const FX_FILES = {
  scratch: '/fx/scratch.wav',
  applause: '/fx/applause.wav',
  hype: '/fx/hype.wav',
  airhorn: '/fx/airhorn.wav',
  vinylStop: '/fx/vinyl-stop.wav',
  chime: '/fx/chime.wav',
  impact: '/fx/impact.wav',
  echoOut: '/fx/echo-out.wav',
};

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
  output.gain.value = 2.4;

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

function noiseBuffer(ctx, seconds) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

async function loadBuffer(ctx, url) {
  if (bufferCache.has(url)) {
    return bufferCache.get(url);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Missing FX file: ${url}`);
  }
  const data = await response.arrayBuffer();
  const buffer = await ctx.decodeAudioData(data.slice(0));
  bufferCache.set(url, buffer);
  return buffer;
}

async function playSample(url, volume = 1) {
  await unlockDjFx();
  const ctx = getContext();
  if (!ctx) {
    return;
  }
  const buffer = await loadBuffer(ctx, url);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(getFxMaster(ctx));
  source.start();
}

export async function playScratch() {
  await playSample(FX_FILES.scratch, 1.15);
}

export async function playApplause() {
  await playSample(FX_FILES.applause, 1.05);
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

export async function playAirhorn() {
  await playSample(FX_FILES.airhorn, 1.2);
}

export async function playVinylStop() {
  await playSample(FX_FILES.vinylStop, 1.1);
}

export async function playChime() {
  await playSample(FX_FILES.chime, 1);
}

export async function playImpact() {
  await playSample(FX_FILES.impact, 1.25);
}

export async function playEchoOut() {
  await playSample(FX_FILES.echoOut, 1.05);
}
