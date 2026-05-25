export class Chiptune {
  constructor() {
    this.context = null;
    this.enabled = false;
    this.musicTimer = null;
    this.volume = 0.7;
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
  }

  toggle() {
    if (!this.context) this.context = new AudioContext();
    this.enabled = !this.enabled;
    if (this.enabled) this.startMusic();
    else this.stopMusic();
    return this.enabled;
  }

  blip(kind) {
    if (!this.enabled || !this.context) return;
    const presets = {
      build: [220, 330, 0.09, "square", 0.08],
      gather: [540, 680, 0.05, "triangle", 0.04],
      shoot: [720, 380, 0.045, "square", 0.035],
      repair: [260, 520, 0.12, "triangle", 0.07],
      warning: [160, 90, 0.24, "sawtooth", 0.08],
    };
    const [from, to, duration, wave, volume] = presets[kind] || presets.gather;
    this.tone(from, to, duration, wave, volume * this.volume);
  }

  tone(from, to, duration, wave = "square", volume = 0.06) {
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), now + duration);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain).connect(this.context.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  startMusic() {
    this.stopMusic();
    const notes = [196, 247, 294, 247, 220, 262, 330, 262];
    let index = 0;
    this.musicTimer = window.setInterval(() => {
      if (!this.enabled || !this.context) return;
      this.tone(notes[index % notes.length], notes[(index + 2) % notes.length], 0.14, "triangle", 0.018 * this.volume);
      index += 1;
    }, 420);
  }

  stopMusic() {
    if (this.musicTimer) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
}
