// Synthesised sound, no audio files. Every voice follows a physical quantity:
// motor whine = motor speed (wheel rpm x gear ratio), its loudness = torque; thruster hiss = gas mass flow;
// fans = fan level; tyre squeal = slip past the grip peak; wind = airspeed squared; thumps = touchdown speed.
export class Audio {
  constructor() { this.ctx = null; this.volume = 0.7; this.muted = false; }
  start() { // must be called from a user gesture (browser autoplay rules)
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    let C; try { C = this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; } // no audio device: stay silent
    this.master = C.createGain(); this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = C.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(C.destination);
    const noise = C.createBuffer(1, C.sampleRate * 2, C.sampleRate), d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = () => { const s = C.createBufferSource(); s.buffer = noise; s.loop = true; s.start(); return s; };
    const voice = (node) => { const g = C.createGain(); g.gain.value = 0; node.connect(g).connect(this.master); return g; };
    const filt = (type, f, Q = 1) => { const b = C.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b; };
    // motor: two detuned saws through a resonant band (inverter whine), plus a quiet sine an octave down
    this.mOsc = [C.createOscillator(), C.createOscillator(), C.createOscillator()];
    this.mOsc[0].type = 'sawtooth'; this.mOsc[1].type = 'sawtooth'; this.mOsc[2].type = 'sine';
    const mBand = filt('bandpass', 900, 2.5); this.mBand = mBand;
    this.mOsc.forEach((o) => { o.start(); o.connect(o.type === 'sine' ? this.master : mBand); });
    this.motor = voice(mBand); this.mSine = C.createGain(); this.mSine.gain.value = 0; this.mOsc[2].disconnect(); this.mOsc[2].connect(this.mSine).connect(this.master);
    // thrusters: bright hiss + low roar
    const hiss = src(); this.hissF = filt('highpass', 1800); this.hiss = voice(hiss.connect(this.hissF));
    const roar = src(); this.roar = voice(roar.connect(filt('lowpass', 220)));
    // fans: broadband whoosh with a blade-pass tone
    const fanN = src(); this.fan = voice(fanN.connect(filt('bandpass', 420, 0.8)));
    this.blade = C.createOscillator(); this.blade.type = 'triangle'; this.blade.start(); this.bladeG = voice(this.blade);
    // tyres + wind
    const sq = src(); this.squealF = filt('bandpass', 1400, 9); this.squeal = voice(sq.connect(this.squealF));
    const wind = src(); this.windF = filt('lowpass', 500); this.wind = voice(wind.connect(this.windF));
    this.noiseBuf = noise;
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05); }
  toggleMute() { this.muted = !this.muted; this.setVolume(this.volume); return this.muted; }
  thump(strength) { // touchdown / impact: filtered noise burst
    if (!this.ctx || strength < 0.05) return;
    const C = this.ctx, s = C.createBufferSource(); s.buffer = this.noiseBuf;
    const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160 + 300 * strength;
    const g = C.createGain(), t = C.currentTime; g.gain.setValueAtTime(Math.min(1.2, strength), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    s.connect(f).connect(g).connect(this.master); s.start(t); s.stop(t + 0.4);
  }
  servo(on) { // door / wing actuator sweep
    if (!this.ctx) return;
    const C = this.ctx, o = C.createOscillator(), g = C.createGain(), t = C.currentTime;
    o.type = 'square'; o.frequency.setValueAtTime(on ? 180 : 260, t); o.frequency.linearRampToValueAtTime(on ? 260 : 180, t + 1.1);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.03, t + 0.1); g.gain.linearRampToValueAtTime(0.0001, t + 1.2);
    const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; o.connect(f).connect(g).connect(this.master); o.start(t); o.stop(t + 1.25);
  }
  update(v, slowmo = 1) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime, set = (p, x, tc = 0.06) => p.setTargetAtTime(x, t, tc);
    const om = v.wheels.reduce((s, w) => s + Math.abs(w.omega || 0), 0) / 4, motorHz = (om * 9.0) / (2 * Math.PI) * 6 * slowmo; // 9:1 gear, 6 pole pairs
    const load = Math.min(1, Math.abs(v.input.throttle) + Math.abs(v.battery?.kw || 0) / 900);
    this.mOsc[0].frequency.setTargetAtTime(40 + motorHz, t, 0.05); this.mOsc[1].frequency.setTargetAtTime(40 + motorHz * 1.007, t, 0.05); this.mOsc[2].frequency.setTargetAtTime(20 + motorHz / 2, t, 0.05);
    set(this.mBand.frequency, 500 + motorHz * 1.2);
    set(this.motor.gain, Math.min(0.12, om * 0.002) * (0.25 + 0.75 * load)); set(this.mSine.gain, Math.min(0.05, om * 0.001) * load);
    const flow = Math.min(1, (v.massFlow || 0) / 120);
    set(this.hiss.gain, 0.32 * flow, 0.02); set(this.roar.gain, 0.5 * flow, 0.03); set(this.hissF.frequency, 1200 + 2400 * flow);
    set(this.fan.gain, 0.12 * (v.fanLevel || 0)); this.blade.frequency.setTargetAtTime(60 + 140 * (v.fanLevel || 0), t, 0.2); set(this.bladeG.gain, 0.03 * (v.fanLevel || 0));
    const slide = v.wheels.reduce((m, w) => Math.max(m, w.contact ? (w.slip || 0) - 1.05 : 0), 0);
    set(this.squeal.gain, v.speed > 2 ? Math.min(0.18, slide * 0.3) : 0, 0.03); set(this.squealF.frequency, 1200 + 300 * Math.sin(t * 7));
    const a = Math.min(1, (v.speed / 90) ** 2); set(this.wind.gain, 0.25 * a); set(this.windF.frequency, 300 + 1500 * a);
  }
}
