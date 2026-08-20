let audioContext = null;

function getContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    return null;
  }
  if (!audioContext) {
    audioContext = new AudioCtx();
  }
  return audioContext;
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
  gain.connect(ctx.destination);
  source.start(now);
  source.stop(now + duration + 0.02);
}

export async function playWhoosh() {
  await unlockDjFx();
  playNoiseSweep({
    startFreq: 220,
    endFreq: 4800,
    duration: 3,
    peakGain: 0.5,
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
      peakGain: 0.85,
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
  oscGain.connect(ctx.destination);
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
  playSpinHit(ctx.currentTime, 3, 880, 55, 0.11, 0.26);
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
    playSpinHit(now + offset, 0.32, startFreq, 70, 0.16, 0.32);
  });
}
