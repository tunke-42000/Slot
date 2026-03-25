const STATE_IDLE = 0;
const STATE_SPINNING = 1;
const STATE_PAYOUT = 2;

let gameState = STATE_IDLE;
let credits = 100;
let audioEngine;
let payoutInterval = null;

const SYMBOLS = {
  S7: "<div class='sym-7'>7<span class='star'>★</span></div>",
  BAR: "<div class='sym-bar'>BAR</div>",
  BELL: "🔔",
  PIERROT: "🤡",
  GRAPE: "🍇",
  CHERRY: "🍒",
  BLANK: "" // Empty slot
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

const FILLER_SYMBOLS = [
  SYMBOLS.BLANK, SYMBOLS.BLANK, SYMBOLS.BLANK, SYMBOLS.BLANK, SYMBOLS.BLANK, SYMBOLS.BLANK, SYMBOLS.BLANK, SYMBOLS.BLANK,
  SYMBOLS.BLANK, SYMBOLS.BLANK, // Extra blanks
  SYMBOLS.S7, SYMBOLS.BAR, SYMBOLS.BELL, SYMBOLS.PIERROT, SYMBOLS.GRAPE
];

const REEL_SYMBOLS = 20;
const SYMBOL_SIZE = 80;
const CYCLE_HEIGHT = REEL_SYMBOLS * SYMBOL_SIZE;

let targetGrid = [];
let reelsData = [[], [], []];
let expandedReels = [[], [], []];
let grid = [
  [null, null, null],
  [null, null, null],
  [null, null, null]
];

// Spin physics
let reelPos = [0, 0, 0];
let reelSpeed = [0, 0, 0];
const MAX_SPEED = 30; 
let isSpinning = [false, false, false];
let isStopping = [false, false, false];
let stopTargets = [0, 0, 0];
let stopsPressed = 0;
let loopRunning = false;
let lastTime = 0;

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

function initGame() {
  audioEngine = new RetroSlotAudio();
  
  spinLever.addEventListener('mousedown', handleSpin);
  spinLever.addEventListener('touchstart', (e) => { e.preventDefault(); handleSpin(); });

  betBtns.forEach((btn, index) => {
    btn.addEventListener('mousedown', () => handleStop(index));
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); handleStop(index); });
  });

  // Random visual reels for initial idle state
  for (let i = 0; i < 3; i++) {
    expandedReels[i] = [];
    for(let k=0; k<60; k++) expandedReels[i].push(FILLER_SYMBOLS[Math.floor(Math.random() * FILLER_SYMBOLS.length)]);
    reelStrips[i].innerHTML = expandedReels[i].map(s => `<div class="symbol">${s}</div>`).join('');
    reelPos[i] = SYMBOL_SIZE * 5; // Show filled row from the start
    reelStrips[i].style.transition = 'none';
    reelStrips[i].style.transform = `translateY(-${reelPos[i]}px)`;
  }
  
  updateButtons();
  updateDisplays();
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

function hasAccidentalWin(gridCopy, intent) {
  const lc = [
    [[1,0], [1,1], [1,2]], 
    [[0,0], [0,1], [0,2]], 
    [[2,0], [2,1], [2,2]], 
    [[0,0], [1,1], [2,2]], 
    [[2,0], [1,1], [0,2]]
  ];
  let validWinsFound = 0;
  for(let i=0; i<5; i++) {
    let s0 = gridCopy[lc[i][0][0]][lc[i][0][1]];
    let s1 = gridCopy[lc[i][1][0]][lc[i][1][1]];
    let s2 = gridCopy[lc[i][2][0]][lc[i][2][1]];
    if (s0 && s1 && s2 && s0 !== SYMBOLS.BLANK && s0 !== SYMBOLS.CHERRY) { // Cherry has no 3-match payout rule line directly, but let's avoid it too
      if (s0 === s1 && s1 === s2) validWinsFound++;
      else if (s0 === SYMBOLS.S7 && s1 === SYMBOLS.S7 && s2 === SYMBOLS.BAR) validWinsFound++;
    }
  }
  
  if (intent === WIN_TYPES.LOSE || intent === WIN_TYPES.CHERRY) return validWinsFound > 0;
  return validWinsFound > 1; 
}

function getSafeSymbol(gridCopy, row, col, outcome) {
  let attempts = 0;
  while(attempts < 10) {
    let candidate = FILLER_SYMBOLS[Math.floor(Math.random() * FILLER_SYMBOLS.length)];
    if (col === 0 && candidate === SYMBOLS.CHERRY && outcome !== WIN_TYPES.CHERRY) continue;
    
    gridCopy[row][col] = candidate;
    if (!hasAccidentalWin(gridCopy, outcome)) {
      return candidate;
    }
    gridCopy[row][col] = null;
    attempts++;
  }
  return SYMBOLS.BLANK;
}

function generateTargetGrid(outcome) {
  let finalGrid = [
    [null, null, null],
    [null, null, null],
    [null, null, null]
  ];
  const lc = [
    [[1,0], [1,1], [1,2]], 
    [[0,0], [0,1], [0,2]], 
    [[2,0], [2,1], [2,2]], 
    [[0,0], [1,1], [2,2]], 
    [[2,0], [1,1], [0,2]]  
  ];

  let winningLineIndex = Math.floor(Math.random() * 5);
  let coords = lc[winningLineIndex];

  if (outcome === WIN_TYPES.BIG) {
    finalGrid[coords[0][0]][coords[0][1]] = SYMBOLS.S7;
    finalGrid[coords[1][0]][coords[1][1]] = SYMBOLS.S7;
    finalGrid[coords[2][0]][coords[2][1]] = SYMBOLS.S7;
  } else if (outcome === WIN_TYPES.REG) {
    finalGrid[coords[0][0]][coords[0][1]] = SYMBOLS.S7;
    finalGrid[coords[1][0]][coords[1][1]] = SYMBOLS.S7;
    finalGrid[coords[2][0]][coords[2][1]] = SYMBOLS.BAR;
  } else if (outcome === WIN_TYPES.BELL) {
    finalGrid[coords[0][0]][coords[0][1]] = SYMBOLS.BELL;
    finalGrid[coords[1][0]][coords[1][1]] = SYMBOLS.BELL;
    finalGrid[coords[2][0]][coords[2][1]] = SYMBOLS.BELL;
  } else if (outcome === WIN_TYPES.PIERROT) {
    finalGrid[coords[0][0]][coords[0][1]] = SYMBOLS.PIERROT;
    finalGrid[coords[1][0]][coords[1][1]] = SYMBOLS.PIERROT;
    finalGrid[coords[2][0]][coords[2][1]] = SYMBOLS.PIERROT;
  } else if (outcome === WIN_TYPES.GRAPE) {
    finalGrid[coords[0][0]][coords[0][1]] = SYMBOLS.GRAPE;
    finalGrid[coords[1][0]][coords[1][1]] = SYMBOLS.GRAPE;
    finalGrid[coords[2][0]][coords[2][1]] = SYMBOLS.GRAPE;
  } else if (outcome === WIN_TYPES.CHERRY) {
    let cherryRow = Math.floor(Math.random() * 3);
    finalGrid[cherryRow][0] = SYMBOLS.CHERRY;
  }

  // Fill remainder to avoid accidental lines
  for(let row=0; row<3; row++) {
    for(let col=0; col<3; col++) {
      if (finalGrid[row][col] === null) {
        if (col === 0 && outcome !== WIN_TYPES.CHERRY) {
          finalGrid[row][col] = Math.random() < 0.8 ? SYMBOLS.BLANK : (Math.random() < 0.5 ? SYMBOLS.GRAPE : SYMBOLS.BELL);
        } else {
          finalGrid[row][col] = getSafeSymbol(finalGrid, row, col, outcome);
        }
      }
    }
  }

  return finalGrid;
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
      b.disabled = false; 
      if (index === stopsPressed) {
        b.classList.remove('dimmed');
        b.classList.add('active-turn');
      } else {
        b.classList.add('dimmed');
        b.classList.remove('active-turn');
      }
    });
  }
}

function updateDisplays() {
  creditDisplay.innerText = credits;
}

function handleSpin() {
  if (gameState !== STATE_IDLE) return;
  if (credits < 3) return; // 1 spin = 3 credits required

  credits -= 3;
  payoutDisplay.innerText = '0';
  updateDisplays();
  
  gameState = STATE_SPINNING;
  gogoLamp.classList.remove('gogo-active');
  spinLever.disabled = true;

  // Clear previous win lines
  paylineCenter.classList.remove('win-glow');

  // Core RNG! Calculate Target once at trigger!
  let outcome = getSpinOutcome();
  targetGrid = generateTargetGrid(outcome);
  
  // Fill the virtual strips dynamically for the visual spin. Range indices 0 to 60.
  for(let i=0; i<3; i++) {
    expandedReels[i] = [];
    for(let k=0; k<60; k++) expandedReels[i].push(FILLER_SYMBOLS[Math.floor(Math.random() * FILLER_SYMBOLS.length)]);
    // Avoid Cherry on left reel initially so it doesn't flicker by
    if (i === 0) expandedReels[0] = expandedReels[0].map(s => s === SYMBOLS.CHERRY ? SYMBOLS.BLANK : s);
    
    reelStrips[i].innerHTML = expandedReels[i].map(s => `<div class="symbol">${s}</div>`).join('');
    
    // Set reel pos safely high into cycle
    reelPos[i] = 2500; 
    reelStrips[i].style.transition = 'none';
    reelStrips[i].style.transform = `translateY(-${reelPos[i]}px)`;
    
    isSpinning[i] = true;
    isStopping[i] = false;
    reelSpeed[i] = 0;
  }

  stopsPressed = 0;
  updateButtons();

  // Add blur class on spin start
  reelStrips.forEach(s => s.classList.add('blur'));

  audioEngine.playLever();
  audioEngine.startReelSpin();
  
  if (!loopRunning) {
    loopRunning = true;
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }
}

function handleStop(i) {
  if (!isSpinning[i] || isStopping[i]) return;
  if (i !== stopsPressed) return;
  
  isStopping[i] = true;
  stopsPressed++;
  
  if (stopsPressed === 3) {
    audioEngine.playTone('triangle', 300, 50, 0.2, 1.0);
    audioEngine.playTone('square', 150, 30, 0.25, 0.7);
    audioEngine.playTone('noise', 800, 100, 0.1, 0.4, true); 
  } else {
    audioEngine.playStop(stopsPressed);
  }
  
  updateButtons(); 
  
  // Calculate destination injection 
  let currentPos = reelPos[i];
  let targetPos = Math.floor(currentPos / SYMBOL_SIZE) * SYMBOL_SIZE;
  if (currentPos - targetPos < 15) {
    targetPos -= SYMBOL_SIZE;
  }
  targetPos -= (8 * SYMBOL_SIZE); // Stop 8 symbols down
  
  // Directly inject target array outcome exactly at target targetPos index
  let stopIndex = Math.round(targetPos / SYMBOL_SIZE);
  
  // Bounds check (stopIndex will be ~2500/80 - 8 = ~23)
  if (stopIndex > 0 && stopIndex + 2 < expandedReels[i].length) {
    expandedReels[i][stopIndex] = targetGrid[0][i];
    expandedReels[i][stopIndex + 1] = targetGrid[1][i];
    expandedReels[i][stopIndex + 2] = targetGrid[2][i];
    reelStrips[i].innerHTML = expandedReels[i].map(s => `<div class="symbol">${s}</div>`).join('');
  }
  
  stopTargets[i] = targetPos;
  
  if (stopsPressed === 3) {
    audioEngine.stopReelSpin();
  }
}

function gameLoop(time) {
  if (!loopRunning) return;
  
  let dt = time - lastTime;
  lastTime = time;
  if (dt > 100) dt = 16; 
  
  let allStopped = true;
  
  for(let i=0; i<3; i++) {
    if (isSpinning[i]) {
      allStopped = false;
      
      if (!isStopping[i]) {
        reelSpeed[i] = Math.min(reelSpeed[i] + 0.15 * dt, MAX_SPEED);
        reelPos[i] -= reelSpeed[i] * (dt / 16);
        if (reelPos[i] < 1600) {
          reelPos[i] += 1600; // Loop bound
        }
      } else {
        let dist = reelPos[i] - stopTargets[i];
        if (dist <= 0) {
          reelPos[i] = stopTargets[i];
          if (reelPos[i] < 0) reelPos[i] += 1600;
          isSpinning[i] = false;
        } else {
          let move = reelSpeed[i] * (dt / 16);
          if (move > dist) move = dist;
          reelPos[i] -= move;
        }
      }
      reelStrips[i].style.transform = `translateY(-${reelPos[i]}px)`;
    }
  }
  
  if (allStopped && gameState === STATE_SPINNING) {
    gameState = STATE_PAYOUT;
    loopRunning = false;
    // Remove blur when all stopped
    reelStrips.forEach(s => s.classList.remove('blur'));
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
  for(let i=0; i<3; i++) {
    let finalIndex = Math.round(reelPos[i] / SYMBOL_SIZE);
    grid[0][i] = expandedReels[i][finalIndex];
    grid[1][i] = expandedReels[i][finalIndex + 1];
    grid[2][i] = expandedReels[i][finalIndex + 2];
  }

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

  if (hasBonus) {
    setTimeout(() => {
      gogoLamp.classList.add('gogo-active'); 
      audioEngine.playBonus(); 
      paylineCenter.classList.add('win-glow');
      setTimeout(() => startPayout(totalPayout), 1000);
    }, 200);
  } else if (totalPayout > 0) {
    audioEngine.playTone('sine', 800, 1000, 0.1, 0.3); // Gentle tone
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
