const STATE_IDLE = 0;
const STATE_SPINNING = 1;
const STATE_STOPPING = 2; // During the 3 stops
const STATE_PAYOUT = 3;

let gameState = STATE_IDLE;
let stopsPressed = 0;
let isHit = false; // Pre-determined win
let hitPattern = 0; // 1-4 for different timing patterns
let credits = 50;
let audioEngine;
let payoutInterval = null;

// DOM Elements
const spinLever = document.getElementById('spin-lever');
const stopBtns = [
  document.getElementById('btn-stop-1'),
  document.getElementById('btn-stop-2'),
  document.getElementById('btn-stop-3')
];
const pekaLamp = document.getElementById('peka-lamp');
const reels = document.querySelectorAll('.reel-strip');
const creditDisplay = document.getElementById('credit-display');
const payoutDisplay = document.getElementById('payout-display');

function initGame() {
  audioEngine = new RetroSlotAudio();
  
  spinLever.addEventListener('mousedown', handleSpin);
  spinLever.addEventListener('touchstart', (e) => { e.preventDefault(); handleSpin(); });

  stopBtns.forEach((btn, index) => {
    btn.addEventListener('mousedown', () => handleStop(index));
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); handleStop(index); });
  });

  updateDisplays();
}

function handleSpin() {
  if (gameState !== STATE_IDLE) return;
  if (credits < 3) return; // Need 3 coins to play

  credits -= 3;
  updateDisplays();

  // Determine hit and pattern instantly
  isHit = Math.random() < 0.2; // 20% hit rate for testing (make it feel good)
  if (isHit) {
    // 1: Normal (Stop 3 -> 0.2s), 2: Tease (0.5s), 3: Incongruity, 4: Delay
    hitPattern = Math.floor(Math.random() * 4) + 1; 
  } else {
    hitPattern = 0;
  }

  // Audio & State
  gameState = STATE_SPINNING;
  pekaLamp.classList.remove('peka-active');
  stopsPressed = 0;
  stopBtns.forEach(btn => {
    btn.disabled = false;
    btn.style.opacity = '1';
  });
  spinLever.disabled = true;

  // Pattern 4: Delay spin
  if (isHit && hitPattern === 4) {
    // Play lever sound, but start reels late! -> "Brain trick"
    audioEngine.playLever();
    setTimeout(() => {
      startReels();
    }, 400); // 0.4s weird delay
  } else {
    audioEngine.playLever();
    startReels();
  }
}

function startReels() {
  audioEngine.startReelSpin();
  reels.forEach(reel => reel.style.animation = 'scrollReel 0.1s linear infinite');
  gameState = STATE_STOPPING;
}

function handleStop(index) {
  if (gameState !== STATE_STOPPING) return;
  if (stopBtns[index].disabled) return; // Already pressed

  stopBtns[index].disabled = true;
  stopBtns[index].style.opacity = '0.5';
  stopsPressed++;

  // Stop visual reel
  reels[index].style.animation = 'none';

  // Audio for stop
  // Pattern 3: Incongruity
  if (isHit && hitPattern === 3 && stopsPressed === 1) {
    // Silent stop! Extremely uncomfortable/weird feel
  } else {
    audioEngine.playStop(stopsPressed);
  }

  if (stopsPressed === 3) {
    audioEngine.stopReelSpin();
    checkResult();
  }
}

function checkResult() {
  gameState = STATE_PAYOUT;
  
  if (isHit) {
    let delay = 0;
    if (hitPattern === 1) delay = 200; // Basic 0.2s
    else if (hitPattern === 2) delay = 500; // Tease 0.5s
    else if (hitPattern === 3) delay = 0; // Instant
    else if (hitPattern === 4) delay = 200;

    setTimeout(() => {
      triggerPeka();
    }, delay);
  } else {
    // Miss: Reset quickly so player can play again immediately. Short cycle is important!
    setTimeout(resetTurn, 300);
  }
}

function triggerPeka() {
  pekaLamp.classList.add('peka-active');
  audioEngine.playPeka();
  
  // Wait a moment before starting payout to let them soak in the glory
  setTimeout(() => {
    startPayout(150); // 150 payout
  }, 1000);
}

function startPayout(amount) {
  let paid = 0;
  payoutInterval = setInterval(() => {
    paid++;
    credits++;
    payoutDisplay.innerText = paid;
    creditDisplay.innerText = credits;
    
    audioEngine.playPayoutCoin();
    
    if (paid >= amount) {
      clearInterval(payoutInterval);
      setTimeout(resetTurn, 500); // Back to idle
    }
  }, 100); // Very fast, continuous charin charin
}

function resetTurn() {
  gameState = STATE_IDLE;
  spinLever.disabled = false;
  payoutDisplay.innerText = '0';
  updateDisplays();
}

function updateDisplays() {
  creditDisplay.innerText = credits;
}

// Start
document.addEventListener('DOMContentLoaded', initGame);
