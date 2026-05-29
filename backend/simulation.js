/**
 * simulation.js — Server-side Air Hockey match simulation engine
 * Ported from the client-side game.js physics for headless execution.
 */

const BOARD_WIDTH = 770;
const BOARD_HEIGHT = 520;
const CENTER_X = BOARD_WIDTH / 2;
const CENTER_Y = BOARD_HEIGHT / 2;
const GOAL_HEIGHT = 190;
const GOAL_TOP = (BOARD_HEIGHT - GOAL_HEIGHT) / 2;
const MAX_SCORE = 7;
const MAX_FRAMES = 30000; // safety cap per match

/**
 * Generate n bots with linearly interpolated difficulty.
 * Bot 0 is the weakest, Bot n-1 is the strongest.
 */
function generateBots(n) {
  const bots = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0; // 0..1 difficulty ratio
    bots.push({
      id: i,
      name: `Bot-${i + 1}`,
      maxSpeed:       3.0 + t * 3.5,           // 3.0 → 6.5
      acceleration:   0.20 + t * 0.30,          // 0.20 → 0.50
      friction:       0.92 - t * 0.02,          // 0.92 → 0.90
      aggression:     0.15 + t * 0.65,          // 0.15 → 0.80
      reactionDelay:  Math.round(12 - t * 11),  // 12 → 1
      accuracy:       35 - t * 31               // 35 → 4
    });
  }
  return bots;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Simulate a single match between two bots.
 * Returns { scoreA, scoreB, winnerId, winnerName, frames }
 */
function simulateMatch(botA, botB) {
  let sA = 0, sB = 0;

  const puck = { x: CENTER_X, y: CENTER_Y, vx: 3, vy: Math.random() * 4 - 2, radius: 18 };
  const padA = { x: 120, y: CENTER_Y, vx: 0, vy: 0, radius: 26 };
  const padB = { x: BOARD_WIDTH - 120, y: CENTER_Y, vx: 0, vy: 0, radius: 26 };

  const aiA = { targetX: 120, targetY: CENTER_Y, frameCount: 0, lastUpdate: 0 };
  const aiB = { targetX: BOARD_WIDTH - 120, targetY: CENTER_Y, frameCount: 0, lastUpdate: 0 };

  let frame = 0;

  while (sA < MAX_SCORE && sB < MAX_SCORE && frame < MAX_FRAMES) {
    frame++;
    aiA.frameCount = frame;
    aiB.frameCount = frame;

    // --- AI A (left side) ---
    if (frame - aiA.lastUpdate >= botA.reactionDelay) {
      aiA.lastUpdate = frame;
      const offX = (Math.random() - 0.5) * botA.accuracy;
      const offY = (Math.random() - 0.5) * botA.accuracy;
      const onMySide = puck.x < CENTER_X;
      const approaching = puck.vx < -0.5;

      if (onMySide || approaching) {
        aiA.targetX = puck.x - 30 + offX;
        aiA.targetY = puck.y + offY;
      } else {
        aiA.targetX = 120 + (CENTER_X - 120) * botA.aggression + offX;
        aiA.targetY = CENTER_Y + (puck.y - CENTER_Y) * 0.4 + offY;
      }
    }
    {
      const dx = aiA.targetX - padA.x;
      const dy = aiA.targetY - padA.y;
      if (Math.abs(dx) > 2) padA.vx += (dx > 0 ? 1 : -1) * botA.acceleration;
      if (Math.abs(dy) > 2) padA.vy += (dy > 0 ? 1 : -1) * botA.acceleration;
      padA.vx = clamp(padA.vx, -botA.maxSpeed, botA.maxSpeed);
      padA.vy = clamp(padA.vy, -botA.maxSpeed, botA.maxSpeed);
    }

    // --- AI B (right side) ---
    if (frame - aiB.lastUpdate >= botB.reactionDelay) {
      aiB.lastUpdate = frame;
      const offX = (Math.random() - 0.5) * botB.accuracy;
      const offY = (Math.random() - 0.5) * botB.accuracy;
      const onMySide = puck.x > CENTER_X;
      const approaching = puck.vx > 0.5;

      if (onMySide || approaching) {
        aiB.targetX = puck.x + 30 + offX;
        aiB.targetY = puck.y + offY;
      } else {
        const home = BOARD_WIDTH - 120;
        aiB.targetX = home - (home - CENTER_X) * botB.aggression + offX;
        aiB.targetY = CENTER_Y + (puck.y - CENTER_Y) * 0.4 + offY;
      }
    }
    {
      const dx = aiB.targetX - padB.x;
      const dy = aiB.targetY - padB.y;
      if (Math.abs(dx) > 2) padB.vx += (dx > 0 ? 1 : -1) * botB.acceleration;
      if (Math.abs(dy) > 2) padB.vy += (dy > 0 ? 1 : -1) * botB.acceleration;
      padB.vx = clamp(padB.vx, -botB.maxSpeed, botB.maxSpeed);
      padB.vy = clamp(padB.vy, -botB.maxSpeed, botB.maxSpeed);
    }

    // --- Move paddles ---
    padA.vx *= botA.friction; padA.vy *= botA.friction;
    padA.x += padA.vx; padA.y += padA.vy;
    padA.x = clamp(padA.x, padA.radius, CENTER_X - padA.radius);
    padA.y = clamp(padA.y, padA.radius, BOARD_HEIGHT - padA.radius);

    padB.vx *= botB.friction; padB.vy *= botB.friction;
    padB.x += padB.vx; padB.y += padB.vy;
    padB.x = clamp(padB.x, CENTER_X + padB.radius, BOARD_WIDTH - padB.radius);
    padB.y = clamp(padB.y, padB.radius, BOARD_HEIGHT - padB.radius);

    // --- Move puck ---
    puck.vx *= 0.995; puck.vy *= 0.995;
    puck.x += puck.vx; puck.y += puck.vy;

    // --- Puck-paddle collisions ---
    resolveCollision(puck, padA);
    resolveCollision(puck, padB);

    // --- Puck-wall collisions ---
    if (puck.y - puck.radius <= 0) { puck.y = puck.radius; puck.vy *= -1; }
    if (puck.y + puck.radius >= BOARD_HEIGHT) { puck.y = BOARD_HEIGHT - puck.radius; puck.vy *= -1; }

    // Left wall / goal
    if (puck.x - puck.radius <= 0) {
      const inGoal = puck.y > GOAL_TOP + puck.radius && puck.y < GOAL_TOP + GOAL_HEIGHT - puck.radius;
      if (inGoal) {
        sB++;
        resetAfterGoal(puck, padA, padB, -3);
      } else {
        puck.x = puck.radius; puck.vx *= -1;
      }
    }

    // Right wall / goal
    if (puck.x + puck.radius >= BOARD_WIDTH) {
      const inGoal = puck.y > GOAL_TOP + puck.radius && puck.y < GOAL_TOP + GOAL_HEIGHT - puck.radius;
      if (inGoal) {
        sA++;
        resetAfterGoal(puck, padA, padB, 3);
      } else {
        puck.x = BOARD_WIDTH - puck.radius; puck.vx *= -1;
      }
    }

    // Speed cap
    const speed = Math.sqrt(puck.vx * puck.vx + puck.vy * puck.vy);
    if (speed > 14) {
      puck.vx = (puck.vx / speed) * 14;
      puck.vy = (puck.vy / speed) * 14;
    }
  }

  // Tie-breaker (edge case at frame cap)
  if (sA === sB) {
    if (Math.random() > 0.5) sA = MAX_SCORE; else sB = MAX_SCORE;
  }

  const winner = sA > sB ? botA : botB;
  return {
    botA: botA.id,
    botB: botB.id,
    nameA: botA.name,
    nameB: botB.name,
    scoreA: sA,
    scoreB: sB,
    winnerId: winner.id,
    winnerName: winner.name,
    frames: frame
  };
}

function resolveCollision(pk, pd) {
  const dx = pk.x - pd.x;
  const dy = pk.y - pd.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minD = pk.radius + pd.radius;
  if (dist >= minD || dist === 0) return;

  const nx = dx / dist;
  const ny = dy / dist;
  const relVel = (pk.vx - pd.vx) * nx + (pk.vy - pd.vy) * ny;
  if (relVel >= 0) return;

  const puckMass = 12;
  const paddleMass = 50;
  const impulse = -2 * relVel / (1 / puckMass + 1 / paddleMass);

  pk.vx += (impulse / puckMass) * nx;
  pk.vy += (impulse / puckMass) * ny;
  pd.vx -= (impulse / paddleMass) * nx;
  pd.vy -= (impulse / paddleMass) * ny;

  const overlap = minD - dist;
  pk.x += nx * overlap * 0.7;
  pk.y += ny * overlap * 0.7;
  pd.x -= nx * overlap * 0.3;
  pd.y -= ny * overlap * 0.3;
}

function resetAfterGoal(puck, padA, padB, puckVx) {
  puck.x = CENTER_X; puck.y = CENTER_Y;
  puck.vx = puckVx; puck.vy = Math.random() * 4 - 2;
  padA.x = 120; padA.y = CENTER_Y; padA.vx = 0; padA.vy = 0;
  padB.x = BOARD_WIDTH - 120; padB.y = CENTER_Y; padB.vx = 0; padB.vy = 0;
}

module.exports = { generateBots, simulateMatch, MAX_SCORE };
