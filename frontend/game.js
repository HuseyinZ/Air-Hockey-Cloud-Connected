/* ========================================
   CLOUD AIR HOCKEY TOURNAMENT — GAME ENGINE
   ======================================== */

// ── DOM ──
const setupScreen = document.getElementById("setupScreen");
const gameScreen = document.getElementById("gameScreen");
const championScreen = document.getElementById("championScreen");
const rosterGrid = document.getElementById("rosterGrid");
const startTournamentBtn = document.getElementById("startTournamentBtn");

const board = document.getElementById("canvas");
const ctx = board.getContext("2d");
const matchLabel = document.getElementById("matchLabel");
const progressFill = document.getElementById("progressFill");
const leftPlayerName = document.getElementById("leftPlayerName");
const rightPlayerName = document.getElementById("rightPlayerName");
const leftPlayerColor = document.getElementById("leftPlayerColor");
const rightPlayerColor = document.getElementById("rightPlayerColor");
const leftScoreEl = document.getElementById("leftScore");
const rightScoreEl = document.getElementById("rightScore");
const statusEl = document.getElementById("status");
const skipMatchBtn = document.getElementById("skipMatchBtn");
const matchResultEl = document.getElementById("matchResult");
const matchResultTitle = document.getElementById("matchResultTitle");
const matchResultDetail = document.getElementById("matchResultDetail");
const nextMatchBtn = document.getElementById("nextMatchBtn");
const leagueBody = document.getElementById("leagueBody");
const championNameEl = document.getElementById("championName");
const championStatsEl = document.getElementById("championStats");
const finalLeagueBody = document.getElementById("finalLeagueBody");
const restartTournamentBtn = document.getElementById("restartTournamentBtn");
const confettiCanvas = document.getElementById("confettiCanvas");

// ── Constants ──
const BOARD_WIDTH = 770;
const BOARD_HEIGHT = 520;
const CENTER_X = BOARD_WIDTH / 2;
const CENTER_Y = BOARD_HEIGHT / 2;
const GOAL_HEIGHT = 190;
const GOAL_TOP = (BOARD_HEIGHT - GOAL_HEIGHT) / 2;
const MAX_SCORE = 7;

board.width = BOARD_WIDTH;
board.height = BOARD_HEIGHT;

// ── Input ──
const keys = {};
let animationId = null;

document.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    e.preventDefault();
  }
  keys[e.key] = true;
});

document.addEventListener("keyup", (e) => {
  keys[e.key] = false;
});

// ═══════════════════════════════════════
// PLAYER REGISTRY — 10 Players
// ═══════════════════════════════════════
const PLAYERS = [
  {
    id: 0, name: "You", type: "human", color: "#6366f1",
    maxSpeed: 7, acceleration: 0.7, friction: 0.90,
    aggression: 0, reactionDelay: 0, accuracy: 0
  },
  {
    id: 1, name: "Rookie Bot", type: "ai", color: "#22c55e",
    maxSpeed: 3.0, acceleration: 0.20, friction: 0.92,
    aggression: 0.15, reactionDelay: 12, accuracy: 35
  },
  {
    id: 2, name: "Casual Bot", type: "ai", color: "#14b8a6",
    maxSpeed: 3.8, acceleration: 0.25, friction: 0.91,
    aggression: 0.25, reactionDelay: 9, accuracy: 28
  },
  {
    id: 3, name: "Steady Bot", type: "ai", color: "#3b82f6",
    maxSpeed: 4.2, acceleration: 0.28, friction: 0.91,
    aggression: 0.35, reactionDelay: 7, accuracy: 22
  },
  {
    id: 4, name: "Swift Bot", type: "ai", color: "#8b5cf6",
    maxSpeed: 4.8, acceleration: 0.32, friction: 0.92,
    aggression: 0.40, reactionDelay: 5, accuracy: 18
  },
  {
    id: 5, name: "Aggressive Bot", type: "ai", color: "#f43f5e",
    maxSpeed: 5.0, acceleration: 0.35, friction: 0.91,
    aggression: 0.60, reactionDelay: 4, accuracy: 15
  },
  {
    id: 6, name: "Shadow Bot", type: "ai", color: "#64748b",
    maxSpeed: 5.4, acceleration: 0.38, friction: 0.92,
    aggression: 0.45, reactionDelay: 3, accuracy: 12
  },
  {
    id: 7, name: "Sniper Bot", type: "ai", color: "#f59e0b",
    maxSpeed: 5.2, acceleration: 0.40, friction: 0.90,
    aggression: 0.55, reactionDelay: 3, accuracy: 8
  },
  {
    id: 8, name: "Blitz Bot", type: "ai", color: "#ef4444",
    maxSpeed: 6.0, acceleration: 0.45, friction: 0.91,
    aggression: 0.70, reactionDelay: 2, accuracy: 6
  },
  {
    id: 9, name: "Titan Bot", type: "ai", color: "#dc2626",
    maxSpeed: 6.5, acceleration: 0.50, friction: 0.90,
    aggression: 0.80, reactionDelay: 1, accuracy: 4
  }
];

// ═══════════════════════════════════════
// DISC CLASS
// ═══════════════════════════════════════
class Disc {
  constructor(options = {}) {
    this.startX = options.x ?? CENTER_X;
    this.startY = options.y ?? CENTER_Y;
    this.x = this.startX;
    this.y = this.startY;
    this.radius = options.radius ?? 20;
    this.mass = options.mass ?? 15;
    this.vx = 0;
    this.vy = 0;
    this.maxSpeed = options.maxSpeed ?? 7;
    this.friction = options.friction ?? 0.98;
    this.acceleration = options.acceleration ?? 0.5;
    this.color = options.color ?? "#ffffff";
  }

  reset(x = this.startX, y = this.startY) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
  }

  move() {
    this.vx *= this.friction;
    this.vy *= this.friction;
    this.x += this.vx;
    this.y += this.vy;
  }

  draw() {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;

    // Outer ring
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();

    // Inner shine
    ctx.beginPath();
    ctx.arc(this.x - this.radius * 0.2, this.y - this.radius * 0.2, this.radius * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fill();

    ctx.restore();
  }
}

// ═══════════════════════════════════════
// TOURNAMENT STATE
// ═══════════════════════════════════════
const tournament = {
  matches: [],        // All 45 match pairings [{a, b}]
  results: [],        // Completed results [{a, b, scoreA, scoreB, winner}]
  currentMatchIndex: 0,
  standings: [],      // Per-player stats
  started: false,
  finished: false
};

// Current match state
const match = {
  playerA: null,      // PLAYERS[i]
  playerB: null,
  scoreA: 0,
  scoreB: 0,
  over: false,
  isHumanMatch: false,
  isSimulating: false
};

// Game objects
const puck = new Disc({
  x: CENTER_X, y: CENTER_Y,
  radius: 18, mass: 12,
  maxSpeed: 14, friction: 0.995,
  color: "#e2e8f0"
});

const paddleA = new Disc({
  x: 120, y: CENTER_Y,
  radius: 26, mass: 50,
  maxSpeed: 7, acceleration: 0.7,
  friction: 0.90, color: "#6366f1"
});

const paddleB = new Disc({
  x: BOARD_WIDTH - 120, y: CENTER_Y,
  radius: 26, mass: 50,
  maxSpeed: 5, acceleration: 0.32,
  friction: 0.92, color: "#ef4444"
});

// AI state tracking for reaction delays
let aiStateA = { targetX: 0, targetY: CENTER_Y, frameCount: 0, lastUpdateFrame: 0 };
let aiStateB = { targetX: 0, targetY: CENTER_Y, frameCount: 0, lastUpdateFrame: 0 };

// ═══════════════════════════════════════
// PHYSICS HELPERS
// ═══════════════════════════════════════
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rotate(x, y, sin, cos, reverse) {
  return {
    x: reverse ? (x * cos + y * sin) : (x * cos - y * sin),
    y: reverse ? (y * cos - x * sin) : (y * cos + x * sin)
  };
}

function collide(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const minDistance = a.radius + b.radius;

  if (distance >= minDistance || distance === 0) return;

  const angle = Math.atan2(dy, dx);
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);

  const pos0 = { x: 0, y: 0 };
  const pos1 = rotate(dx, dy, sin, cos, true);

  const vel0 = rotate(b.vx, b.vy, sin, cos, true);
  const vel1 = rotate(a.vx, a.vy, sin, cos, true);

  const velocityXTotal = vel0.x - vel1.x;

  vel0.x = ((b.mass - a.mass) * vel0.x + 2 * a.mass * vel1.x) / (b.mass + a.mass);
  vel1.x = velocityXTotal + vel0.x;

  const absV = Math.abs(vel0.x) + Math.abs(vel1.x) || 1;
  const overlap = minDistance - Math.abs(pos0.x - pos1.x);

  pos0.x += (vel0.x / absV) * overlap;
  pos1.x += (vel1.x / absV) * overlap;

  const pos0F = rotate(pos0.x, pos0.y, sin, cos, false);
  const pos1F = rotate(pos1.x, pos1.y, sin, cos, false);

  b.x += pos0F.x;
  b.y += pos0F.y;
  a.x = b.x + pos1F.x;
  a.y = b.y + pos1F.y;

  const vel0F = rotate(vel0.x, vel0.y, sin, cos, false);
  const vel1F = rotate(vel1.x, vel1.y, sin, cos, false);

  b.vx = vel0F.x;
  b.vy = vel0F.y;
  a.vx = vel1F.x;
  a.vy = vel1F.y;
}

// ═══════════════════════════════════════
// AI BEHAVIOR
// ═══════════════════════════════════════
function handleAI(paddle, playerDef, isLeftSide, aiState) {
  if (match.over) return;

  aiState.frameCount++;

  const homeX = isLeftSide ? 120 : BOARD_WIDTH - 120;
  const puckOnMySide = isLeftSide ? (puck.x < CENTER_X) : (puck.x > CENTER_X);
  const puckApproaching = isLeftSide ? (puck.vx < -0.5) : (puck.vx > 0.5);

  // Update target position with reaction delay
  if (aiState.frameCount - aiState.lastUpdateFrame >= playerDef.reactionDelay) {
    aiState.lastUpdateFrame = aiState.frameCount;

    // Add inaccuracy
    const offsetX = (Math.random() - 0.5) * playerDef.accuracy;
    const offsetY = (Math.random() - 0.5) * playerDef.accuracy;

    if (puckOnMySide || puckApproaching) {
      // Go after the puck
      const pushOffset = isLeftSide ? -30 : 30;
      aiState.targetX = puck.x + pushOffset + offsetX;
      aiState.targetY = puck.y + offsetY;
    } else {
      // How far forward to play depends on aggression
      const aggressionRange = isLeftSide
        ? homeX + (CENTER_X - homeX) * playerDef.aggression
        : homeX - (homeX - CENTER_X) * playerDef.aggression;

      aiState.targetX = aggressionRange + offsetX;
      aiState.targetY = CENTER_Y + (puck.y - CENTER_Y) * 0.4 + offsetY;
    }
  }

  // Move toward target
  const dx = aiState.targetX - paddle.x;
  const dy = aiState.targetY - paddle.y;

  if (Math.abs(dx) > 2) {
    paddle.vx += (dx > 0 ? 1 : -1) * paddle.acceleration;
  }
  if (Math.abs(dy) > 2) {
    paddle.vy += (dy > 0 ? 1 : -1) * paddle.acceleration;
  }

  paddle.vx = clamp(paddle.vx, -paddle.maxSpeed, paddle.maxSpeed);
  paddle.vy = clamp(paddle.vy, -paddle.maxSpeed, paddle.maxSpeed);
}

function handlePlayerInput() {
  if (match.over) return;

  if (keys.ArrowUp)    paddleA.vy -= paddleA.acceleration;
  if (keys.ArrowDown)  paddleA.vy += paddleA.acceleration;
  if (keys.ArrowLeft)  paddleA.vx -= paddleA.acceleration;
  if (keys.ArrowRight) paddleA.vx += paddleA.acceleration;

  paddleA.vx = clamp(paddleA.vx, -paddleA.maxSpeed, paddleA.maxSpeed);
  paddleA.vy = clamp(paddleA.vy, -paddleA.maxSpeed, paddleA.maxSpeed);
}

// ═══════════════════════════════════════
// GAME MECHANICS
// ═══════════════════════════════════════
function keepPaddleInHalf(paddle, isLeftSide) {
  paddle.move();

  const minX = isLeftSide ? paddle.radius : CENTER_X + paddle.radius;
  const maxX = isLeftSide ? CENTER_X - paddle.radius : BOARD_WIDTH - paddle.radius;

  paddle.x = clamp(paddle.x, minX, maxX);
  paddle.y = clamp(paddle.y, paddle.radius, BOARD_HEIGHT - paddle.radius);
}

function handlePuckWalls() {
  if (puck.y - puck.radius <= 0) {
    puck.y = puck.radius;
    puck.vy *= -1;
  }
  if (puck.y + puck.radius >= BOARD_HEIGHT) {
    puck.y = BOARD_HEIGHT - puck.radius;
    puck.vy *= -1;
  }

  if (puck.x - puck.radius <= 0) {
    const inGoal = puck.y > GOAL_TOP + puck.radius && puck.y < GOAL_TOP + GOAL_HEIGHT - puck.radius;
    if (inGoal) {
      scoreGoal("B");
    } else {
      puck.x = puck.radius;
      puck.vx *= -1;
    }
  }

  if (puck.x + puck.radius >= BOARD_WIDTH) {
    const inGoal = puck.y > GOAL_TOP + puck.radius && puck.y < GOAL_TOP + GOAL_HEIGHT - puck.radius;
    if (inGoal) {
      scoreGoal("A");
    } else {
      puck.x = BOARD_WIDTH - puck.radius;
      puck.vx *= -1;
    }
  }
}

function resetRound(lastScorer = "A") {
  paddleA.reset(120, CENTER_Y);
  paddleB.reset(BOARD_WIDTH - 120, CENTER_Y);
  puck.reset(CENTER_X, CENTER_Y);

  puck.vx = lastScorer === "A" ? 3 : -3;
  puck.vy = Math.random() * 4 - 2;
}

function updateHud() {
  leftScoreEl.textContent = match.scoreA;
  rightScoreEl.textContent = match.scoreB;
}

function scoreGoal(side) {
  if (match.over) return;

  if (side === "A") match.scoreA += 1;
  else match.scoreB += 1;

  updateHud();

  // Goal flash effect
  const rink = document.querySelector(".rink-wrap");
  if (rink) {
    rink.classList.add("goal-flash");
    setTimeout(() => rink.classList.remove("goal-flash"), 500);
  }

  if (match.scoreA >= MAX_SCORE || match.scoreB >= MAX_SCORE) {
    match.over = true;
    finishCurrentMatch();
    return;
  }

  resetRound(side);
}

// ═══════════════════════════════════════
// DRAWING
// ═══════════════════════════════════════
function drawAll() {
  ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

  // Draw puck trail
  ctx.save();
  ctx.beginPath();
  ctx.arc(puck.x, puck.y, puck.radius + 4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(226, 232, 240, 0.06)";
  ctx.fill();
  ctx.restore();

  paddleA.draw();
  paddleB.draw();
  puck.draw();
}

// ═══════════════════════════════════════
// GAME LOOP (for animated matches)
// ═══════════════════════════════════════
function gameLoop() {
  // Input based on player type
  if (match.playerA.type === "human") {
    handlePlayerInput();
  } else {
    handleAI(paddleA, match.playerA, true, aiStateA);
  }

  if (match.playerB.type === "human") {
    // second player keyboard would go here (for now only AI vs human supported with human always on left)
    handlePlayerInput();
  } else {
    handleAI(paddleB, match.playerB, false, aiStateB);
  }

  keepPaddleInHalf(paddleA, true);
  keepPaddleInHalf(paddleB, false);

  if (!match.over) {
    puck.move();
    collide(puck, paddleA);
    collide(puck, paddleB);
    handlePuckWalls();
  }

  drawAll();

  if (!match.over) {
    animationId = requestAnimationFrame(gameLoop);
  }
}

// ═══════════════════════════════════════
// TOURNAMENT LOGIC
// ═══════════════════════════════════════
function generateMatches() {
  tournament.matches = [];
  for (let i = 0; i < PLAYERS.length; i++) {
    for (let j = i + 1; j < PLAYERS.length; j++) {
      tournament.matches.push({ a: i, b: j });
    }
  }
  // Shuffle for variety
  for (let i = tournament.matches.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tournament.matches[i], tournament.matches[j]] = [tournament.matches[j], tournament.matches[i]];
  }
}

function initStandings() {
  tournament.standings = PLAYERS.map(p => ({
    id: p.id,
    name: p.name,
    color: p.color,
    type: p.type,
    played: 0,
    wins: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    points: 0
  }));
}

function sortStandings() {
  tournament.standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.name.localeCompare(b.name);
  });
}

function updateStandings(aId, bId, scoreA, scoreB) {
  const sa = tournament.standings.find(s => s.id === aId);
  const sb = tournament.standings.find(s => s.id === bId);

  sa.played++;
  sb.played++;
  sa.goalsFor += scoreA;
  sa.goalsAgainst += scoreB;
  sb.goalsFor += scoreB;
  sb.goalsAgainst += scoreA;
  sa.goalDiff = sa.goalsFor - sa.goalsAgainst;
  sb.goalDiff = sb.goalsFor - sb.goalsAgainst;

  if (scoreA > scoreB) {
    sa.wins++;
    sb.losses++;
    sa.points += 3;
  } else {
    sb.wins++;
    sa.losses++;
    sb.points += 3;
  }

  sortStandings();
}

function renderLeagueTable(bodyEl) {
  bodyEl.innerHTML = "";
  tournament.standings.forEach((s, i) => {
    const pos = i + 1;
    let posBadge = `<span class="pos-badge">${pos}</span>`;
    if (pos <= 3) posBadge = `<span class="pos-badge pos-${pos}">${pos}</span>`;

    const badge = s.type === "human" ? `<span class="player-cell__badge">YOU</span>` : "";
    const isHuman = s.type === "human" ? 'highlight-row' : '';

    const tr = document.createElement("tr");
    tr.className = isHuman;
    tr.innerHTML = `
      <td class="col-pos">${posBadge}</td>
      <td class="col-player">
        <div class="player-cell">
          <span class="player-cell__dot" style="background:${s.color}"></span>
          <span class="player-cell__name">${s.name}</span>
          ${badge}
        </div>
      </td>
      <td class="col-num">${s.played}</td>
      <td class="col-num">${s.wins}</td>
      <td class="col-num">${s.losses}</td>
      <td class="col-num">${s.goalsFor}</td>
      <td class="col-num">${s.goalsAgainst}</td>
      <td class="col-num">${s.goalDiff > 0 ? '+' : ''}${s.goalDiff}</td>
      <td class="col-num col-pts">${s.points}</td>
    `;
    bodyEl.appendChild(tr);
  });
}

// ═══════════════════════════════════════
// AI vs AI INSTANT SIMULATION
// ═══════════════════════════════════════
function simulateAIMatch(playerADef, playerBDef) {
  // Run a headless simulation — simplified physics-based simulation
  let sA = 0, sB = 0;

  // We run an actual simulation loop without rendering
  const simPuck = { x: CENTER_X, y: CENTER_Y, vx: 3, vy: Math.random() * 4 - 2, radius: 18 };
  const simA = { x: 120, y: CENTER_Y, vx: 0, vy: 0, radius: 26 };
  const simB = { x: BOARD_WIDTH - 120, y: CENTER_Y, vx: 0, vy: 0, radius: 26 };

  const simAiStateA = { targetX: 120, targetY: CENTER_Y, frameCount: 0, lastUpdateFrame: 0 };
  const simAiStateB = { targetX: BOARD_WIDTH - 120, targetY: CENTER_Y, frameCount: 0, lastUpdateFrame: 0 };

  const maxFrames = 30000; // safety cap
  let frame = 0;

  while (sA < MAX_SCORE && sB < MAX_SCORE && frame < maxFrames) {
    frame++;
    simAiStateA.frameCount = frame;
    simAiStateB.frameCount = frame;

    // AI A logic
    {
      const puckOnMySide = simPuck.x < CENTER_X;
      const puckApproaching = simPuck.vx < -0.5;

      if (frame - simAiStateA.lastUpdateFrame >= playerADef.reactionDelay) {
        simAiStateA.lastUpdateFrame = frame;
        const offX = (Math.random() - 0.5) * playerADef.accuracy;
        const offY = (Math.random() - 0.5) * playerADef.accuracy;

        if (puckOnMySide || puckApproaching) {
          simAiStateA.targetX = simPuck.x - 30 + offX;
          simAiStateA.targetY = simPuck.y + offY;
        } else {
          simAiStateA.targetX = 120 + (CENTER_X - 120) * playerADef.aggression + offX;
          simAiStateA.targetY = CENTER_Y + (simPuck.y - CENTER_Y) * 0.4 + offY;
        }
      }

      const dx = simAiStateA.targetX - simA.x;
      const dy = simAiStateA.targetY - simA.y;
      if (Math.abs(dx) > 2) simA.vx += (dx > 0 ? 1 : -1) * playerADef.acceleration;
      if (Math.abs(dy) > 2) simA.vy += (dy > 0 ? 1 : -1) * playerADef.acceleration;
      simA.vx = clamp(simA.vx, -playerADef.maxSpeed, playerADef.maxSpeed);
      simA.vy = clamp(simA.vy, -playerADef.maxSpeed, playerADef.maxSpeed);
    }

    // AI B logic
    {
      const puckOnMySide = simPuck.x > CENTER_X;
      const puckApproaching = simPuck.vx > 0.5;

      if (frame - simAiStateB.lastUpdateFrame >= playerBDef.reactionDelay) {
        simAiStateB.lastUpdateFrame = frame;
        const offX = (Math.random() - 0.5) * playerBDef.accuracy;
        const offY = (Math.random() - 0.5) * playerBDef.accuracy;

        if (puckOnMySide || puckApproaching) {
          simAiStateB.targetX = simPuck.x + 30 + offX;
          simAiStateB.targetY = simPuck.y + offY;
        } else {
          const home = BOARD_WIDTH - 120;
          simAiStateB.targetX = home - (home - CENTER_X) * playerBDef.aggression + offX;
          simAiStateB.targetY = CENTER_Y + (simPuck.y - CENTER_Y) * 0.4 + offY;
        }
      }

      const dx = simAiStateB.targetX - simB.x;
      const dy = simAiStateB.targetY - simB.y;
      if (Math.abs(dx) > 2) simB.vx += (dx > 0 ? 1 : -1) * playerBDef.acceleration;
      if (Math.abs(dy) > 2) simB.vy += (dy > 0 ? 1 : -1) * playerBDef.acceleration;
      simB.vx = clamp(simB.vx, -playerBDef.maxSpeed, playerBDef.maxSpeed);
      simB.vy = clamp(simB.vy, -playerBDef.maxSpeed, playerBDef.maxSpeed);
    }

    // Move paddles
    simA.vx *= playerADef.friction;
    simA.vy *= playerADef.friction;
    simA.x += simA.vx;
    simA.y += simA.vy;
    simA.x = clamp(simA.x, simA.radius, CENTER_X - simA.radius);
    simA.y = clamp(simA.y, simA.radius, BOARD_HEIGHT - simA.radius);

    simB.vx *= playerBDef.friction;
    simB.vy *= playerBDef.friction;
    simB.x += simB.vx;
    simB.y += simB.vy;
    simB.x = clamp(simB.x, CENTER_X + simB.radius, BOARD_WIDTH - simB.radius);
    simB.y = clamp(simB.y, simB.radius, BOARD_HEIGHT - simB.radius);

    // Move puck
    simPuck.vx *= 0.995;
    simPuck.vy *= 0.995;
    simPuck.x += simPuck.vx;
    simPuck.y += simPuck.vy;

    // Puck-paddle collisions (simplified)
    function simCollide(pk, pd) {
      const ddx = pk.x - pd.x;
      const ddy = pk.y - pd.y;
      const dist = Math.sqrt(ddx * ddx + ddy * ddy);
      const minD = pk.radius + pd.radius;
      if (dist < minD && dist > 0) {
        const nx = ddx / dist;
        const ny = ddy / dist;
        const relVel = (pk.vx - pd.vx) * nx + (pk.vy - pd.vy) * ny;
        if (relVel < 0) {
          const impulse = -2 * relVel / (1/12 + 1/50);
          pk.vx += (impulse / 12) * nx;
          pk.vy += (impulse / 12) * ny;
          pd.vx -= (impulse / 50) * nx;
          pd.vy -= (impulse / 50) * ny;
        }
        // Separate
        const overlap = minD - dist;
        pk.x += nx * overlap * 0.7;
        pk.y += ny * overlap * 0.7;
        pd.x -= nx * overlap * 0.3;
        pd.y -= ny * overlap * 0.3;
      }
    }

    simCollide(simPuck, simA);
    simCollide(simPuck, simB);

    // Puck walls
    if (simPuck.y - simPuck.radius <= 0) { simPuck.y = simPuck.radius; simPuck.vy *= -1; }
    if (simPuck.y + simPuck.radius >= BOARD_HEIGHT) { simPuck.y = BOARD_HEIGHT - simPuck.radius; simPuck.vy *= -1; }

    if (simPuck.x - simPuck.radius <= 0) {
      const inGoal = simPuck.y > GOAL_TOP + simPuck.radius && simPuck.y < GOAL_TOP + GOAL_HEIGHT - simPuck.radius;
      if (inGoal) {
        sB++;
        simPuck.x = CENTER_X; simPuck.y = CENTER_Y;
        simPuck.vx = -3; simPuck.vy = Math.random() * 4 - 2;
        simA.x = 120; simA.y = CENTER_Y; simA.vx = 0; simA.vy = 0;
        simB.x = BOARD_WIDTH - 120; simB.y = CENTER_Y; simB.vx = 0; simB.vy = 0;
      } else {
        simPuck.x = simPuck.radius; simPuck.vx *= -1;
      }
    }

    if (simPuck.x + simPuck.radius >= BOARD_WIDTH) {
      const inGoal = simPuck.y > GOAL_TOP + simPuck.radius && simPuck.y < GOAL_TOP + GOAL_HEIGHT - simPuck.radius;
      if (inGoal) {
        sA++;
        simPuck.x = CENTER_X; simPuck.y = CENTER_Y;
        simPuck.vx = 3; simPuck.vy = Math.random() * 4 - 2;
        simA.x = 120; simA.y = CENTER_Y; simA.vx = 0; simA.vy = 0;
        simB.x = BOARD_WIDTH - 120; simB.y = CENTER_Y; simB.vx = 0; simB.vy = 0;
      } else {
        simPuck.x = BOARD_WIDTH - simPuck.radius; simPuck.vx *= -1;
      }
    }

    // Speed cap on puck
    const pSpeed = Math.sqrt(simPuck.vx * simPuck.vx + simPuck.vy * simPuck.vy);
    if (pSpeed > 14) {
      simPuck.vx = (simPuck.vx / pSpeed) * 14;
      simPuck.vy = (simPuck.vy / pSpeed) * 14;
    }
  }

  // If we hit frame cap, assign winner based on current score
  if (sA === sB) {
    // Edge case: give it to the stronger player (or random)
    if (Math.random() > 0.5) sA = MAX_SCORE;
    else sB = MAX_SCORE;
  }

  return { scoreA: sA, scoreB: sB };
}

// ═══════════════════════════════════════
// MATCH FLOW
// ═══════════════════════════════════════
function setupMatch(matchPairing) {
  const pA = PLAYERS[matchPairing.a];
  const pB = PLAYERS[matchPairing.b];

  match.playerA = pA;
  match.playerB = pB;
  match.scoreA = 0;
  match.scoreB = 0;
  match.over = false;
  match.isHumanMatch = (pA.type === "human" || pB.type === "human");

  // Configure paddles
  paddleA.color = pA.color;
  paddleA.maxSpeed = pA.type === "human" ? 7 : pA.maxSpeed;
  paddleA.acceleration = pA.type === "human" ? 0.7 : pA.acceleration;
  paddleA.friction = pA.type === "human" ? 0.90 : pA.friction;

  paddleB.color = pB.color;
  paddleB.maxSpeed = pB.type === "human" ? 7 : pB.maxSpeed;
  paddleB.acceleration = pB.type === "human" ? 0.7 : pB.acceleration;
  paddleB.friction = pB.type === "human" ? 0.90 : pB.friction;

  // Reset AI states
  aiStateA = { targetX: 120, targetY: CENTER_Y, frameCount: 0, lastUpdateFrame: 0 };
  aiStateB = { targetX: BOARD_WIDTH - 120, targetY: CENTER_Y, frameCount: 0, lastUpdateFrame: 0 };

  // Update UI
  const mi = tournament.currentMatchIndex + 1;
  const total = tournament.matches.length;
  matchLabel.textContent = `Match ${mi} of ${total}`;
  progressFill.style.width = `${(mi / total) * 100}%`;

  leftPlayerName.textContent = pA.name;
  rightPlayerName.textContent = pB.name;
  leftPlayerColor.style.background = pA.color;
  rightPlayerColor.style.background = pB.color;

  updateHud();
  resetRound("A");
}

function startCurrentMatch() {
  const pairing = tournament.matches[tournament.currentMatchIndex];
  setupMatch(pairing);

  if (match.isHumanMatch) {
    // Animated match
    statusEl.textContent = "Use arrow keys to play!";
    skipMatchBtn.style.display = "none";
    board.focus();
    animationId = requestAnimationFrame(gameLoop);
  } else {
    // AI vs AI — instant simulation
    statusEl.innerHTML = '<span class="sim-badge"><span class="sim-badge__dot"></span>Simulating AI Match...</span>';
    skipMatchBtn.style.display = "none";

    // Show the match info briefly, then simulate
    setTimeout(() => {
      const result = simulateAIMatch(match.playerA, match.playerB);
      match.scoreA = result.scoreA;
      match.scoreB = result.scoreB;
      match.over = true;
      updateHud();

      // Draw final state
      resetRound("A");
      drawAll();

      finishCurrentMatch();
    }, 300);
  }
}

function finishCurrentMatch() {
  const winnerName = match.scoreA > match.scoreB ? match.playerA.name : match.playerB.name;

  // Record result
  tournament.results.push({
    a: match.playerA.id,
    b: match.playerB.id,
    scoreA: match.scoreA,
    scoreB: match.scoreB,
    winner: match.scoreA > match.scoreB ? match.playerA.id : match.playerB.id
  });

  // Update standings
  updateStandings(match.playerA.id, match.playerB.id, match.scoreA, match.scoreB);
  renderLeagueTable(leagueBody);

  // Send to API
  sendMatchResult(match.playerA.name, match.playerB.name, match.scoreA, match.scoreB, winnerName);

  // Show result popup
  matchResultTitle.textContent = `${winnerName} Wins!`;
  matchResultDetail.textContent = `${match.playerA.name} ${match.scoreA} — ${match.scoreB} ${match.playerB.name}`;

  // Check if tournament is over
  if (tournament.currentMatchIndex >= tournament.matches.length - 1) {
    nextMatchBtn.textContent = "🏆 See Champion";
  } else {
    nextMatchBtn.textContent = "Next Match →";
  }

  showMatchResult();
}

function showMatchResult() {
  // Create overlay
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.id = "matchOverlay";
  document.body.appendChild(overlay);

  matchResultEl.style.display = "block";
}

function hideMatchResult() {
  matchResultEl.style.display = "none";
  const overlay = document.getElementById("matchOverlay");
  if (overlay) overlay.remove();
}

function advanceToNextMatch() {
  hideMatchResult();

  tournament.currentMatchIndex++;

  if (tournament.currentMatchIndex >= tournament.matches.length) {
    showChampion();
    return;
  }

  startCurrentMatch();
}

// ═══════════════════════════════════════
// CHAMPION SCREEN
// ═══════════════════════════════════════
function showChampion() {
  tournament.finished = true;

  gameScreen.style.display = "none";
  championScreen.style.display = "flex";

  const champ = tournament.standings[0];
  championNameEl.textContent = champ.name;
  championStatsEl.innerHTML = `
    <span>
      <span class="stat-value">${champ.points}</span>
      Points
    </span>
    <span>
      <span class="stat-value">${champ.wins}</span>
      Wins
    </span>
    <span>
      <span class="stat-value">${champ.goalsFor}</span>
      Goals
    </span>
    <span>
      <span class="stat-value">+${champ.goalDiff}</span>
      GD
    </span>
  `;

  renderLeagueTable(finalLeagueBody);
  startConfetti();

  // Send final standings to API
  sendTournamentResult();
}

// ═══════════════════════════════════════
// CONFETTI
// ═══════════════════════════════════════
let confettiParticles = [];
let confettiAnimId = null;

function startConfetti() {
  const cCtx = confettiCanvas.getContext("2d");
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;

  const colors = ["#fbbf24", "#6366f1", "#ef4444", "#22c55e", "#8b5cf6", "#f43f5e", "#3b82f6"];

  for (let i = 0; i < 150; i++) {
    confettiParticles.push({
      x: Math.random() * confettiCanvas.width,
      y: Math.random() * confettiCanvas.height - confettiCanvas.height,
      w: Math.random() * 10 + 4,
      h: Math.random() * 6 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      vy: Math.random() * 3 + 1.5,
      vx: Math.random() * 2 - 1,
      rotation: Math.random() * 360,
      rotSpeed: Math.random() * 6 - 3,
      opacity: Math.random() * 0.7 + 0.3
    });
  }

  function confettiLoop() {
    cCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

    confettiParticles.forEach(p => {
      p.y += p.vy;
      p.x += p.vx;
      p.rotation += p.rotSpeed;

      if (p.y > confettiCanvas.height + 20) {
        p.y = -20;
        p.x = Math.random() * confettiCanvas.width;
      }

      cCtx.save();
      cCtx.translate(p.x, p.y);
      cCtx.rotate((p.rotation * Math.PI) / 180);
      cCtx.globalAlpha = p.opacity;
      cCtx.fillStyle = p.color;
      cCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      cCtx.restore();
    });

    confettiAnimId = requestAnimationFrame(confettiLoop);
  }

  confettiLoop();
}

function stopConfetti() {
  if (confettiAnimId) cancelAnimationFrame(confettiAnimId);
  confettiParticles = [];
  const cCtx = confettiCanvas.getContext("2d");
  cCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
}

// ═══════════════════════════════════════
// API CALLS
// ═══════════════════════════════════════
async function sendMatchResult(playerA, playerB, scoreA, scoreB, winner) {
  try {
    await fetch("/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        winner,
        playerA, playerB,
        scoreA, scoreB,
        playedAt: new Date().toISOString()
      })
    });
  } catch (e) {
    // API unreachable — no problem for single-session
  }
}

async function sendTournamentResult() {
  try {
    await fetch("/api/tournament", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        champion: tournament.standings[0].name,
        standings: tournament.standings,
        results: tournament.results,
        completedAt: new Date().toISOString()
      })
    });
  } catch (e) {
    // API unreachable
  }
}

// ═══════════════════════════════════════
// SETUP SCREEN
// ═══════════════════════════════════════
function renderRoster() {
  rosterGrid.innerHTML = "";
  PLAYERS.forEach(p => {
    const card = document.createElement("div");
    card.className = "roster-card";
    card.innerHTML = `
      <div class="roster-card__dot" style="background:${p.color}"></div>
      <div class="roster-card__name">${p.name}</div>
      <div class="roster-card__type">${p.type === "human" ? "👤 You" : "🤖 AI"}</div>
    `;
    rosterGrid.appendChild(card);
  });
}

function startTournament() {
  generateMatches();
  initStandings();
  sortStandings();
  tournament.currentMatchIndex = 0;
  tournament.results = [];
  tournament.started = true;
  tournament.finished = false;

  renderLeagueTable(leagueBody);

  setupScreen.style.display = "none";
  gameScreen.style.display = "flex";
  championScreen.style.display = "none";

  startCurrentMatch();
}

function restartTournament() {
  stopConfetti();
  if (animationId) cancelAnimationFrame(animationId);

  championScreen.style.display = "none";
  gameScreen.style.display = "none";
  setupScreen.style.display = "flex";

  hideMatchResult();
}

// ═══════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════
startTournamentBtn.addEventListener("click", startTournament);
nextMatchBtn.addEventListener("click", advanceToNextMatch);
restartTournamentBtn.addEventListener("click", restartTournament);

// ═══════════════════════════════════════
// TAB SWITCHING
// ═══════════════════════════════════════
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("tab-btn--active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("tab-panel--active"));
    btn.classList.add("tab-btn--active");
    const tabId = "tab" + btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1);
    const panel = document.getElementById(tabId);
    if (panel) panel.classList.add("tab-panel--active");
  });
});

// ═══════════════════════════════════════
// BOT COUNT SLIDER / INPUT SYNC
// ═══════════════════════════════════════
const botCountSlider = document.getElementById("botCountSlider");
const botCountInput = document.getElementById("botCountInput");
const matchCountLabel = document.getElementById("matchCountLabel");

function updateMatchCount(n) {
  const m = (n * (n - 1)) / 2;
  if (matchCountLabel) matchCountLabel.textContent = m.toLocaleString();
}

if (botCountSlider && botCountInput) {
  botCountSlider.addEventListener("input", () => {
    botCountInput.value = botCountSlider.value;
    updateMatchCount(parseInt(botCountSlider.value));
  });

  botCountInput.addEventListener("input", () => {
    let v = parseInt(botCountInput.value) || 2;
    v = Math.max(2, Math.min(200, v));
    botCountSlider.value = Math.min(v, 100);
    updateMatchCount(v);
  });
}

// ═══════════════════════════════════════
// SERVER TOURNAMENT
// ═══════════════════════════════════════
const runServerBtn = document.getElementById("runServerTournamentBtn");
const serverResultEl = document.getElementById("serverResult");
const metricsDashboard = document.getElementById("metricsDashboard");
const metricsGrid = document.getElementById("metricsGrid");

if (runServerBtn) {
  runServerBtn.addEventListener("click", async () => {
    const n = parseInt(botCountInput.value) || 10;
    runServerBtn.disabled = true;
    runServerBtn.innerHTML = '<span class="spinner"></span> Running...';

    try {
      const res = await fetch("/api/tournament/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botCount: n })
      });
      const data = await res.json();

      if (!res.ok) {
        serverResultEl.innerHTML = `<p style="color:var(--red)">Error: ${data.error}</p>`;
        serverResultEl.style.display = "block";
        return;
      }

      renderServerResult(data);
      fetchAndShowMetrics();
    } catch (err) {
      serverResultEl.innerHTML = `<p style="color:var(--red)">Connection error: ${err.message}</p>`;
      serverResultEl.style.display = "block";
    } finally {
      runServerBtn.disabled = false;
      runServerBtn.innerHTML = '<span>Run Server Tournament</span>';
    }
  });
}

function renderServerResult(data) {
  const top5 = data.standings.slice(0, 5);
  serverResultEl.innerHTML = `
    <h3>Champion: ${data.champion.name}</h3>
    <div class="result-grid">
      <div class="result-card">
        <span class="result-card__value">${data.botCount}</span>
        <span class="result-card__label">Bots</span>
      </div>
      <div class="result-card">
        <span class="result-card__value">${data.matchCount.toLocaleString()}</span>
        <span class="result-card__label">Matches</span>
      </div>
      <div class="result-card">
        <span class="result-card__value">${(data.timing.totalMs / 1000).toFixed(2)}s</span>
        <span class="result-card__label">Total Time</span>
      </div>
      <div class="result-card">
        <span class="result-card__value">${data.timing.avgMatchMs.toFixed(1)}ms</span>
        <span class="result-card__label">Avg Match</span>
      </div>
    </div>
    <table class="result-table">
      <thead><tr><th>#</th><th>Bot</th><th>W</th><th>L</th><th>GD</th><th>Pts</th></tr></thead>
      <tbody>
        ${top5.map((s, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${s.name}</td>
            <td>${s.wins}</td>
            <td>${s.losses}</td>
            <td>${s.goalDiff > 0 ? '+' : ''}${s.goalDiff}</td>
            <td style="color:var(--accent);font-weight:700">${s.points}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  serverResultEl.style.display = "block";
}

// ═══════════════════════════════════════
// BENCHMARK
// ═══════════════════════════════════════
const runBenchmarkBtn = document.getElementById("runBenchmarkBtn");
const benchmarkResultEl = document.getElementById("benchmarkResult");

if (runBenchmarkBtn) {
  runBenchmarkBtn.addEventListener("click", async () => {
    const checkboxes = document.querySelectorAll(".benchmark-sizes input:checked");
    const sizes = Array.from(checkboxes).map(cb => parseInt(cb.value)).sort((a, b) => a - b);

    if (sizes.length === 0) {
      benchmarkResultEl.innerHTML = '<p style="color:var(--red)">Select at least one tournament size.</p>';
      benchmarkResultEl.style.display = "block";
      return;
    }

    runBenchmarkBtn.disabled = true;
    runBenchmarkBtn.innerHTML = '<span class="spinner"></span> Benchmarking...';

    try {
      const res = await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sizes })
      });
      const data = await res.json();

      if (!res.ok) {
        benchmarkResultEl.innerHTML = `<p style="color:var(--red)">Error: ${data.error}</p>`;
        benchmarkResultEl.style.display = "block";
        return;
      }

      renderBenchmarkResult(data);
      fetchAndShowMetrics();
    } catch (err) {
      benchmarkResultEl.innerHTML = `<p style="color:var(--red)">Connection error: ${err.message}</p>`;
      benchmarkResultEl.style.display = "block";
    } finally {
      runBenchmarkBtn.disabled = false;
      runBenchmarkBtn.innerHTML = '<span>Run Scaling Benchmark</span>';
    }
  });
}

function renderBenchmarkResult(data) {
  const rows = data.benchmark;
  benchmarkResultEl.innerHTML = `
    <h3>Scaling Benchmark Results</h3>
    <div class="result-grid">
      <div class="result-card">
        <span class="result-card__value">${data.system.cpus}</span>
        <span class="result-card__label">CPU Cores</span>
      </div>
      <div class="result-card">
        <span class="result-card__value">${data.system.platform}</span>
        <span class="result-card__label">Platform</span>
      </div>
      <div class="result-card">
        <span class="result-card__value">${(data.system.totalMemoryMB / 1024).toFixed(1)} GB</span>
        <span class="result-card__label">Memory</span>
      </div>
    </div>
    <table class="result-table">
      <thead><tr><th>Bots</th><th>Matches</th><th>Total</th><th>Avg/Match</th><th>Champion</th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${r.botCount}</td>
            <td>${r.matchCount.toLocaleString()}</td>
            <td>${(r.totalMs / 1000).toFixed(2)}s</td>
            <td>${r.avgMatchMs.toFixed(1)}ms</td>
            <td>${r.champion}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  benchmarkResultEl.style.display = "block";
}

// ═══════════════════════════════════════
// METRICS DASHBOARD
// ═══════════════════════════════════════
async function fetchAndShowMetrics() {
  try {
    const res = await fetch("/api/metrics");
    const data = await res.json();

    metricsGrid.innerHTML = `
      <div class="metric-item">
        <span class="metric-item__value metric-item__value--cpu">${data.cpu.currentUtilization.toFixed(1)}%</span>
        <span class="metric-item__label">CPU Usage</span>
      </div>
      <div class="metric-item">
        <span class="metric-item__value metric-item__value--latency">${data.latency.avgMs.toFixed(1)}ms</span>
        <span class="metric-item__label">Avg Latency</span>
      </div>
      <div class="metric-item">
        <span class="metric-item__value metric-item__value--latency">${data.latency.p95Ms.toFixed(1)}ms</span>
        <span class="metric-item__label">P95 Latency</span>
      </div>
      <div class="metric-item">
        <span class="metric-item__value metric-item__value--memory">${data.system.freeMemoryMB} MB</span>
        <span class="metric-item__label">Free Memory</span>
      </div>
      <div class="metric-item">
        <span class="metric-item__value metric-item__value--time">${data.system.uptime}s</span>
        <span class="metric-item__label">Uptime</span>
      </div>
      <div class="metric-item">
        <span class="metric-item__value metric-item__value--cpu">${data.tournaments.length}</span>
        <span class="metric-item__label">Tournaments Run</span>
      </div>
    `;
    metricsDashboard.style.display = "block";
  } catch (e) {
    // Metrics unavailable — hide dashboard
  }
}

// ═══════════════════════════════════════
// INIT
// ═══════════════════════════════════════
renderRoster();
drawAll();
