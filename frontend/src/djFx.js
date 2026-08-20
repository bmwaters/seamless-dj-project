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
      duration: 0.18,
      peakGain: 0.4,
      q: 3.6,
      delay: burst.delay,
    });
  });
}

export async function playSpinback() {
  await unlockDjFx();
  const ctx = getContext();
  if (!ctx) {
    return;
  }

  const now = ctx.currentTime;
  const duration = 3;

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(55, now + duration);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.11, now);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration);

  playNoiseSweep({
    startFreq: 2600,
    endFreq: 120,
    duration,
    peakGain: 0.26,
    q: 2,
  });
}
