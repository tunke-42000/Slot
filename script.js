const STATE_IDLE = 0;
const STATE_SPINNING = 1;
const STATE_PAYOUT = 2;

let gameState = STATE_IDLE;
let credits = 100;
let activeLines = 1; 
let audioEngine;
let payoutInterval = null;

// Original, Handmade, Circus feel symbols
const BASE_SYMBOLS = [
  "7", 
  "🎭", "🎭", 
  "⭐", "⭐", "⭐",
  "🎩", "🎩", "🎩",
  "🔔", "🔔", "🔔", "🔔",
  "🍒", "🍒", "🍒", "🍒", 
  "🍇", "🍇", "🍇", "🍇"
]; 
const REEL_SYMBOLS = BASE_SYMBOLS.length;
const SYMBOL_SIZE = 80;
const CYCLE_HEIGHT = REEL_SYMBOLS * SYMBOL_SIZE;

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
const MAX_SPEED = 30; // pixels per frame (smooth moderate speed)
let isSpinning = [false, false, false];
let isStopping = [false, false, false];
let stopTargets = [0, 0, 0];
let stopsPressed = 0;
let loopRunning = false;
let lastTime = 0;

// DOM Elements
const spinLever = document.getElementById('spin-lever');
const betBtns = [
  document.getElementById('btn-bet-1'),
  document.getElementById('btn-bet-3'),
  document.getElementById('btn-bet-5')
];
const pekaLamp = document.getElementById('peka-lamp');
const creditDisplay = document.getElementById('credit-display');
const payoutDisplay = document.getElementById('payout-display');
const reelStrips = [
  document.getElementById('strip-0'),
  document.getElementById('strip-1'),
  document.getElementById('strip-2')
];
const paylineGuides = [
  document.getElementById('line-1'),
  document.getElementById('line-2'),
  document.getElementById('line-3'),
  document.getElementById('line-4'),
  document.getElementById('line-5')
];

function initGame() {
  audioEngine = new RetroSlotAudio();
  
  spinLever.addEventListener('mousedown', handleSpin);
  spinLever.addEventListener('touchstart', (e) => { e.preventDefault(); handleSpin(); });

  betBtns.forEach((btn, index) => {
    btn.addEventListener('mousedown', () => handleButtonPress(index));
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); handleButtonPress(index); });
  });

  prepareReels();
  updateButtons();
  updateDisplays();
}

function prepareReels() {
  for (let i = 0; i < 3; i++) {
    // Generate constant random array for this game session
    reelsData[i] = [...BASE_SYMBOLS].sort(() => Math.random() - 0.5);
    expandedReels[i] = [];
    // 3 Cycles allows seamless looping
    for(let j=0; j<3; j++) expandedReels[i] = expandedReels[i].concat(reelsData[i]);
    
    reelStrips[i].innerHTML = expandedReels[i].map(s => `<div class="symbol">${s}</div>`).join('');
    
    reelPos[i] = CYCLE_HEIGHT; // Start at cycle 1
    reelStrips[i].style.transition = 'none';
    reelStrips[i].style.transform = `translateY(-${reelPos[i]}px)`;
  }
}

function handleButtonPress(index) {
  if (gameState === STATE_IDLE) {
    setBet(index);
  } else if (gameState === STATE_SPINNING) {
    handleStop(index);
  }
}

function setBet(index) {
  activeLines = index === 0 ? 1 : (index === 1 ? 3 : 5);
  updateBetUI();
  audioEngine.init();
  audioEngine.playTone('triangle', 600, 800, 0.05, 0.2);
}

function updateButtons() {
  if (gameState === STATE_IDLE) {
    betBtns[0].innerText = "1 L";
    betBtns[1].innerText = "3 L";
    betBtns[2].innerText = "5 L";
    betBtns.forEach(b => {
      b.style.opacity = '1';
      b.disabled = false;
    });
    updateBetUI(); // Restore bet highlighting
  } else if (gameState === STATE_SPINNING) {
    betBtns[0].innerText = "1";
    betBtns[1].innerText = "2";
    betBtns[2].innerText = "3";
    betBtns.forEach(b => {
      b.classList.remove('active');
      b.style.opacity = '1';
      b.disabled = false;
    });
  }
}

function updateBetUI() {
  betBtns.forEach(b => b.classList.remove('active'));
  if(gameState === STATE_IDLE) {
    if(activeLines === 1) betBtns[0].classList.add('active');
    if(activeLines === 3) betBtns[1].classList.add('active');
    if(activeLines === 5) betBtns[2].classList.add('active');
  }
  
  paylineGuides.forEach((g, i) => {
    g.classList.remove('win-glow');
    if (i < activeLines && gameState === STATE_IDLE) g.classList.add('active');
    else if (gameState !== STATE_IDLE) g.classList.remove('active');
  });
}

function updateDisplays() {
  creditDisplay.innerText = credits;
}

function handleSpin() {
  if (gameState !== STATE_IDLE) return;
  
  let cost = activeLines === 1 ? 1 : (activeLines === 3 ? 2 : 3);
  if (credits < cost) return;

  credits -= cost;
  payoutDisplay.innerText = '0';
  updateDisplays();
  
  gameState = STATE_SPINNING;
  pekaLamp.classList.remove('peka-active');
  spinLever.disabled = true;

  updateButtons();

  audioEngine.playLever();
  audioEngine.startReelSpin();

  stopsPressed = 0;
  for(let i=0; i<3; i++) {
    isSpinning[i] = true;
    isStopping[i] = false;
    reelSpeed[i] = 0;
  }
  
  if (!loopRunning) {
    loopRunning = true;
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }
}

function handleStop(i) {
  if (!isSpinning[i] || isStopping[i]) return;
  
  betBtns[i].disabled = true;
  betBtns[i].style.opacity = '0.5';
  
  isStopping[i] = true;
  stopsPressed++;
  
  audioEngine.playStop(stopsPressed);
  
  // Meoshi mechanics - calculate nearest symbol to snap to
  let currentPos = reelPos[i];
  let targetPos = Math.floor(currentPos / SYMBOL_SIZE) * SYMBOL_SIZE;
  
  // Suberu (Slip) slightly if pressed exactly on boundary to make it fluid
  if (currentPos - targetPos < 15) {
    targetPos -= SYMBOL_SIZE;
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
  if (dt > 100) dt = 16; // Cap dt on lag/tab switch
  
  let allStopped = true;
  
  for(let i=0; i<3; i++) {
    if (isSpinning[i]) {
      allStopped = false;
      
      if (!isStopping[i]) {
        // Accelerating/Constant spin
        reelSpeed[i] = Math.min(reelSpeed[i] + 0.15 * dt, MAX_SPEED);
        reelPos[i] -= reelSpeed[i] * (dt / 16);
        
        if (reelPos[i] < 0) {
          reelPos[i] += CYCLE_HEIGHT;
        }
      } else {
        // Decelerating rigidly to targetPos
        let dist = reelPos[i] - stopTargets[i];
        
        if (dist <= 0) {
          reelPos[i] = stopTargets[i];
          if (reelPos[i] < 0) reelPos[i] += CYCLE_HEIGHT;
          isSpinning[i] = false;
        } else {
          // Slide securely into position
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
    setTimeout(checkResult, 200); 
  } else {
    requestAnimationFrame(gameLoop);
  }
}

function checkResult() {
  const linesCoords = [
    [[1,0], [1,1], [1,2]], // 1: Center
    [[0,0], [0,1], [0,2]], // 2: Top
    [[2,0], [2,1], [2,2]], // 3: Bottom
    [[0,0], [1,1], [2,2]], // 4: Diag 1
    [[2,0], [1,1], [0,2]]  // 5: Diag 2
  ];

  let winningLines = [];
  let totalPayout = 0;

  for(let i=0; i<3; i++) {
    let finalIndex = Math.round(reelPos[i] / SYMBOL_SIZE);
    grid[0][i] = expandedReels[i][finalIndex];
    grid[1][i] = expandedReels[i][finalIndex + 1];
    grid[2][i] = expandedReels[i][finalIndex + 2];
  }

  for(let i=0; i<activeLines; i++) {
    let coords = linesCoords[i];
    let s0 = grid[coords[0][0]][coords[0][1]];
    let s1 = grid[coords[1][0]][coords[1][1]];
    let s2 = grid[coords[2][0]][coords[2][1]];

    if (s0 === s1 && s1 === s2) {
      winningLines.push(i); 
      totalPayout += getPayout(s0);
    }
  }

  if (winningLines.length > 0) {
    pekaLamp.classList.add('peka-active'); 
    
    let isBigWin = winningLines.some(idx => grid[linesCoords[idx][0][0]][linesCoords[idx][0][1]] === '7');
    if (isBigWin) {
      audioEngine.playBonus();
    } else {
      audioEngine.playPeka(); 
    }
    
    winningLines.forEach(lineIdx => {
      paylineGuides[lineIdx].classList.add('win-glow');
      paylineGuides[lineIdx].classList.add('active'); // ensure it shows
    });

    setTimeout(() => {
      startPayout(totalPayout);
    }, 800);
  } else {
    setTimeout(resetTurn, 300);
  }
}

function getPayout(symbol) {
  switch(symbol) {
    case '7': return 500;
    case '🎭': return 100;
    case '⭐': return 50;
    case '🎩': return 20;
    case '🔔': return 20;
    case '🍒': return 10;
    case '🍇': return 10;
    default: return 10;
  }
}

function startPayout(amount) {
  let paid = 0;
  let increment = amount > 20 ? Math.ceil(amount / 20) : 1; 

  payoutInterval = setInterval(() => {
    let add = Math.min(increment, amount - paid);
    paid += add;
    credits += add;
    payoutDisplay.innerText = paid;
    creditDisplay.innerText = credits;
    
    audioEngine.playPayoutCoin();
    
    if (paid >= amount) {
      clearInterval(payoutInterval);
      setTimeout(resetTurn, 500); 
    }
  }, 50); 
}

function resetTurn() {
  gameState = STATE_IDLE;
  spinLever.disabled = false;
  updateButtons();
  
  // Re-enable payline guides properly based on bet
  updateBetUI();
}

// Start
document.addEventListener('DOMContentLoaded', initGame);
