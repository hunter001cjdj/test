const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const createRoomButton = document.getElementById("createRoomButton");
const joinRoomButton = document.getElementById("joinRoomButton");
const leaveRoomButton = document.getElementById("leaveRoomButton");
const startMatchButton = document.getElementById("startMatchButton");
const playerNameInput = document.getElementById("playerName");
const roomCodeInput = document.getElementById("roomCodeInput");
const roomCodeText = document.getElementById("roomCodeText");
const playerRoleText = document.getElementById("playerRoleText");
const playerList = document.getElementById("playerList");
const timerEl = document.getElementById("timer");
const localScoreEl = document.getElementById("localScore");
const localHealthEl = document.getElementById("localHealth");
const matchStateEl = document.getElementById("matchState");
const statusTextEl = document.getElementById("statusText");
const overlay = document.getElementById("overlay");
const overlayTag = document.getElementById("overlayTag");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");

const socketUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;
const socket = new WebSocket(socketUrl);

const ARENA = {
  width: canvas.width,
  height: canvas.height,
  obstacle: { x: 390, y: 200, width: 180, height: 140 },
};

const state = {
  connected: false,
  clientId: null,
  roomCode: "",
  room: null,
  game: null,
  particles: [],
};

const inputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  shooting: false,
  aimX: ARENA.width / 2,
  aimY: ARENA.height / 2,
};

function send(type, payload = {}) {
  if (socket.readyState !== 1) {
    return;
  }

  socket.send(JSON.stringify({ type, payload }));
}

function setStatus(text) {
  statusTextEl.textContent = text;
}

function showOverlay(tag, title, text) {
  overlayTag.textContent = tag;
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlay.classList.add("visible");
}

function hideOverlay() {
  overlay.classList.remove("visible");
}

function getPlayerName() {
  const name = playerNameInput.value.trim();
  return name || `Player-${Math.floor(100 + Math.random() * 900)}`;
}

function createPlayerCard(player, isLocal) {
  const div = document.createElement("div");
  div.className = "player-chip";

  const left = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = `${player.name}${isLocal ? " (你)" : ""}`;
  const meta = document.createElement("span");
  meta.textContent = `${player.isHost ? "房主" : "玩家"} | Kills ${player.score} | HP ${Math.max(0, Math.ceil(player.health))}`;
  left.append(name, meta);

  const right = document.createElement("span");
  right.textContent = player.alive ? "在線" : "重生中";
  div.append(left, right);
  return div;
}

function renderRoomInfo() {
  roomCodeText.textContent = state.roomCode || "未加入";

  if (!state.room || !state.room.players) {
    playerRoleText.textContent = state.connected ? "已連線" : "未連線";
    playerList.innerHTML = "";
    leaveRoomButton.disabled = !state.roomCode;
    startMatchButton.disabled = true;
    return;
  }

  const me = state.room.players.find((player) => player.id === state.clientId);
  playerRoleText.textContent = me ? (me.isHost ? "房主" : "房客") : "觀察中";

  playerList.innerHTML = "";
  state.room.players.forEach((player) => {
    playerList.appendChild(createPlayerCard(player, player.id === state.clientId));
  });

  const canStart = Boolean(me && me.isHost && state.room.players.length === 2 && state.room.matchState !== "running");
  startMatchButton.disabled = !canStart;
  leaveRoomButton.disabled = !state.roomCode;
}

function formatTime(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

function updateHud() {
  if (!state.game || !state.room) {
    timerEl.textContent = "05:00";
    localScoreEl.textContent = "0";
    localHealthEl.textContent = "100";
    matchStateEl.textContent = state.roomCode ? "等待房主開始" : "等待玩家";
    return;
  }

  const me = state.game.players.find((player) => player.id === state.clientId);
  timerEl.textContent = formatTime(state.game.timeLeft);
  localScoreEl.textContent = me ? String(me.score) : "0";
  localHealthEl.textContent = me ? String(Math.max(0, Math.ceil(me.health))) : "0";
  matchStateEl.textContent = state.room.matchState === "running" ? "進行中" : "等待開始";
}

function handleRoomState(payload) {
  state.roomCode = payload.roomCode;
  state.room = payload.room;
  renderRoomInfo();
  updateHud();
}

function handleGameState(payload) {
  const previous = state.game;
  state.game = payload;

  if (previous && previous.eventId !== payload.eventId) {
    const newEvents = payload.events.slice(previous.events.length);
    newEvents.forEach((event) => {
      if (event.type === "hit") {
        burst(event.x, event.y, event.color);
      }
      if (event.type === "kill") {
        setStatus(`${event.attackerName} 擊倒了 ${event.targetName}`);
      }
      if (event.type === "round_started") {
        setStatus("對戰開始，5 分鐘倒數啟動。");
      }
      if (event.type === "round_ended") {
        setStatus(event.message);
      }
    });
  }

  updateHud();
  renderRoomInfo();

  if (!state.room) {
    showOverlay("Lobby", "建立房間後開始多人對戰", "房主建立房間後分享房號，另一位玩家加入後就能開始對戰。");
    return;
  }

  if (state.room.matchState === "running") {
    hideOverlay();
  } else if (state.room.players.length < 2) {
    showOverlay("Waiting", "等待另一位玩家加入", `分享房號 ${state.roomCode}，兩位玩家到齊後由房主開始遊戲。`);
  } else {
    showOverlay("Ready", "房主可以開始對戰", "兩位玩家都已進房，按下「房主開始對戰」即可開打。");
  }
}

function burst(x, y, color) {
  for (let index = 0; index < 10; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 30 + Math.random() * 140;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.3 + Math.random() * 0.4,
      maxLife: 0.7,
      color,
      size: 2 + Math.random() * 3,
    });
  }
}

function updateParticles(dt) {
  state.particles = state.particles.filter((particle) => {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.life -= dt;
    return particle.life > 0;
  });
}

function drawArena() {
  ctx.clearRect(0, 0, ARENA.width, ARENA.height);
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  for (let x = 0; x <= ARENA.width; x += 48) {
    ctx.fillRect(x, 0, 1, ARENA.height);
  }
  for (let y = 0; y <= ARENA.height; y += 48) {
    ctx.fillRect(0, y, ARENA.width, 1);
  }
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "rgba(10, 18, 26, 0.92)";
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.lineWidth = 2;
  roundRect(ctx, ARENA.obstacle.x, ARENA.obstacle.y, ARENA.obstacle.width, ARENA.obstacle.height, 16);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawPlayers() {
  if (!state.game) {
    return;
  }

  state.game.players.forEach((player) => {
    if (!player.alive) {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.radius + 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = player.id === state.clientId ? "#c9fff0" : "#ffd2d2";
    ctx.fillRect(6, -5, player.radius + 14, 10);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.fillRect(player.x - 26, player.y - player.radius - 20, 52, 6);
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x - 26, player.y - player.radius - 20, 52 * (player.health / 100), 6);
    ctx.fillStyle = "#edf4ff";
    ctx.font = "bold 12px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText(player.name, player.x, player.y + player.radius + 18);
    ctx.restore();
  });
}

function drawBullets() {
  if (!state.game) {
    return;
  }

  state.game.bullets.forEach((bullet) => {
    ctx.save();
    ctx.fillStyle = bullet.color;
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

function drawCrosshair() {
  if (!state.game || state.room?.matchState !== "running") {
    return;
  }

  const me = state.game.players.find((player) => player.id === state.clientId);
  if (!me || !me.alive) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(inputState.aimX, inputState.aimY, 12, 0, Math.PI * 2);
  ctx.moveTo(inputState.aimX - 18, inputState.aimY);
  ctx.lineTo(inputState.aimX - 6, inputState.aimY);
  ctx.moveTo(inputState.aimX + 6, inputState.aimY);
  ctx.lineTo(inputState.aimX + 18, inputState.aimY);
  ctx.moveTo(inputState.aimX, inputState.aimY - 18);
  ctx.lineTo(inputState.aimX, inputState.aimY - 6);
  ctx.moveTo(inputState.aimX, inputState.aimY + 6);
  ctx.lineTo(inputState.aimX, inputState.aimY + 18);
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
  drawBullets();
  drawPlayers();
  drawParticles();
  drawCrosshair();
}

let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.032);
  lastFrame = now;
  updateParticles(dt);
  render();
  requestAnimationFrame(frame);
}

function sendInput() {
  send("input", {
    up: inputState.up,
    down: inputState.down,
    left: inputState.left,
    right: inputState.right,
    shooting: inputState.shooting,
    aimX: inputState.aimX,
    aimY: inputState.aimY,
  });
}

function setMovement(code, pressed) {
  if (code === "KeyW") inputState.up = pressed;
  if (code === "KeyS") inputState.down = pressed;
  if (code === "KeyA") inputState.left = pressed;
  if (code === "KeyD") inputState.right = pressed;
}

socket.addEventListener("open", () => {
  state.connected = true;
  setStatus("已連上伺服器，現在可以建立房間或加入房間。");
});

socket.addEventListener("close", () => {
  state.connected = false;
  showOverlay("Offline", "連線中斷", "伺服器連線已斷開，請重新整理頁面。");
  setStatus("伺服器連線已斷開。");
});

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);

  if (message.type === "welcome") {
    state.clientId = message.payload.clientId;
    return;
  }

  if (message.type === "room_state") {
    handleRoomState(message.payload);
    return;
  }

  if (message.type === "game_state") {
    handleGameState(message.payload);
    return;
  }

  if (message.type === "left_room") {
    state.room = null;
    state.roomCode = "";
    state.game = null;
    renderRoomInfo();
    updateHud();
    showOverlay("Lobby", "建立房間後開始多人對戰", "房主建立房間後分享房號，另一位玩家加入後就能開始對戰。");
    setStatus("已離開房間。");
    return;
  }

  if (message.type === "error" || message.type === "info") {
    setStatus(message.payload.message);
  }
});

createRoomButton.addEventListener("click", () => {
  send("create_room", { name: getPlayerName() });
});

joinRoomButton.addEventListener("click", () => {
  send("join_room", {
    roomCode: roomCodeInput.value.trim().toUpperCase(),
    name: getPlayerName(),
  });
});

leaveRoomButton.addEventListener("click", () => {
  send("leave_room");
});

startMatchButton.addEventListener("click", () => {
  send("start_match");
});

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  inputState.aimX = ((event.clientX - rect.left) / rect.width) * ARENA.width;
  inputState.aimY = ((event.clientY - rect.top) / rect.height) * ARENA.height;
  sendInput();
});

canvas.addEventListener("mousedown", (event) => {
  if (event.button !== 0) {
    return;
  }
  inputState.shooting = true;
  sendInput();
});

window.addEventListener("mouseup", () => {
  inputState.shooting = false;
  sendInput();
});

window.addEventListener("keydown", (event) => {
  setMovement(event.code, true);
  if (event.code === "Space") {
    event.preventDefault();
    inputState.shooting = true;
  }
  sendInput();
});

window.addEventListener("keyup", (event) => {
  setMovement(event.code, false);
  if (event.code === "Space") {
    inputState.shooting = false;
  }
  sendInput();
});

showOverlay("Lobby", "建立房間後開始多人對戰", "房主建立房間後分享房號，另一位玩家加入後就能開始對戰。");
updateHud();
renderRoomInfo();
requestAnimationFrame(frame);
