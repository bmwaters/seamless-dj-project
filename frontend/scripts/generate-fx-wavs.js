const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const OUT_DIR = path.join(__dirname, '..', 'public', 'fx');

function clamp(value) {
  return Math.max(-1, Math.min(1, value));
}

function writeWav(filename, samples) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i += 1) {
    buffer.writeInt16LE(Math.round(clamp(samples[i]) * 32767), 44 + i * 2);
  }
  fs.writeFileSync(path.join(OUT_DIR, filename), buffer);
}

function normalize(samples, peak = 0.92) {
  let max = 0.0001;
  for (let i = 0; i < samples.length; i += 1) {
    max = Math.max(max, Math.abs(samples[i]));
  }
  const gain = peak / max;
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] *= gain;
  }
  return samples;
}

function mixAt(target, source, offset, gain = 1) {
  for (let i = 0; i < source.length; i += 1) {
    const index = offset + i;
    if (index >= 0 && index < target.length) {
      target[index] += source[i] * gain;
    }
  }
}

function envelope(samples, attack, release) {
  const attackN = Math.max(1, Math.floor(attack * SAMPLE_RATE));
  const releaseN = Math.max(1, Math.floor(release * SAMPLE_RATE));
  for (let i = 0; i < samples.length; i += 1) {
    let env = 1;
    if (i < attackN) {
      env = i / attackN;
    }
    const remain = samples.length - i;
    if (remain < releaseN) {
      env *= remain / releaseN;
    }
    samples[i] *= env;
  }
  return samples;
}

function noise(length) {
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    samples[i] = Math.random() * 2 - 1;
  }
  return samples;
}

function biquadBandpass(input, freq, q) {
  const omega = (2 * Math.PI * freq) / SAMPLE_RATE;
  const alpha = Math.sin(omega) / (2 * q);
  const cosw = Math.cos(omega);
  const b0 = alpha;
  const b1 = 0;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * cosw;
  const a2 = 1 - alpha;
  const out = new Float32Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i += 1) {
    const x0 = input[i];
    const y0 = (b0 / a0) * x0 + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

function osc(length, type, freqFn, gainFn) {
  const samples = new Float32Array(length);
  let phase = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    const freq = freqFn(t, i);
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    let wave = Math.sin(phase);
    if (type === 'square') {
      wave = Math.sin(phase) > 0 ? 1 : -1;
    } else if (type === 'saw') {
      wave = 2 * ((phase / (2 * Math.PI)) % 1) - 1;
    }
    samples[i] = wave * gainFn(t, i);
  }
  return samples;
}

function seconds(value) {
  return Math.floor(value * SAMPLE_RATE);
}

function makeScratch() {
  const out = new Float32Array(seconds(0.7));
  const bursts = [
    [0, 0.09, 1800, 420],
    [0.12, 0.08, 700, 2400],
    [0.24, 0.1, 2100, 380],
    [0.38, 0.09, 900, 2000],
  ];
  bursts.forEach(([start, dur, from, to]) => {
    const n = seconds(dur);
    const raw = noise(n);
    const high = biquadBandpass(raw, from, 2.4);
    const low = biquadBandpass(raw, to, 2.4);
    const burst = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const t = i / n;
      burst[i] = (high[i] * (1 - t) + low[i] * t) * Math.sin(Math.PI * t);
    }
    mixAt(out, burst, seconds(start), 1.5);
  });
  return normalize(out);
}

function makeCrowd(duration, density) {
  const out = new Float32Array(seconds(duration));
  const grains = Math.floor(duration * density);
  for (let g = 0; g < grains; g += 1) {
    const start = Math.random() * (duration - 0.08);
    const dur = 0.04 + Math.random() * 0.12;
    const n = seconds(dur);
    const raw = biquadBandpass(noise(n), 1200 + Math.random() * 2800, 1.1 + Math.random());
    envelope(raw, 0.005, dur * 0.6);
    mixAt(out, raw, seconds(start), 0.08 + Math.random() * 0.12);
  }
  envelope(out, 0.08, 0.35);
  return out;
}

function makeApplause() {
  return normalize(makeCrowd(1.8, 220));
}

function makeHype() {
  const out = makeCrowd(0.7, 320);
  const woo = osc(
    seconds(0.35),
    'sine',
    (t) => 520 - t * 90,
    (t) => Math.exp(-t * 6) * 0.25
  );
  mixAt(out, woo, seconds(0.05), 1);
  mixAt(out, woo, seconds(0.22), 0.8);
  return normalize(out);
}

function airhornBlast(duration, startFreq, endFreq) {
  const n = seconds(duration);
  const out = new Float32Array(n);
  const ratios = [1, 1.24, 2, 2.48];
  const types = ['square', 'square', 'saw', 'square'];
  ratios.forEach((ratio, index) => {
    const tone = osc(
      n,
      types[index],
      (t) => {
        const p = Math.min(1, t / duration);
        return (startFreq + (endFreq - startFreq) * p) * ratio;
      },
      (t) => {
        const attack = Math.min(1, t / 0.01);
        const release = Math.min(1, (duration - t) / 0.06);
        return 0.18 * attack * Math.max(0, release);
      }
    );
    mixAt(out, tone, 0, 1);
  });
  const rasp = biquadBandpass(noise(n), 1600, 0.8);
  envelope(rasp, 0.005, duration * 0.5);
  mixAt(out, rasp, 0, 0.12);
  return out;
}

function makeAirhorn() {
  const out = new Float32Array(seconds(1.35));
  mixAt(out, airhornBlast(0.11, 700, 310), seconds(0), 1);
  mixAt(out, airhornBlast(0.11, 700, 310), seconds(0.15), 1);
  mixAt(out, airhornBlast(0.11, 700, 310), seconds(0.3), 1);
  mixAt(out, airhornBlast(0.78, 660, 270), seconds(0.45), 1);
  return normalize(out);
}

function makeVinylStop() {
  const n = seconds(0.9);
  const tone = osc(
    n,
    'saw',
    (t) => 420 * Math.pow(28 / 420, t / 0.9),
    (t) => Math.exp(-t * 2.2) * 0.55
  );
  const rasp = biquadBandpass(
    noise(n),
    800,
    1.4
  );
  for (let i = 0; i < n; i += 1) {
    const t = i / SAMPLE_RATE;
    rasp[i] *= Math.exp(-t * 3) * 0.35;
  }
  mixAt(tone, rasp, 0, 1);
  return normalize(tone);
}

function makeImpact() {
  const n = seconds(0.55);
  const body = osc(
    n,
    'sine',
    (t) => 90 * Math.pow(32 / 90, t / 0.45),
    (t) => Math.exp(-t * 6) * 0.95
  );
  const click = biquadBandpass(noise(seconds(0.08)), 180, 0.7);
  envelope(click, 0.001, 0.07);
  mixAt(body, click, 0, 0.7);
  return normalize(body);
}

function makeEchoOut() {
  const out = new Float32Array(seconds(2.1));
  for (let i = 0; i < 7; i += 1) {
    const n = seconds(0.16);
    const stab = osc(
      n,
      'sine',
      () => 196,
      (t) => Math.exp(-t * 18) * (0.9 * Math.pow(0.62, i))
    );
    const air = biquadBandpass(noise(n), 1400 - i * 80, 0.9);
    envelope(air, 0.002, 0.12);
    mixAt(out, stab, seconds(i * 0.26), 1);
    mixAt(out, air, seconds(i * 0.26), 0.12 * Math.pow(0.7, i));
  }
  return normalize(out);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
writeWav('scratch.wav', makeScratch());
writeWav('applause.wav', makeApplause());
writeWav('hype.wav', makeHype());
writeWav('airhorn.wav', makeAirhorn());
writeWav('vinyl-stop.wav', makeVinylStop());
writeWav('impact.wav', makeImpact());
writeWav('echo-out.wav', makeEchoOut());
console.log('Wrote FX wavs to', OUT_DIR);
