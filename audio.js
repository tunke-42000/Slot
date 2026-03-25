class RetroSlotAudio {
  constructor() {
    // AudioContext will be initialized on first user interaction
    this.ctx = null;
    this.spinInterval = null;
    this.isSpinning = false;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.value = 0.8;
      
      this.reelsGain = this.ctx.createGain();
      this.reelsGain.connect(this.masterGain);
      this.reelsGain.gain.value = 0.15; // low volume "corocoro"
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
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
      // Create a short noise burst for click/hit impact
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
    
    // Cleanup
    setTimeout(() => gainNode.disconnect(), duration * 1000 + 100);
  }

  // 1. Lever / Spin trigger "Koton/Gachik" (weighty click)
  playLever() {
    this.init();
    // low thud
    this.playTone('square', 150, 40, 0.1, 0.6);
    // high click
    this.playTone('triangle', 800, 100, 0.05, 0.4, true);
  }

  // 2. Reel spinning "Corocoro" (analog rotation feel)
  startReelSpin() {
    this.init();
    if (this.isSpinning) return;
    this.isSpinning = true;
    
    // We simulate rolling by playing a soft click/thud repeatedly
    this.spinInterval = setInterval(() => {
      if (!this.isSpinning) return;
      // Very soft, low filtered tick
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
    }, 120); // About 8Hz rumble
  }

  stopReelSpin() {
    this.isSpinning = false;
    if (this.spinInterval) {
      clearInterval(this.spinInterval);
      this.spinInterval = null;
    }
  }

  // 3. Stop Buttons (1: Ka, 2: Ton, 3: Koto - increasing intensity)
  playStop(num) {
    this.init();
    if (num === 1) {
      this.playTone('square', 300, 100, 0.1, 0.5);   // "Ka"
    } else if (num === 2) {
      this.playTone('square', 350, 80, 0.12, 0.6);   // "Ton"
      this.playTone('sine', 150, 50, 0.1, 0.3);
    } else {
      this.playTone('triangle', 450, 60, 0.15, 0.8); // "Koto" (Strongest)
      this.playTone('square', 200, 40, 0.15, 0.5);
      this.playTone('noise', 1000, 100, 0.05, 0.3, true); // Extra snap
    }
  }

  // 4. PEKA Lamp "Powan/Pika/Rin" (NOT Kyuin, short, sharp, brain juice!)
  // Length: 0.2 - 0.5s. High pure tone resolving nicely.
  playPeka() {
    this.init();
    const t = this.ctx.currentTime;
    const dur = 0.4;
    
    const gainNode = this.ctx.createGain();
    gainNode.connect(this.masterGain);
    gainNode.gain.setValueAtTime(0, t);
    gainNode.gain.linearRampToValueAtTime(0.8, t + 0.02); // very fast attack
    gainNode.gain.exponentialRampToValueAtTime(0.01, t + dur);

    // FM Synthesis for a bell/ring like quality "Rin!" -> "Powan"
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    
    // Carrier 1 (Sine - pure "Powan")
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046.50, t); // C6

    // Carrier 2 (Triangle - adds a bit of edge "Pika")
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1318.51, t); // E6
    
    // Modulator (adds the "Rin" bell-like punch at the start)
    mod.type = 'sine';
    mod.frequency.setValueAtTime(2000, t);
    
    modGain.gain.setValueAtTime(1500, t);
    modGain.gain.exponentialRampToValueAtTime(10, t + 0.1); // Quick drop in brightness
    
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

  // 5. Bonus Confirm (Enhanced PEKA)
  playBonus() {
    this.init();
    this.playPeka(); // Starts with PEKA
    // Add a trailing majestic chord
    setTimeout(() => {
      this.playTone('sine', 1046.50, 1046.50, 0.8, 0.5); // C6
      this.playTone('triangle', 1567.98, 1567.98, 0.8, 0.3); // G6
    }, 150);
  }

  // 6. Payout (Charin Charin - fine rhythmic)
  playPayoutCoin() {
    this.init();
    const t = this.ctx.currentTime;
    
    const gain = this.ctx.createGain();
    gain.connect(this.masterGain);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(2000, t);
    osc.frequency.linearRampToValueAtTime(3000, t + 0.05);
    
    osc.connect(gain);
    osc.start(t);
    osc.stop(t + 0.1);
    
    setTimeout(() => gain.disconnect(), 150);
  }
}
