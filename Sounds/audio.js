class RetroSlotAudio {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.gakoPlayed = false;
    this.isSpinning = false;
    this.spinInterval = null;
    this.bgmInterval = null;
    
    // Volumes from user requirements
    this.gakoVol = 0.9;
    this.rebaVol = 0.75;
    this.botanVol = 1.0; 
  }

  async init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.value = 0.8;
      
      this.reelsGain = this.ctx.createGain();
      this.reelsGain.connect(this.masterGain);
      this.reelsGain.gain.value = 0.15;
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  // Mandatory for mobile: call on first user gesture
  async unlock() {
    await this.init();
    // Play a short silent buffer to "wake up" the AudioContext on iOS
    const silentBuffer = this.ctx.createBuffer(1, 1, 22050);
    const source = this.ctx.createBufferSource();
    source.buffer = silentBuffer;
    source.connect(this.ctx.destination);
    source.start(0);
  }

  async loadAllSounds() {
    const files = {
      gako: './Sounds/ziyagura-gako.mp3',
      reba: './Sounds/ziyagura-reba.mp3',
      botan: './Sounds/ziyagura-botan.mp3'
    };

    const promises = Object.entries(files).map(async ([key, url]) => {
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        this.buffers[key] = await this.ctx.decodeAudioData(arrayBuffer);
        console.log(`Loaded: ${key}`);
      } catch (e) {
        console.error(`Failed to load ${url}:`, e);
      }
    });

    await Promise.all(promises);
  }

  // Play an AudioBuffer using a fresh SourceNode every time
  playBuffer(bufferName, volume = 1.0) {
    if (!this.ctx || !this.buffers[bufferName]) return;
    
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffers[bufferName];
    
    const gainNode = this.ctx.createGain();
    gainNode.gain.value = volume;
    
    source.connect(gainNode);
    gainNode.connect(this.masterGain);
    
    source.start(0);
    
    // Auto-cleanup reference
    source.onended = () => {
      gainNode.disconnect();
      source.disconnect();
    };
  }

  // Helper to play a quick tone with pitch drop/envelope
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
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
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
      if (endHz) {
        osc.frequency.exponentialRampToValueAtTime(endHz, t + duration);
      }
      osc.start(t);
      osc.stop(t + duration);
    }
    setTimeout(() => gainNode.disconnect(), duration * 1000 + 100);
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
      if (!this.isSpinning) return;
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
    }, 120);
  }

  stopReelSpin() {
    this.isSpinning = false;
    if (this.spinInterval) {
      clearInterval(this.spinInterval);
      this.spinInterval = null;
    }
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
    setTimeout(() => gainNode.disconnect(), dur * 1000 + 100);
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
    this.stopBonusBGM();
    const tempo = 140;
    const beatSec = 60 / tempo;
    const notes = [523.25, 659.25, 783.99, 1046.50];
    let step = 0;
    this.bgmInterval = setInterval(() => {
      const t = this.ctx.currentTime;
      const freq = notes[step % notes.length];
      this.playTone('square', freq, freq * 0.9, 0.2, 0.2);
      if (step % 2 === 0) {
        this.playTone('sine', 120, 40, 0.15, 0.5);
      }
      step++;
    }, beatSec * 500);
  }

  stopBonusBGM() {
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
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

  playGako() {
    this.playBuffer('gako', this.gakoVol);
  }

  playBotan() {
    this.playBuffer('botan', this.botanVol);
  }

  playReba() {
    this.playBuffer('reba', this.rebaVol);
  }
}

