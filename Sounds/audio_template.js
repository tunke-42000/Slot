class RetroSlotAudio {
  constructor() {
    this.ctx = null;
    this.isSpinning = false;
    this.spinInterval = null;
    this.bgmInterval = null;
    this.buffers = {};
    
    // Injected Base64 Assets
    this.assets = {
      gako: "__GAKO_B64__",
      reba: "__REBA_B64__",
      botan: "__BOTAN_B64__"
    };

    // Payout table / Synthetic volume defaults
    this.masterVol = 0.8;
    this.reelsVol = 0.15;
  }

  // Helper: Base64 to ArrayBuffer
  _base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  async init(forceResume = false) {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.value = this.masterVol;
      
      this.reelsGain = this.ctx.createGain();
      this.reelsGain.connect(this.masterGain);
      this.reelsGain.gain.value = this.reelsVol;
    }
    if (forceResume && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
        console.log("[AudioEngine] Context resumed. state:", this.ctx.state);
      } catch (err) {
        console.warn("[AudioEngine] Resume failed:", err);
      }
    }
    return this.ctx;
  }

  // Pre-decode all embedded assets
  async loadAllSounds() {
    const ctx = await this.init(false);
    for (const [key, base64] of Object.entries(this.assets)) {
      try {
        const arrayBuffer = this._base64ToArrayBuffer(base64);
        this.buffers[key] = await new Promise((resolve, reject) => {
          ctx.decodeAudioData(arrayBuffer, resolve, reject);
        });
        console.log(`[AudioEngine] Decoded: ${key}`);
      } catch (e) {
        console.error(`[AudioEngine] Decode error (${key}):`, e);
      }
    }
    console.log("[AudioEngine] All assets ready.");
  }

  // Mandatory mobile gesture unlock
  async unlock() {
    console.log("[AudioEngine] Unlocking via gesture...");
    const ctx = await this.init(true);
    // Play silent buffer for iOS
    const silent = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = silent;
    source.connect(ctx.destination);
    source.start(0);
  }

  // High-performance playback via AudioBufferSourceNode
  // Limit simultaneous botan playback to prevent "noise wall"
  playBuffer(name, volume = 1.0) {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
       this.ctx.resume(); 
    }
    const buffer = this.buffers[name];
    if (!buffer) {
       console.warn(`[AudioEngine] Buffer not ready: ${name}`);
       return;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    
    const gainNode = this.ctx.createGain();
    gainNode.gain.value = volume;
    
    source.connect(gainNode);
    gainNode.connect(this.masterGain);
    
    // Slight offset (0.005s) to avoid potential clip/silence at start
    source.start(0, 0.005);
    
    source.onended = () => {
      gainNode.disconnect();
      source.disconnect();
    };
  }

  // --- Synthetic Tones ---
  playTone(type, startHz, endHz, duration, vol, isNoise = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const gainNode = this.ctx.createGain();
    gainNode.connect(this.masterGain);
    gainNode.gain.setValueAtTime(0, t);
    gainNode.gain.linearRampToValueAtTime(vol, t + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, t + duration);

    if (isNoise) {
      const bufferSize = this.ctx.sampleRate * duration;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(startHz, t);
      filter.frequency.exponentialRampToValueAtTime(endHz || 100, t + duration);
      noise.connect(filter);
      filter.connect(gainNode);
      noise.start(t);
      noise.stop(t + duration);
    } else {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.connect(gainNode);
      osc.frequency.setValueAtTime(startHz, t);
      if (endHz) osc.frequency.exponentialRampToValueAtTime(endHz, t + duration);
      osc.start(t);
      osc.stop(t + duration);
    }
    setTimeout(() => { if(gainNode) gainNode.disconnect(); }, duration * 1000 + 100);
  }

  playLever() {
    this.init();
    this.playTone('square', 150, 40, 0.1, 0.6);
    this.playTone('triangle', 800, 100, 0.05, 0.4, true);
  }

  startReelSpin() {
    this.init();
    if (this.isSpinning) return;
    this.isSpinning = true;
    this.spinInterval = setInterval(() => {
      if (!this.isSpinning || !this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(60, t);
      osc.frequency.exponentialRampToValueAtTime(30, t + 0.05);
      gain.connect(this.reelsGain);
      osc.connect(gain);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.5, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
      osc.start(t);
      osc.stop(t + 0.05);
      setTimeout(() => gain.disconnect(), 100);
    }, 150);
  }

  stopReelSpin() {
    this.isSpinning = false;
    if (this.spinInterval) { clearInterval(this.spinInterval); this.spinInterval = null; }
  }

  playPeka() {
    this.init();
    const t = this.ctx.currentTime;
    const dur = 0.4;
    const gainNode = this.ctx.createGain();
    gainNode.connect(this.masterGain);
    gainNode.gain.setValueAtTime(0, t);
    gainNode.gain.linearRampToValueAtTime(0.8, t + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.01, t + dur);
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046.50, t);
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1318.51, t);
    mod.type = 'sine';
    mod.frequency.setValueAtTime(2000, t);
    modGain.gain.setValueAtTime(1500, t);
    modGain.gain.exponentialRampToValueAtTime(10, t + 0.1);
    mod.connect(modGain);
    modGain.connect(osc.frequency);
    osc.connect(gainNode);
    osc2.connect(gainNode);
    osc.start(t);
    osc2.start(t);
    mod.start(t);
    osc.stop(t + dur);
    osc2.stop(t + dur);
    mod.stop(t + dur);
    setTimeout(() => { if(gainNode) gainNode.disconnect(); }, dur * 1000 + 100);
  }

  playBonus() {
    this.init();
    this.playPeka();
    setTimeout(() => {
      this.playTone('sine', 1046.50, 1046.50, 0.8, 0.5);
      this.playTone('triangle', 1567.98, 1567.98, 0.8, 0.3);
      this.playTone('sawtooth', 523.25, 523.25, 0.8, 0.2);
    }, 150);
  }

  playBonusBGM() {
    this.init();
    if (this.bgmInterval) return;
    const notes = [523.25, 659.25, 783.99, 1046.50];
    let step = 0;
    this.bgmInterval = setInterval(() => {
      if (!this.ctx) return;
      const freq = notes[step % notes.length];
      this.playTone('square', freq, freq * 0.9, 0.2, 0.2);
      if (step % 2 === 0) this.playTone('sine', 120, 40, 0.15, 0.5);
      step++;
    }, 214);
  }

  stopBonusBGM() {
    if (this.bgmInterval) { clearInterval(this.bgmInterval); this.bgmInterval = null; }
  }

  playPayoutCoin() {
    this.init();
    this.playTone('square', 2000, 3000, 0.1, 0.3);
  }

  playStart() {
    this.init();
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone('sine', freq, freq * 1.05, 0.3, 0.3), i * 100);
    });
  }

  // --- MP3 Handlers ---
  playGako() { this.playBuffer('gako', 0.9); }
  playBotan() { this.playBuffer('botan', 1.0); }
  playReba() { this.playBuffer('reba', 0.85); }
}
