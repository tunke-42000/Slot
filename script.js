const STATE_IDLE = 0;
const STATE_SPINNING = 1;
const STATE_PAYOUT = 2;
const STATE_BONUS = 3;

let gameState = STATE_IDLE;
let credits = 100;
let bonusGamesRemaining = 0;
let isBonusMode = false;
let audioEngine;
let payoutInterval = null;

const SYMBOLS = {
  S7: "<div class='sym-7'>7<span class='star'>★</span></div>",
  BAR: "<div class='sym-bar'>BAR</div>",
  BELL: "<div class='sym-bell'></div>",
  PIERROT: "<div class='sym-clown'><div class='clown-eye left'></div><div class='clown-eye right'></div><div class='clown-nose'></div><div class='clown-mouth'></div></div>",
  GRAPE: "<div class='sym-grape'><div class='grape-dot'></div><div class='grape-dot'></div><div class='grape-dot'></div><div class='grape-dot'></div><div class='grape-dot'></div><div class='grape-dot'></div></div>",
  CHERRY: "<div class='sym-cherry'><div class='cherry-dot'></div><div class='cherry-dot'></div><div class='cherry-stem'></div></div>",
  BLANK: "<div class='symbol-blank'></div>" 
};

const WIN_TYPES = {
  BIG: 'BIG',
  REG: 'REG',
  BELL: 'BELL',
  PIERROT: 'PIERROT',
  GRAPE: 'GRAPE',
  CHERRY: 'CHERRY',
  LOSE: 'LOSE'
};

const PAYOUTS = {
  BIG: 60,
  REG: 25,
  BELL: 6,
  PIERROT: 4,
  GRAPE: 2,
  CHERRY: 1,
  LOSE: 0
};

const STRIPS = [
  [SYMBOLS.S7, SYMBOLS.GRAPE, SYMBOLS.BELL, SYMBOLS.CHERRY, SYMBOLS.GRAPE, SYMBOLS.S7, SYMBOLS.BELL, SYMBOLS.GRAPE, SYMBOLS.CHERRY, SYMBOLS.BAR, SYMBOLS.GRAPE, SYMBOLS.BELL, SYMBOLS.S7, SYMBOLS.GRAPE, SYMBOLS.CHERRY, SYMBOLS.BELL, SYMBOLS.GRAPE, SYMBOLS.BAR, SYMBOLS.BELL, SYMBOLS.GRAPE],
  [SYMBOLS.S7, SYMBOLS.BELL, SYMBOLS.GRAPE, SYMBOLS.PIERROT, SYMBOLS.GRAPE, SYMBOLS.S7, SYMBOLS.BELL, SYMBOLS.GRAPE, SYMBOLS.PIERROT, SYMBOLS.BAR, SYMBOLS.GRAPE, SYMBOLS.BELL, SYMBOLS.S7, SYMBOLS.GRAPE, SYMBOLS.PIERROT, SYMBOLS.BELL, SYMBOLS.GRAPE, SYMBOLS.BAR, SYMBOLS.BELL, SYMBOLS.GRAPE],
  [SYMBOLS.S7, SYMBOLS.PIERROT, SYMBOLS.BELL, SYMBOLS.GRAPE, SYMBOLS.PIERROT, SYMBOLS.S7, SYMBOLS.BELL, SYMBOLS.GRAPE, SYMBOLS.PIERROT, SYMBOLS.BAR, SYMBOLS.GRAPE, SYMBOLS.BELL, SYMBOLS.S7, SYMBOLS.GRAPE, SYMBOLS.PIERROT, SYMBOLS.BELL, SYMBOLS.GRAPE, SYMBOLS.BAR, SYMBOLS.BELL, SYMBOLS.GRAPE]
];

const FILLER_SYMBOLS = [
  SYMBOLS.BELL, SYMBOLS.GRAPE, SYMBOLS.PIERROT, SYMBOLS.CHERRY, SYMBOLS.S7, SYMBOLS.BAR
];

const REEL_SYMBOLS = 20;
const SYMBOL_SIZE = 80;
const CYCLE_HEIGHT = REEL_SYMBOLS * SYMBOL_SIZE;

// Reel State Object
let reels = [
  { id: 0, pos: 5, targetPos: null, speed: 0, spinning: false, stopping: false, strip: STRIPS[0] },
  { id: 1, pos: 5, targetPos: null, speed: 0, spinning: false, stopping: false, strip: STRIPS[1] },
  { id: 2, pos: 5, targetPos: null, speed: 0, spinning: false, stopping: false, strip: STRIPS[2] }
];

let stopsPressed = 0;
let loopRunning = false;
let lastTime = 0;
let winFlag = null;
let plannedIndices = [0, 0, 0];

// DOM Elements
const spinLever = document.getElementById('spin-lever');
const betBtns = [
  document.getElementById('btn-stop-1'),
  document.getElementById('btn-stop-2'),
  document.getElementById('btn-stop-3')
];
const gogoLamp = document.getElementById('gogo-lamp');
const creditDisplay = document.getElementById('credit-display');
const payoutDisplay = document.getElementById('payout-display');
const reelStrips = [
  document.getElementById('strip-0'),
  document.getElementById('strip-1'),
  document.getElementById('strip-2')
];
const paylineCenter = document.getElementById('payline-center');
const bonusCounterDiv = document.getElementById('bonus-counter-div');
const bonusDisplay = document.getElementById('bonus-display');

function initGame() {
  audioEngine = new RetroSlotAudio();
  
  spinLever.disabled = false;
  spinLever.addEventListener('click', handleSpin);
  spinLever.addEventListener('touchstart', (e) => { e.preventDefault(); handleSpin(); });

  betBtns.forEach((btn, index) => {
    btn.addEventListener('pointerdown', () => handleStop(index));
  });

  // Initial render
  renderReels();
  updateButtons();
  updateDisplays();
}

function getSymbol(strip, index) {
  const len = strip.length;
  // Use modulo for wrap-around (handle negative indices too)
  return strip[((index % len) + len) % len];
}

function renderReels() {
  reels.forEach((r, i) => {
    const stripEl = reelStrips[i];
    const intPos = Math.floor(r.pos);
    const frac = r.pos - intPos;
    
    // User definition: Middle = position
    // So we render symbols at: [pos-2, pos-1, pos, pos+1, pos+2]
    // index 2 (pos) will be the center.
    const symbols = [
      getSymbol(r.strip, intPos - 2), // Peeking top
      getSymbol(r.strip, intPos - 1), // Top Row
      getSymbol(r.strip, intPos),     // Middle Row (Center Line)
      getSymbol(r.strip, intPos + 1), // Bottom Row
      getSymbol(r.strip, intPos + 2)  // Peeking bottom
    ];
    
    stripEl.innerHTML = symbols.map(s => `<div class="symbol">${s}</div>`).join('');
    
    // Offset calculation:
    // With 5 symbols, the center of the 3rd symbol is at y = 2.5 * 80? No.
    // Each .symbol is 80px.
    // 5 symbols = 400px high.
    // Reel window is 240px high (3 symbols).
    // To center the 3 visible symbols (pos-1, pos, pos+1), 
    // we need to hide the top peeking symbol (pos-2).
    // So translateY starts at -80px.
    // Plus the fractional part: -(frac * 80).
    const offsetY = -80 - (frac * SYMBOL_SIZE);
    stripEl.style.transform = `translateY(${offsetY}px)`;
  });
}

function getSpinOutcome() {
  const rand = Math.random() * 100;
  if (rand < 0.32) return WIN_TYPES.BIG;
  if (rand < 0.32 + 0.38) return WIN_TYPES.REG;
  if (rand < 0.70 + 4.00) return WIN_TYPES.BELL;
  if (rand < 4.70 + 3.00) return WIN_TYPES.PIERROT;
  if (rand < 7.70 + 9.00) return WIN_TYPES.GRAPE;
  if (rand < 16.70 + 10.00) return WIN_TYPES.CHERRY;
  return WIN_TYPES.LOSE;
}

function computePlannedIndices(outcome) {
  const indices = [0,0,0];
  const maxAttempts = 1000;
  
  for(let i=0; i<maxAttempts; i++) {
    indices[0] = Math.floor(Math.random() * 20);
    indices[1] = Math.floor(Math.random() * 20);
    indices[2] = Math.floor(Math.random() * 20);
    
    // Check outcome
    const grid = [
      [getSymbol(STRIPS[0], indices[0]-1), getSymbol(STRIPS[1], indices[1]-1), getSymbol(STRIPS[2], indices[2]-1)],
      [getSymbol(STRIPS[0], indices[0]),   getSymbol(STRIPS[1], indices[1]),   getSymbol(STRIPS[2], indices[2])],
      [getSymbol(STRIPS[0], indices[0]+1), getSymbol(STRIPS[1], indices[1]+1), getSymbol(STRIPS[2], indices[2]+1)]
    ];
    
    // Simplified payout check for finding indices
    let currentOutcome = WIN_TYPES.LOSE;
    const lc = [[[1,0],[1,1],[1,2]],[[0,0],[0,1],[0,2]],[[2,0],[2,1],[2,2]],[[0,0],[1,1],[2,2]],[[2,0],[1,1],[0,2]]];
    
    for(let line of lc) {
      let s0 = grid[line[0][0]][line[0][1]], s1 = grid[line[1][0]][line[1][1]], s2 = grid[line[2][0]][line[2][1]];
      if (s0 === SYMBOLS.S7 && s1 === SYMBOLS.S7 && s2 === SYMBOLS.S7) currentOutcome = WIN_TYPES.BIG;
      else if (s0 === SYMBOLS.S7 && s1 === SYMBOLS.S7 && s2 === SYMBOLS.BAR) currentOutcome = WIN_TYPES.REG;
      else if (s0 === SYMBOLS.BELL && s1 === SYMBOLS.BELL && s2 === SYMBOLS.BELL) if(currentOutcome === WIN_TYPES.LOSE) currentOutcome = WIN_TYPES.BELL;
      // ... more checks if needed, but BIG/REG/LOSE are most critical for stopping
    }
    // Cherry check on left reel
    if (grid[0][0] === SYMBOLS.CHERRY || grid[1][0] === SYMBOLS.CHERRY || grid[2][0] === SYMBOLS.CHERRY) {
      if(currentOutcome === WIN_TYPES.LOSE) currentOutcome = WIN_TYPES.CHERRY;
    }
    
    if (currentOutcome === outcome) return indices;
  }
  return indices; // Fallback
}

function updateButtons() {
  if (gameState === STATE_IDLE) {
    betBtns.forEach(b => {
      b.classList.add('dimmed');
      b.classList.remove('active-turn');
      b.disabled = true;
    });
    paylineCenter.classList.remove('win-glow');
  } else if (gameState === STATE_SPINNING) {
    betBtns.forEach((b, index) => {
      const r = reels[index];
      if (r.spinning) {
        b.disabled = false;
        b.classList.remove('dimmed');
        b.classList.add('active-turn');
      } else {
        b.disabled = true;
        b.classList.add('dimmed');
        b.classList.remove('active-turn');
      }
    });
  }
}

function updateDisplays() {
  creditDisplay.innerText = credits;
  if (isBonusMode) {
    bonusCounterDiv.style.display = 'flex';
    bonusDisplay.innerText = bonusGamesRemaining;
  } else {
    bonusCounterDiv.style.display = 'none';
  }
}

function handleSpin() {
  console.log("Spin triggered! GameState:", gameState, "Credits:", credits);
  if (gameState !== STATE_IDLE) return;
  
  if (isBonusMode) {
    bonusGamesRemaining--;
    if (bonusGamesRemaining < 0) {
      isBonusMode = false;
      gogoLamp.classList.remove('gogo-active');
      audioEngine.stopBonusBGM();
    }
  }

  const cost = isBonusMode ? 1 : 3;
  if (credits < cost) return;
  credits -= cost;

  payoutDisplay.innerText = '0';
  updateDisplays();
  
  gameState = STATE_SPINNING;
  if (!isBonusMode) gogoLamp.classList.remove('gogo-active');
  spinLever.disabled = true;
  paylineCenter.classList.remove('win-glow');

  // Core RNG! Determine FLAG
  winFlag = getSpinOutcome();
  
  // High probability of win during bonus
  if (isBonusMode) {
    const bonusRand = Math.random();
    if (bonusRand < 0.7) winFlag = WIN_TYPES.GRAPE;
    else if (bonusRand < 0.9) winFlag = WIN_TYPES.BELL;
    else winFlag = WIN_TYPES.LOSE;
  }

  // Pre-calculate target indices on the actual STRIPS
  plannedIndices = computePlannedIndices(winFlag);
  
  reels.forEach(r => {
    r.spinning = true;
    r.stopping = false;
    r.speed = 0;
  });

  stopsPressed = 0;
  updateButtons();

  try {
    audioEngine.playLever();
    audioEngine.startReelSpin();
  } catch (e) {
    console.warn("Audio error:", e);
  }
  
  if (!loopRunning) {
    loopRunning = true;
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }
}

function handleStop(i) {
  const r = reels[i];
  if (!r.spinning) return;
  
  // Instant Stop logic
  r.spinning = false;
  r.speed = 0;
  r.pos = Math.round(r.pos); // Snap to nearest integer center
  renderReels();

  stopsPressed++; // used for sound variation mainly
  
  if (stopsPressed === 3) {
    audioEngine.playTone('triangle', 300, 50, 0.2, 1.0);
    audioEngine.playTone('square', 150, 30, 0.25, 0.7);
    audioEngine.playTone('noise', 800, 100, 0.1, 0.4, true); 
    audioEngine.stopReelSpin();
  } else {
    audioEngine.playStop(stopsPressed);
  }
  
  updateButtons(); 
}

function gameLoop(time) {
  if (!loopRunning) return;
  
  let dt = time - lastTime;
  lastTime = time;
  if (dt > 100) dt = 16; 
  
  let allStopped = true;
  const MAX_SPEED = 0.5; // Symbols per frame (~30px / frame at 60fps)
  
  reels.forEach(r => {
    if (r.spinning) {
      allStopped = false;
      // Normal spinning
      r.speed = Math.min(r.speed + 0.01 * (dt / 16), MAX_SPEED);
      r.pos += r.speed * (dt / 16);
      
      // Keep pos in reasonable bounds (e.g. [0, 20)) to avoid large float precision issues over long play
      if (r.pos > 20) r.pos -= 20;
    }
  });

  renderReels();
  
  if (allStopped && gameState === STATE_SPINNING) {
    gameState = STATE_PAYOUT;
    loopRunning = false;
    processOutcome();
  } else {
    requestAnimationFrame(gameLoop);
  }
}

function getLinePayout(symbols) {
  let s0 = symbols[0], s1 = symbols[1], s2 = symbols[2];
  if (s0 === SYMBOLS.S7 && s1 === SYMBOLS.S7 && s2 === SYMBOLS.S7) return { type: WIN_TYPES.BIG, amt: PAYOUTS.BIG };
  if (s0 === SYMBOLS.S7 && s1 === SYMBOLS.S7 && s2 === SYMBOLS.BAR) return { type: WIN_TYPES.REG, amt: PAYOUTS.REG };
  if (s0 === SYMBOLS.BELL && s1 === SYMBOLS.BELL && s2 === SYMBOLS.BELL) return { type: WIN_TYPES.BELL, amt: PAYOUTS.BELL };
  if (s0 === SYMBOLS.PIERROT && s1 === SYMBOLS.PIERROT && s2 === SYMBOLS.PIERROT) return { type: WIN_TYPES.PIERROT, amt: PAYOUTS.PIERROT };
  if (s0 === SYMBOLS.GRAPE && s1 === SYMBOLS.GRAPE && s2 === SYMBOLS.GRAPE) return { type: WIN_TYPES.GRAPE, amt: PAYOUTS.GRAPE };
  return null;
}

function processOutcome() {
  const grid = [
    [getSymbol(reels[0].strip, reels[0].pos - 1), getSymbol(reels[1].strip, reels[1].pos - 1), getSymbol(reels[2].strip, reels[2].pos - 1)],
    [getSymbol(reels[0].strip, reels[0].pos),     getSymbol(reels[1].strip, reels[1].pos),     getSymbol(reels[2].strip, reels[2].pos)],
    [getSymbol(reels[0].strip, reels[0].pos + 1), getSymbol(reels[1].strip, reels[1].pos + 1), getSymbol(reels[2].strip, reels[2].pos + 1)]
  ];

  let totalPayout = 0;
  let hasBonus = false;
  let bonusLines = [];

  const lc = [
    [[1,0], [1,1], [1,2]], 
    [[0,0], [0,1], [0,2]], 
    [[2,0], [2,1], [2,2]], 
    [[0,0], [1,1], [2,2]], 
    [[2,0], [1,1], [0,2]]  
  ];

  for(let i=0; i<5; i++) {
    let rowSymbols = [grid[lc[i][0][0]][lc[i][0][1]], grid[lc[i][1][0]][lc[i][1][1]], grid[lc[i][2][0]][lc[i][2][1]]];
    let res = getLinePayout(rowSymbols);
    if (res) {
      totalPayout += res.amt;
      if (res.type === WIN_TYPES.BIG || res.type === WIN_TYPES.REG) {
        hasBonus = true;
        bonusLines.push(i);
      }
    }
  }

  // Left Reel Cherry
  if (grid[0][0] === SYMBOLS.CHERRY || grid[1][0] === SYMBOLS.CHERRY || grid[2][0] === SYMBOLS.CHERRY) {
    totalPayout += PAYOUTS.CHERRY;
  }

  if (hasBonus && !isBonusMode) {
    // First time hitting bonus!
    setTimeout(() => {
      gogoLamp.classList.add('gogo-active'); 
      audioEngine.playBonus(); 
      paylineCenter.classList.add('win-glow');
      
      // Enter Bonus Mode
      isBonusMode = true;
      bonusGamesRemaining = (totalPayout === PAYOUTS.BIG) ? 24 : 8; // BIG=24, REG=8
      
      setTimeout(() => {
        audioEngine.playBonusBGM();
        startPayout(totalPayout);
      }, 1000);
    }, 400); // The "間" (Pause)
  } else if (totalPayout > 0) {
    if (!isBonusMode) audioEngine.playTone('sine', 800, 1000, 0.1, 0.3); 
    else audioEngine.playTone('square', 600, 800, 0.1, 0.4); // Bonus hit sound
    startPayout(totalPayout);
  } else {
    setTimeout(resetTurn, 200);
  }
}

function startPayout(amount) {
  let paid = 0;
  let increment = amount > 30 ? 2 : 1; 

  payoutInterval = setInterval(() => {
    let add = Math.min(increment, amount - paid);
    paid += add;
    credits += add;
    payoutDisplay.innerText = paid;
    creditDisplay.innerText = credits;
    
    audioEngine.playPayoutCoin();
    
    if (paid >= amount) {
      clearInterval(payoutInterval);
      setTimeout(resetTurn, 400); 
    }
  }, 40); 
}

function resetTurn() {
  gameState = STATE_IDLE;
  spinLever.disabled = false;
  updateButtons();
}

document.addEventListener('DOMContentLoaded', initGame);
