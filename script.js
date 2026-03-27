const STATE_IDLE = 0;
const STATE_SPINNING = 1;
const STATE_PAYOUT = 2;
const STATE_BONUS = 3;

const SCREEN_TITLE = 'title';
const SCREEN_GAME = 'game';

const SPIN_COST = 3;
const BONUS_SPIN_COST = 1;

let currentScreen = SCREEN_TITLE;
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

// --- Speed Configuration ---
// SPIN_SPEED: Time per symbol (koma) in ms.
// 80ms: Fast / 100ms: Standard / 120ms: Slow
const SPIN_SPEED = 100; 

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

const titleScreen = document.getElementById('title-screen');
const gameScreen = document.getElementById('game-screen');
const creditOutOverlay = document.getElementById('credit-out-overlay');
const btnStartGame = document.getElementById('btn-start-game');
const btnReturnTitle = document.getElementById('btn-return-title');

function initGame() {
  audioEngine = new RetroSlotAudio();
  audioEngine.loadAllSounds();
  
  // No longer need a loading guard for Base64 assets
  spinLever.classList.remove('dimmed');

  // Unified Pointer Events
  spinLever.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handleSpin();
  });

  betBtns.forEach((btn, index) => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handleStop(index);
    });
  });

  btnStartGame.addEventListener('click', async (e) => {
    console.log("[Script] Start button clicked (audio unlock attempt).");
    try {
      await audioEngine.unlock();
      audioEngine.playStart();
    } catch (err) {
      console.warn("[Script] Audio unlock failed:", err);
    }
    switchScreen(SCREEN_GAME);
  });

  btnReturnTitle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    resetGame();
    switchScreen(SCREEN_TITLE);
  });

  // Initial render
  renderReels();
  updateButtons();
  updateDisplays();
  switchScreen(SCREEN_TITLE);
}

function switchScreen(screen) {
  currentScreen = screen;
  if (screen === SCREEN_TITLE) {
    titleScreen.classList.remove('hidden');
    gameScreen.classList.add('hidden');
    creditOutOverlay.classList.add('hidden');
  } else {
    titleScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
  }
}

function resetGame() {
  if (payoutInterval) clearInterval(payoutInterval);
  
  gameState = STATE_IDLE;
  credits = 100;
  bonusGamesRemaining = 0;
  isBonusMode = false;
  stopsPressed = 0;
  loopRunning = false;
  winFlag = null;
  plannedIndices = [0, 0, 0];

  reels.forEach(r => {
    r.pos = 5;
    r.speed = 0;
    r.spinning = false;
    r.stopping = false;
  });

  gogoLamp.classList.remove('gogo-active');
  paylineCenter.classList.remove('win-glow');
  payoutDisplay.innerText = '0';
  creditOutOverlay.classList.add('hidden');
  
  audioEngine.stopReelSpin();
  audioEngine.stopBonusBGM();

  renderReels();
  updateButtons();
  updateDisplays();
}

function getSymbol(strip, index) {
  const len = strip.length;
  return strip[((index % len) + len) % len];
}

function renderReels() {
  reels.forEach((r, i) => {
    const stripEl = reelStrips[i];
    const intPos = Math.floor(r.pos);
    const frac = r.pos - intPos;
    
    // NEW DEFINITION (Falling):
    // pos = Middle symbol index.
    // Top = pos + 1
    // Mid = pos
    // Bot = pos - 1
    // Render order (top to bottom): [pos+2, pos+1, pos, pos-1, pos-2]
    const symbols = [
      getSymbol(r.strip, intPos + 2), 
      getSymbol(r.strip, intPos + 1), 
      getSymbol(r.strip, intPos),     
      getSymbol(r.strip, intPos - 1), 
      getSymbol(r.strip, intPos - 2)  
    ];
    
    stripEl.innerHTML = symbols.map(s => `<div class="symbol">${s}</div>`).join('');
    
    // FALLING OFFSET:
    // When frac=0, symbols[2] (pos) is at center (y=120). 
    // Container translateY = -80 centers symbols[2].
    // When frac increases (pos += speed), container translateY should INCREASE (move down).
    const offsetY = -80 + (frac * SYMBOL_SIZE);
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
    
    // grid: [Top, Mid, Bot] x [R1, R2, R3]
    const grid = [
      [getSymbol(STRIPS[0], indices[0]+1), getSymbol(STRIPS[1], indices[1]+1), getSymbol(STRIPS[2], indices[2]+1)],
      [getSymbol(STRIPS[0], indices[0]),   getSymbol(STRIPS[1], indices[1]),   getSymbol(STRIPS[2], indices[2])],
      [getSymbol(STRIPS[0], indices[0]-1), getSymbol(STRIPS[1], indices[1]-1), getSymbol(STRIPS[2], indices[2]-1)]
    ];
    
    let currentOutcome = WIN_TYPES.LOSE;
    const lc = [[[1,0],[1,1],[1,2]],[[0,0],[0,1],[0,2]],[[2,0],[2,1],[2,2]],[[0,0],[1,1],[2,2]],[[2,0],[1,1],[0,2]]];
    
    for(let line of lc) {
      let s0 = grid[line[0][0]][line[0][1]], s1 = grid[line[1][0]][line[1][1]], s2 = grid[line[2][0]][line[2][1]];
      if (s0 === SYMBOLS.S7 && s1 === SYMBOLS.S7 && s2 === SYMBOLS.S7) currentOutcome = WIN_TYPES.BIG;
      else if (s0 === SYMBOLS.S7 && s1 === SYMBOLS.S7 && s2 === SYMBOLS.BAR) currentOutcome = WIN_TYPES.REG;
      else if (s0 === SYMBOLS.BELL && s1 === SYMBOLS.BELL && s2 === SYMBOLS.BELL) if(currentOutcome === WIN_TYPES.LOSE) currentOutcome = WIN_TYPES.BELL;
    }
    if (grid[0][0] === SYMBOLS.CHERRY || grid[1][0] === SYMBOLS.CHERRY || grid[2][0] === SYMBOLS.CHERRY) {
      if(currentOutcome === WIN_TYPES.LOSE) currentOutcome = WIN_TYPES.CHERRY;
    }
    
    if (currentOutcome === outcome) return indices;
  }
  return indices;
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

  const needed = isBonusMode ? BONUS_SPIN_COST : SPIN_COST;
  if (credits < needed && gameState === STATE_IDLE) {
    creditOutOverlay.classList.remove('hidden');
  } else {
    creditOutOverlay.classList.add('hidden');
  }
}

function handleSpin() {
  console.log("[Script] handleSpin called. gameState:", gameState);
  if (gameState !== STATE_IDLE) return;

  if (isBonusMode) {
    bonusGamesRemaining--;
    if (bonusGamesRemaining < 0) {
      isBonusMode = false;
      gogoLamp.classList.remove('gogo-active');
      audioEngine.stopBonusBGM();
    }
  }

  const cost = isBonusMode ? BONUS_SPIN_COST : SPIN_COST;
  if (credits < cost) return;

  spinLever.classList.add('is-pressed');
  setTimeout(() => spinLever.classList.remove('is-pressed'), 120);
  audioEngine.playReba();

  credits -= cost;
  payoutDisplay.innerText = '0';
  audioEngine.gakoPlayed = false;
  updateDisplays();
  
  gameState = STATE_SPINNING;
  if (!isBonusMode) gogoLamp.classList.remove('gogo-active');
  spinLever.classList.add('dimmed');
  paylineCenter.classList.remove('win-glow');

  winFlag = getSpinOutcome();
  if (isBonusMode) {
    const bonusRand = Math.random();
    if (bonusRand < 0.7) winFlag = WIN_TYPES.GRAPE;
    else if (bonusRand < 0.9) winFlag = WIN_TYPES.BELL;
    else winFlag = WIN_TYPES.LOSE;
  }

  plannedIndices = computePlannedIndices(winFlag);
  
  reels.forEach(r => {
    r.spinning = true;
    r.stopping = false;
    r.speed = 0;
  });

  const isBonusHit = (winFlag === WIN_TYPES.BIG || winFlag === WIN_TYPES.REG);
  if (isBonusHit && !audioEngine.gakoPlayed) {
    audioEngine.playGako();
    audioEngine.gakoPlayed = true;
    gogoLamp.classList.add('gogo-active');
  }

  stopsPressed = 0;
  updateButtons();

  audioEngine.playLever();
  audioEngine.startReelSpin();
  
  if (!loopRunning) {
    loopRunning = true;
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }
}

function handleStop(i) {
  console.log(`[Script] handleStop called for reel ${i}.`);
  const r = reels[i];
  if (!r.spinning) return;
  
  audioEngine.playBotan();

  r.spinning = false;
  r.speed = 0;
  r.pos = Math.round(r.pos); // Snap to center
  renderReels();

  stopsPressed++;
  if (stopsPressed === 3) {
    audioEngine.stopReelSpin();
  }
  updateButtons(); 
}

function gameLoop(time) {
  if (!loopRunning) return;
  
  let dt = time - lastTime;
  lastTime = time;
  if (dt > 100) dt = 16; 
  
  let allStopped = true;
  const TARGET_SPEED_60FPS = (16.666 / SPIN_SPEED); 
  
  reels.forEach(r => {
    if (r.spinning) {
      allStopped = false;
      r.speed = Math.min(r.speed + 0.01 * (dt / 16), TARGET_SPEED_60FPS);
      r.pos += r.speed * (dt / 16);
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
  // Mapping check: Top:+1, Mid:0, Bot:-1
  const grid = [
    [getSymbol(reels[0].strip, reels[0].pos + 1), getSymbol(reels[1].strip, reels[1].pos + 1), getSymbol(reels[2].strip, reels[2].pos + 1)],
    [getSymbol(reels[0].strip, reels[0].pos),     getSymbol(reels[1].strip, reels[1].pos),     getSymbol(reels[2].strip, reels[2].pos)],
    [getSymbol(reels[0].strip, reels[0].pos - 1), getSymbol(reels[1].strip, reels[1].pos - 1), getSymbol(reels[2].strip, reels[2].pos - 1)]
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

  if (grid[0][0] === SYMBOLS.CHERRY || grid[1][0] === SYMBOLS.CHERRY || grid[2][0] === SYMBOLS.CHERRY) {
    totalPayout += PAYOUTS.CHERRY;
  }

  if (hasBonus && !isBonusMode) {
    setTimeout(() => {
      gogoLamp.classList.add('gogo-active'); 
      audioEngine.playBonus(); 
      paylineCenter.classList.add('win-glow');
      isBonusMode = true;
      bonusGamesRemaining = (totalPayout === PAYOUTS.BIG) ? 24 : 8;
      setTimeout(() => {
        audioEngine.playBonusBGM();
        startPayout(totalPayout);
      }, 1000);
    }, 400); 
  } else if (totalPayout > 0) {
    if (!isBonusMode) audioEngine.playTone('sine', 800, 1000, 0.1, 0.3); 
    else audioEngine.playTone('square', 600, 800, 0.1, 0.4);
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
  spinLever.classList.remove('dimmed');
  updateButtons();
}

document.addEventListener('DOMContentLoaded', initGame);
