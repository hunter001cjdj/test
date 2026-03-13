const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const timerEl = document.getElementById("timer");
const playerScoreEl = document.getElementById("playerScore");
const enemyScoreEl = document.getElementById("enemyScore");
const playerHealthEl = document.getElementById("playerHealth");
const enemyHealthEl = document.getElementById("enemyHealth");
const statusTextEl = document.getElementById("statusText");

const overlay = document.getElementById("overlay");
const overlayKicker = document.getElementById("overlayKicker");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");

const ARENA = {
  width: canvas.width,
  height: canvas.height,
  obstacle: { x: 390, y: 200, width: 180, height: 140 },
};

const ROUND_DURATION_MS = 5 * 60 * 1000;
const RESPAWN_DELAY_MS = 1200;

const pointer = { x: ARENA.width / 2, y: ARENA.height / 2 };
const keys = {};

const state = {
  running: false,
  ended: false,
  lastTime: 0,
  startedAt: 0,
  timeLeft: ROUND_DURATION_MS,
  playerScore: 0,
  enemyScore: 0,
  bullets: [],
  particles: [],
  announcements: [],
};

const player = createFighter({
  x: 140,
  y: ARENA.height / 2,
  color: "#3dd9b1",
  accent: "#9cf4db",
  label: "PLAYER",
  isAI: false,
});

const enemy = createFighter({
  x: ARENA.width - 140,
  y: ARENA.height / 2,
  color: "#ff6b6b",
  accent: "#ffc0c0",
  label: "ENEMY",
  isAI: true,
});

function createFighter(config) {
  return {
    x: config.x,
    y: config.y,
    radius: 18,
    color: config.color,
    accent: config.accent,
    label: config.label,
    isAI: config.isAI,
    angle: config.isAI ? Math.PI : 0,
    speed: config.isAI ? 180 : 245,
    fireRate: config.isAI ? 0.52 : 0.22,
    bulletSpeed: config.isAI ? 390 : 520,
    bulletDamage: config.isAI ? 20 : 24,
    maxHealth: 100,
    health: 100,
    alive: true,
    respawnAt: 0,
    cooldown: 0,
    hitFlash: 0,
    strafeDirection: 1,
    aiStateTime: 0,
  };
}

function resetFighter(fighter, x, y) {
  fighter.x = x;
  fighter.y = y;
  fighter.health = fighter.maxHealth;
  fighter.alive = true;
  fighter.cooldown = 0;
  fighter.hitFlash = 0;
  fighter.respawnAt = 0;
  fighter.angle = fighter.isAI ? Math.PI : 0;
  fighter.aiStateTime = 0;
}

function resetGame() {
  state.running = false;
  state.ended = false;
  state.lastTime = 0;
  state.startedAt = 0;
  state.timeLeft = ROUND_DURATION_MS;
  state.playerScore = 0;
  state.enemyScore = 0;
  state.bullets = [];
  state.particles = [];
  state.announcements = [];

  resetFighter(player, 140, ARENA.height / 2);
  resetFighter(enemy, ARENA.width - 140, ARENA.height / 2);

  updateHUD();
  showOverlay(
    "Ready",
    "Get the most kills in 5 minutes",
    "Both fighters respawn after a short delay. Keep scoring until the timer reaches zero."
  );
  setStatus("Press Start Game to enter the arena.");
}

function startGame() {
  state.running = true;
  state.ended = false;
  state.startedAt = performance.now();
  state.lastTime = 0;
  state.timeLeft = ROUND_DURATION_MS;
  state.playerScore = 0;
  state.enemyScore = 0;
  state.bullets = [];
  state.particles = [];
  state.announcements = [];
  resetFighter(player, 140, ARENA.height / 2);
  resetFighter(enemy, ARENA.width - 140, ARENA.height / 2);
  overlay.classList.remove("visible");
  updateHUD();
  setStatus("Battle started. The winner is decided when the 5-minute timer ends.");
}

function endGame() {
  state.running = false;
  state.ended = true;

  let title = "Draw";
  let message = "Time is up and both sides have the same number of kills. Run it back.";
  let kicker = "Round Over";

  if (state.playerScore > state.enemyScore) {
    title = "You Win";
    message = `You scored ${state.playerScore} kills in 5 minutes and took the match.`;
    kicker = "Victory";
  } else if (state.playerScore < state.enemyScore) {
    title = "Enemy Wins";
    message = `The enemy leads ${state.enemyScore} to ${state.playerScore} and wins this round.`;
    kicker = "Defeat";
  }

  showOverlay(kicker, title, message);
  setStatus("Time is up. Press restart to reset the match.");
}

function showOverlay(kicker, title, text) {
  overlayKicker.textContent = kicker;
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlay.classList.add("visible");
}

function setStatus(text) {
  statusTextEl.textContent = text;
}

function updateHUD() {
  timerEl.textContent = formatTime(state.timeLeft);
  playerScoreEl.textContent = String(state.playerScore);
  enemyScoreEl.textContent = String(state.enemyScore);
  playerHealthEl.textContent = String(Math.max(0, Math.ceil(player.health)));
  enemyHealthEl.textContent = String(Math.max(0, Math.ceil(enemy.health)));
}

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isInsideObstacle(x, y, padding = 0) {
  const obstacle = ARENA.obstacle;
  return (
    x > obstacle.x - padding &&
    x < obstacle.x + obstacle.width + padding &&
    y > obstacle.y - padding &&
    y < obstacle.y + obstacle.height + padding
  );
}

function moveWithCollision(fighter, nextX, nextY) {
  const margin = fighter.radius;
  let targetX = clamp(nextX, margin, ARENA.width - margin);
  let targetY = clamp(nextY, margin, ARENA.height - margin);

  if (!isInsideObstacle(targetX, targetY, fighter.radius)) {
    fighter.x = targetX;
    fighter.y = targetY;
    return;
  }

  if (!isInsideObstacle(targetX, fighter.y, fighter.radius)) {
    fighter.x = targetX;
  }

  if (!isInsideObstacle(fighter.x, targetY, fighter.radius)) {
    fighter.y = targetY;
  }
}

function spawnBullet(shooter, angle) {
  state.bullets.push({
    x: shooter.x + Math.cos(angle) * (shooter.radius + 10),
    y: shooter.y + Math.sin(angle) * (shooter.radius + 10),
    vx: Math.cos(angle) * shooter.bulletSpeed,
    vy: Math.sin(angle) * shooter.bulletSpeed,
    radius: shooter.isAI ? 4 : 5,
    damage: shooter.bulletDamage,
    owner: shooter,
    life: 1.5,
  });
}

function shoot(shooter, angle) {
  if (!shooter.alive || shooter.cooldown > 0 || !state.running) {
    return;
  }

  shooter.cooldown = shooter.fireRate;
  spawnBullet(shooter, angle);
  emitMuzzleParticles(shooter, angle);
}

function emitMuzzleParticles(shooter, angle) {
  for (let i = 0; i < 6; i += 1) {
    const speed = 40 + Math.random() * 120;
    const spread = (Math.random() - 0.5) * 0.7;
    state.particles.push({
      x: shooter.x + Math.cos(angle) * (shooter.radius + 4),
      y: shooter.y + Math.sin(angle) * (shooter.radius + 4),
      vx: Math.cos(angle + spread) * speed,
      vy: Math.sin(angle + spread) * speed,
      life: 0.2 + Math.random() * 0.2,
      maxLife: 0.4,
      color: shooter.accent,
      size: 2 + Math.random() * 2,
    });
  }
}

function emitHitParticles(target) {
  for (let i = 0; i < 12; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 160;
    state.particles.push({
      x: target.x,
      y: target.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.35 + Math.random() * 0.3,
      maxLife: 0.65,
      color: target.color,
      size: 2 + Math.random() * 4,
    });
  }
}

function announce(text, color) {
  state.announcements.push({
    text,
    color,
    life: 1.1,
    maxLife: 1.1,
  });
}

function respawnFighter(fighter, now) {
  if (fighter.alive || fighter.respawnAt === 0 || now < fighter.respawnAt) {
    return;
  }

  const spawnX = fighter.isAI ? ARENA.width - 140 : 140;
  const spawnY = fighter.isAI ? 120 + Math.random() * (ARENA.height - 240) : 120 + Math.random() * (ARENA.height - 240);
  resetFighter(fighter, spawnX, spawnY);
}

function damageTarget(target, damage, attacker, now) {
  if (!target.alive) {
    return;
  }

  target.health -= damage;
  target.hitFlash = 0.15;
  emitHitParticles(target);

  if (target.health > 0) {
    return;
  }

  target.alive = false;
  target.health = 0;
  target.respawnAt = now + RESPAWN_DELAY_MS;

  if (attacker === player) {
    state.playerScore += 1;
    announce("Player Kill +1", player.color);
    setStatus("Enemy down. Keep the pressure on.");
  } else if (attacker === enemy) {
    state.enemyScore += 1;
    announce("Enemy Kill +1", enemy.color);
    setStatus("You were eliminated. Respawn and counterattack.");
  }

  updateHUD();
}

function lineIntersectsObstacle(x1, y1, x2, y2) {
  const obstacle = ARENA.obstacle;
  const samples = 18;

  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    if (
      px >= obstacle.x &&
      px <= obstacle.x + obstacle.width &&
      py >= obstacle.y &&
      py <= obstacle.y + obstacle.height
    ) {
      return true;
    }
  }

  return false;
}

function updatePlayer(dt) {
  if (!player.alive) {
    return;
  }

  let moveX = 0;
  let moveY = 0;

  if (keys.KeyW) moveY -= 1;
  if (keys.KeyS) moveY += 1;
  if (keys.KeyA) moveX -= 1;
  if (keys.KeyD) moveX += 1;

  if (moveX !== 0 || moveY !== 0) {
    const length = Math.hypot(moveX, moveY) || 1;
    moveX /= length;
    moveY /= length;
  }

  moveWithCollision(
    player,
    player.x + moveX * player.speed * dt,
    player.y + moveY * player.speed * dt
  );

  player.angle = Math.atan2(pointer.y - player.y, pointer.x - player.x);
}

function updateEnemy(dt) {
  if (!enemy.alive) {
    return;
  }

  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;
  const desiredAngle = Math.atan2(dy, dx);
  enemy.angle = desiredAngle;
  enemy.aiStateTime -= dt;

  if (enemy.aiStateTime <= 0) {
    enemy.aiStateTime = 0.8 + Math.random() * 1.1;
    enemy.strafeDirection *= Math.random() > 0.4 ? 1 : -1;
  }

  let moveX = 0;
  let moveY = 0;

  if (distance > 250) {
    moveX = dx / distance;
    moveY = dy / distance;
  } else if (distance < 150) {
    moveX = -dx / distance;
    moveY = -dy / distance;
  }

  moveX += (-dy / distance) * 0.7 * enemy.strafeDirection;
  moveY += (dx / distance) * 0.7 * enemy.strafeDirection;

  const movementLength = Math.hypot(moveX, moveY) || 1;
  moveX /= movementLength;
  moveY /= movementLength;

  moveWithCollision(
    enemy,
    enemy.x + moveX * enemy.speed * dt,
    enemy.y + moveY * enemy.speed * dt
  );

  const hasLineOfSight = !lineIntersectsObstacle(enemy.x, enemy.y, player.x, player.y);
  if (hasLineOfSight && distance < 460) {
    shoot(enemy, enemy.angle);
  }
}

function updateBullets(dt, now) {
  state.bullets = state.bullets.filter((bullet) => {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;

    if (
      bullet.x < -20 ||
      bullet.x > ARENA.width + 20 ||
      bullet.y < -20 ||
      bullet.y > ARENA.height + 20 ||
      bullet.life <= 0
    ) {
      return false;
    }

    if (isInsideObstacle(bullet.x, bullet.y, bullet.radius)) {
      return false;
    }

    const target = bullet.owner === player ? enemy : player;
    if (!target.alive) {
      return true;
    }

    const distance = Math.hypot(bullet.x - target.x, bullet.y - target.y);
    if (distance <= bullet.radius + target.radius) {
      damageTarget(target, bullet.damage, bullet.owner, now);
      return false;
    }

    return true;
  });
}

function updateParticles(dt) {
  state.particles = state.particles.filter((particle) => {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.life -= dt;
    return particle.life > 0;
  });

  state.announcements = state.announcements.filter((item) => {
    item.life -= dt;
    return item.life > 0;
  });
}

function updateCooldowns(dt) {
  [player, enemy].forEach((fighter) => {
    fighter.cooldown = Math.max(0, fighter.cooldown - dt);
    fighter.hitFlash = Math.max(0, fighter.hitFlash - dt);
  });
}

function update(now) {
  if (!state.running) {
    return;
  }

  if (!state.lastTime) {
    state.lastTime = now;
  }

  const dt = Math.min((now - state.lastTime) / 1000, 0.032);
  state.lastTime = now;
  state.timeLeft = Math.max(0, ROUND_DURATION_MS - (now - state.startedAt));

  if (state.timeLeft <= 0) {
    updateHUD();
    endGame();
    return;
  }

  updateCooldowns(dt);
  updatePlayer(dt);
  updateEnemy(dt);
  updateBullets(dt, now);
  updateParticles(dt);
  respawnFighter(player, now);
  respawnFighter(enemy, now);
  updateHUD();
}

function drawArena() {
  ctx.clearRect(0, 0, ARENA.width, ARENA.height);

  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  const cols = Math.ceil(ARENA.width / 48);
  const rows = Math.ceil(ARENA.height / 48);
  for (let x = 0; x <= cols; x += 1) {
    ctx.fillRect(x * 48, 0, 1, ARENA.height);
  }
  for (let y = 0; y <= rows; y += 1) {
    ctx.fillRect(0, y * 48, ARENA.width, 1);
  }
  ctx.restore();

  const obstacle = ARENA.obstacle;
  ctx.save();
  ctx.fillStyle = "rgba(7, 15, 22, 0.9)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 2;
  roundRect(ctx, obstacle.x, obstacle.y, obstacle.width, obstacle.height, 16);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawFighter(fighter) {
  if (!fighter.alive) {
    if (state.running && fighter.respawnAt > 0) {
      const remaining = Math.max(0, fighter.respawnAt - performance.now());
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.beginPath();
      ctx.arc(fighter.x, fighter.y, fighter.radius + 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 14px Segoe UI";
      ctx.textAlign = "center";
      ctx.fillText(`${(remaining / 1000).toFixed(1)}s`, fighter.x, fighter.y + 5);
      ctx.restore();
    }
    return;
  }

  ctx.save();
  ctx.translate(fighter.x, fighter.y);
  ctx.rotate(fighter.angle);

  ctx.fillStyle = fighter.hitFlash > 0 ? "#ffffff" : fighter.color;
  ctx.beginPath();
  ctx.arc(0, 0, fighter.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = fighter.accent;
  ctx.fillRect(6, -5, fighter.radius + 14, 10);

  ctx.restore();

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fillRect(fighter.x - 26, fighter.y - fighter.radius - 20, 52, 6);
  ctx.fillStyle = fighter.color;
  ctx.fillRect(
    fighter.x - 26,
    fighter.y - fighter.radius - 20,
    52 * (fighter.health / fighter.maxHealth),
    6
  );
  ctx.fillStyle = "#dfe8f5";
  ctx.font = "bold 12px Segoe UI";
  ctx.textAlign = "center";
  ctx.fillText(fighter.label, fighter.x, fighter.y + fighter.radius + 18);
  ctx.restore();
}

function drawBullets() {
  state.bullets.forEach((bullet) => {
    ctx.save();
    ctx.fillStyle = bullet.owner === player ? "#9cf4db" : "#ffd5d5";
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawParticles() {
  state.particles.forEach((particle) => {
    ctx.save();
    ctx.globalAlpha = particle.life / particle.maxLife;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawAnnouncements() {
  state.announcements.forEach((item, index) => {
    ctx.save();
    ctx.globalAlpha = item.life / item.maxLife;
    ctx.fillStyle = item.color;
    ctx.font = "bold 24px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText(item.text, ARENA.width / 2, 80 + index * 32);
    ctx.restore();
  });
}

function drawCrosshair() {
  if (!player.alive || overlay.classList.contains("visible")) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(pointer.x, pointer.y, 12, 0, Math.PI * 2);
  ctx.moveTo(pointer.x - 18, pointer.y);
  ctx.lineTo(pointer.x - 6, pointer.y);
  ctx.moveTo(pointer.x + 6, pointer.y);
  ctx.lineTo(pointer.x + 18, pointer.y);
  ctx.moveTo(pointer.x, pointer.y - 18);
  ctx.lineTo(pointer.x, pointer.y - 6);
  ctx.moveTo(pointer.x, pointer.y + 6);
  ctx.lineTo(pointer.x, pointer.y + 18);
  ctx.stroke();
  ctx.restore();
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function render() {
  drawArena();
  drawParticles();
  drawBullets();
  drawFighter(player);
  drawFighter(enemy);
  drawAnnouncements();
  drawCrosshair();
}

function loop(now) {
  update(now);
  render();
  requestAnimationFrame(loop);
}

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = ARENA.width / rect.width;
  const scaleY = ARENA.height / rect.height;
  pointer.x = (event.clientX - rect.left) * scaleX;
  pointer.y = (event.clientY - rect.top) * scaleY;
});

canvas.addEventListener("mousedown", (event) => {
  if (event.button !== 0) {
    return;
  }
  shoot(player, player.angle);
});

window.addEventListener("keydown", (event) => {
  keys[event.code] = true;

  if (event.code === "Space") {
    event.preventDefault();
    shoot(player, player.angle);
  }
});

window.addEventListener("keyup", (event) => {
  keys[event.code] = false;
});

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", () => {
  resetGame();
});

resetGame();
requestAnimationFrame(loop);
