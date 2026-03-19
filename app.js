const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const createRoomButton = document.getElementById("createRoomButton");
const soloMatchButton = document.getElementById("soloMatchButton");
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

const ARENA = {
  width: canvas.width,
  height: canvas.height,
  obstacle: { x: 390, y: 200, width: 180, height: 140 },
};

const ROUND_DURATION_MS = 5 * 60 * 1000;
const RESPAWN_DELAY_MS = 1200;
const SNAPSHOT_INTERVAL_MS = 66;
const ROOM_PREFIX = "room:";
const SOLO_ROOM_CODE = "SOLO";
const SOLO_BOT_ID = "solo-bot";
const DEBUG_ENABLED = new URLSearchParams(window.location.search).get("debug") === "1";

const pointer = { x: ARENA.width / 2, y: ARENA.height / 2 };
const localInput = {
  up: false,
  down: false,
  left: false,
  right: false,
  shooting: false,
  aimX: ARENA.width / 2,
  aimY: ARENA.height / 2,
};

const state = {
  clientId: getStoredPlayerId(),
  playerName: "",
  roomCode: "",
  isHost: false,
  roomJoined: false,
  mode: "online",
  ably: null,
  channel: null,
  presenceMembers: [],
  hostInputs: {},
  hostGame: null,
  renderGame: null,
  matchState: "lobby",
  lastFrameAt: performance.now(),
  lastSnapshotAt: 0,
  particles: [],
};

function getStoredPlayerId() {
  const existing = sessionStorage.getItem("arena-player-id");
  if (existing) {
    return existing;
  }

  const nextId = `player-${Math.random().toString(36).slice(2, 10)}`;
  sessionStorage.setItem("arena-player-id", nextId);
  return nextId;
}

function setStatus(text) {
  statusTextEl.textContent = text;
}

function debugLog(...args) {
  if (!DEBUG_ENABLED) {
    return;
  }

  console.log("[arena-debug]", ...args);
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
  const value = playerNameInput.value.trim();
  return value || `Player-${Math.floor(100 + Math.random() * 900)}`;
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let roomCode = "";

  for (let index = 0; index < 6; index += 1) {
    roomCode += chars[Math.floor(Math.random() * chars.length)];
  }

  return roomCode;
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

function moveWithCollision(player, nextX, nextY) {
  const margin = player.radius;
  const targetX = clamp(nextX, margin, ARENA.width - margin);
  const targetY = clamp(nextY, margin, ARENA.height - margin);

  if (!isInsideObstacle(targetX, targetY, player.radius)) {
    player.x = targetX;
    player.y = targetY;
    return;
  }

  if (!isInsideObstacle(targetX, player.y, player.radius)) {
    player.x = targetX;
  }

  if (!isInsideObstacle(player.x, targetY, player.radius)) {
    player.y = targetY;
  }
}

function createPlayerEntity(meta, slotIndex) {
  return {
    id: meta.clientId,
    name: meta.data?.name || meta.clientId,
    isHost: Boolean(meta.data?.isHost),
    isBot: Boolean(meta.data?.isBot),
    x: slotIndex === 0 ? 140 : ARENA.width - 140,
    y: ARENA.height / 2,
    angle: slotIndex === 0 ? 0 : Math.PI,
    radius: 18,
    speed: 245,
    bulletSpeed: 520,
    bulletDamage: 24,
    fireRate: 0.22,
    health: 100,
    score: 0,
    alive: true,
    respawnAt: 0,
    lastShotAt: 0,
    color: slotIndex === 0 ? "#3dd9b1" : "#ff6b6b",
  };
}

function createSoloRoster() {
  return [
    {
      clientId: state.clientId,
      data: {
        name: state.playerName,
        isHost: true,
        isBot: false,
      },
    },
    {
      clientId: SOLO_BOT_ID,
      data: {
        name: "Training Bot",
        isHost: false,
        isBot: true,
      },
    },
  ];
}

function buildRoster() {
  const unique = new Map();
  state.presenceMembers.forEach((member) => {
    unique.set(member.clientId, member);
  });

  return [...unique.values()].sort((left, right) => {
    const leftHost = left.data?.isHost ? 0 : 1;
    const rightHost = right.data?.isHost ? 0 : 1;
    if (leftHost !== rightHost) {
      return leftHost - rightHost;
    }
    return left.clientId.localeCompare(right.clientId);
  });
}

function initializeMatch(startedAt = Date.now()) {
  const roster = buildRoster();
  const players = roster.slice(0, 2).map((member, index) => createPlayerEntity(member, index));

  state.hostGame = {
    running: true,
    startedAt,
    timeLeft: ROUND_DURATION_MS,
    bullets: [],
    players,
    statusText: "Battle started. Reach the highest kill count before the timer ends.",
    resultText: "",
    resultTag: "",
  };

  players.forEach((player) => {
    if (!state.hostInputs[player.id]) {
      state.hostInputs[player.id] = createEmptyInput();
    }
  });

  state.renderGame = serializeGame(state.hostGame);
  state.matchState = "running";
  setStatus("對戰開始，5 分鐘倒數啟動。");
  hideOverlay();
}

function initializeSoloMatch() {
  state.playerName = getPlayerName();
  state.mode = "solo";
  state.isHost = true;
  state.roomJoined = true;
  state.roomCode = SOLO_ROOM_CODE;
  state.presenceMembers = createSoloRoster();
  state.hostInputs = {};
  initializeMatch(Date.now());
  updateHud();
  hideOverlay();
  setStatus("單機模式已開始，你將對戰本地 AI。");
  debugLog("solo match initialized", { playerId: state.clientId, roomCode: state.roomCode });
}

function createEmptyInput() {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    shooting: false,
    aimX: ARENA.width / 2,
    aimY: ARENA.height / 2,
  };
}

function serializeGame(game) {
  return {
    timeLeft: game.timeLeft,
    players: game.players.map((player) => ({
      id: player.id,
      name: player.name,
      isHost: player.isHost,
      x: player.x,
      y: player.y,
      angle: player.angle,
      radius: player.radius,
      health: player.health,
      score: player.score,
      alive: player.alive,
      color: player.color,
    })),
    bullets: game.bullets.map((bullet) => ({
      x: bullet.x,
      y: bullet.y,
      radius: bullet.radius,
      color: bullet.color,
    })),
    statusText: game.statusText,
    resultText: game.resultText,
    resultTag: game.resultTag,
  };
}

function resetLobbyView() {
  state.matchState = "waiting";
  state.hostGame = null;
  state.renderGame = null;
  updateHud();

  if (state.presenceMembers.length < 2) {
    showOverlay("Waiting", "等待另一位玩家加入", `分享房號 ${state.roomCode}，等朋友進房後就能開始。`);
  } else if (state.isHost) {
    showOverlay("Ready", "兩位玩家已到齊", "按下「房主開始對戰」後就會立刻開始 5 分鐘對戰。");
  } else {
    showOverlay("Ready", "等待房主開始", "你已經加入房間，等房主按下開始即可進入對戰。");
  }
}

function updateHud() {
  roomCodeText.textContent = state.roomCode || "未加入";
  playerRoleText.textContent = !state.roomJoined ? "未連線" : state.mode === "solo" ? "單機玩家" : state.isHost ? "房主" : "房客";
  matchStateEl.textContent = state.matchState === "running" ? "進行中" : state.roomJoined ? "等待開始" : "等待玩家";

  if (!state.renderGame) {
    timerEl.textContent = "05:00";
    localScoreEl.textContent = "0";
    localHealthEl.textContent = "100";
  } else {
    const me = state.renderGame.players.find((player) => player.id === state.clientId);
    timerEl.textContent = formatTime(state.renderGame.timeLeft);
    localScoreEl.textContent = me ? String(me.score) : "0";
    localHealthEl.textContent = me ? String(Math.max(0, Math.ceil(me.health))) : "0";
  }

  renderPlayerList();
  const canStart = state.mode === "online" && state.isHost && state.presenceMembers.length === 2 && state.matchState !== "running";
  startMatchButton.disabled = !canStart;
  leaveRoomButton.disabled = !state.roomJoined;
}

function renderPlayerList() {
  playerList.innerHTML = "";

  if (!state.presenceMembers.length) {
    const empty = document.createElement("div");
    empty.className = "player-chip";
    empty.textContent = "尚無玩家";
    playerList.appendChild(empty);
    return;
  }

  const playersById = new Map();
  if (state.renderGame) {
    state.renderGame.players.forEach((player) => playersById.set(player.id, player));
  }

  buildRoster().forEach((member) => {
    const div = document.createElement("div");
    div.className = "player-chip";

    const left = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = `${member.data?.name || member.clientId}${member.clientId === state.clientId ? " (你)" : ""}`;
    const meta = document.createElement("span");
    const gamePlayer = playersById.get(member.clientId);
    const roleText = member.data?.isBot ? "AI" : member.data?.isHost ? "房主" : "玩家";
    const scoreText = gamePlayer ? gamePlayer.score : 0;
    const healthText = gamePlayer ? Math.max(0, Math.ceil(gamePlayer.health)) : 100;
    meta.textContent = `${roleText} | Kills ${scoreText} | HP ${healthText}`;
    left.append(name, meta);

    const right = document.createElement("span");
    right.textContent = gamePlayer ? (gamePlayer.alive ? "在線" : "重生中") : "已加入";

    div.append(left, right);
    playerList.appendChild(div);
  });
}

async function ensureAbly() {
  if (state.ably) {
    return state.ably;
  }

  const authUrl = `/api/ably-auth?clientId=${encodeURIComponent(state.clientId)}`;
  const realtime = new Ably.Realtime({
    clientId: state.clientId,
    authUrl,
  });

  state.ably = realtime;

  if (realtime.connection.state === "connected") {
    return realtime;
  }

  await new Promise((resolve, reject) => {
    realtime.connection.once("connected", () => {
      resolve();
    });

    realtime.connection.once("failed", (change) => {
      reject(new Error(change.reason?.message || "Ably connection failed"));
    });
  });

  return realtime;
}

async function leaveCurrentRoom(notify = true) {
  if (!state.channel) {
    state.roomCode = "";
    state.roomJoined = false;
    state.mode = "online";
    state.presenceMembers = [];
    state.hostInputs = {};
    state.renderGame = null;
    state.hostGame = null;
    state.matchState = "lobby";
    updateHud();
    return;
  }

  try {
    if (notify) {
      await state.channel.publish("system", {
        type: "leave_notice",
        playerId: state.clientId,
        playerName: state.playerName,
      });
    }
    await state.channel.presence.leave();
    await state.channel.unsubscribe();
    await state.channel.detach();
  } catch (error) {
    console.error(error);
  }

  state.channel = null;
  state.roomCode = "";
  state.roomJoined = false;
  state.mode = "online";
  state.presenceMembers = [];
  state.hostInputs = {};
  state.renderGame = null;
  state.hostGame = null;
  state.matchState = "lobby";
  updateHud();
  showOverlay("Lobby", "建立房間後開始多人對戰", "Vercel 版使用 Ably Realtime 傳遞房間、輸入與對戰狀態。");
}

async function joinRoom(options) {
  const roomCode = options.roomCode.toUpperCase();
  state.playerName = getPlayerName();
  state.isHost = Boolean(options.isHost);
  state.mode = "online";

  try {
    await ensureAbly();
    await leaveCurrentRoom(false);

    state.roomCode = roomCode;
    state.channel = state.ably.channels.get(`${ROOM_PREFIX}${roomCode}`);

    await state.channel.attach();
    await state.channel.subscribe((message) => {
      handleChannelMessage(message);
    });
    await state.channel.presence.subscribe(() => {
      refreshPresence().catch((error) => console.error(error));
    });

    await state.channel.presence.enter({
      name: state.playerName,
      isHost: state.isHost,
    });

    state.roomJoined = true;
    await refreshPresence();
    debugLog("joined room", {
      roomCode,
      isHost: state.isHost,
      clientId: state.clientId,
      members: state.presenceMembers.map((member) => ({
        clientId: member.clientId,
        isHost: member.data?.isHost,
        name: member.data?.name,
      })),
    });

    if (state.presenceMembers.length > 2) {
      setStatus("這個房間已滿，請使用其他房號。");
      await leaveCurrentRoom(false);
      return;
    }

    updateHud();
    resetLobbyView();
    setStatus(`已加入房間 ${roomCode}。`);
  } catch (error) {
    console.error(error);
    setStatus("連線房間失敗，請確認 Vercel 環境變數與網路連線。");
  }
}

async function refreshPresence() {
  if (!state.channel) {
    return;
  }

  const members = await state.channel.presence.get();
  state.presenceMembers = members;
  debugLog("presence refreshed", members.map((member) => ({
    clientId: member.clientId,
    isHost: member.data?.isHost,
    name: member.data?.name,
  })));
  updateHud();
  handlePresenceSideEffects();
}

function handlePresenceSideEffects() {
  if (!state.roomJoined) {
    return;
  }

  if (state.presenceMembers.length < 2 && state.matchState !== "running") {
    resetLobbyView();
    return;
  }

  if (state.matchState !== "running") {
    if (state.presenceMembers.length >= 2) {
      if (state.isHost) {
        showOverlay("Ready", "兩位玩家已到齊", "按下「房主開始對戰」後就會開始 5 分鐘對戰。");
      } else {
        showOverlay("Ready", "等待房主開始", "房主開始後你就會立即進入戰場。");
      }
    }
  }

  if (state.matchState === "running" && state.presenceMembers.length < 2) {
    state.matchState = "waiting";
    if (state.isHost) {
      if (state.hostGame) {
        state.hostGame.running = false;
        state.hostGame.resultTag = "Interrupted";
        state.hostGame.resultText = "另一位玩家已離開房間，對戰已中止。";
        publishSystemState("match_ended", {
          resultTag: state.hostGame.resultTag,
          resultText: state.hostGame.resultText,
          state: serializeGame(state.hostGame),
        });
      }
    }
    showOverlay("Waiting", "另一位玩家已離開", "請等待朋友重新加入，或換一個房號重新開始。");
    setStatus("房間人數不足，對戰已停止。");
  }
}

function publishSystemState(type, payload) {
  if (!state.channel) {
    return;
  }

  state.channel.publish("system", { type, ...payload }).catch((error) => {
    console.error(error);
  });
}

function publishInput() {
  if (!state.roomJoined || !state.playerName) {
    return;
  }

  if (state.isHost) {
    state.hostInputs[state.clientId] = { ...localInput };
    debugLog("host local input updated", { playerId: state.clientId, input: { ...localInput } });
    return;
  }

  if (!state.channel) {
    return;
  }

  state.channel.publish("input", {
    playerId: state.clientId,
    input: { ...localInput },
  }).catch((error) => {
    console.error(error);
  });
  debugLog("guest input published", { playerId: state.clientId, input: { ...localInput } });
}

function handleChannelMessage(message) {
  debugLog("message received", { name: message.name, data: message.data });

  if (message.name === "input" && state.isHost && state.hostGame) {
    state.hostInputs[message.data.playerId] = { ...createEmptyInput(), ...message.data.input };
    debugLog("host received guest input", {
      playerId: message.data.playerId,
      input: state.hostInputs[message.data.playerId],
    });
    return;
  }

  if (message.name === "state" && !state.isHost) {
    state.renderGame = message.data.state;
    state.matchState = message.data.matchState;
    updateHud();

    if (message.data.matchState === "running") {
      hideOverlay();
      setStatus(message.data.state.statusText);
    }

    if (message.data.matchState === "ended") {
      showOverlay(message.data.state.resultTag, "對戰結束", message.data.state.resultText);
      setStatus(message.data.state.resultText);
    }

    return;
  }

  if (message.name !== "system") {
    return;
  }

  const payload = message.data;

  if (payload.type === "presence_sync") {
    refreshPresence().catch((error) => console.error(error));
    return;
  }

  if (payload.type === "match_started") {
    state.matchState = "running";
    if (!state.isHost) {
      state.renderGame = payload.state;
    }
    hideOverlay();
    setStatus("對戰開始，5 分鐘倒數啟動。");
    updateHud();
    return;
  }

  if (payload.type === "match_ended") {
    state.matchState = "ended";
    state.renderGame = payload.state || state.renderGame;
    updateHud();
    showOverlay(payload.resultTag || "Result", "對戰結束", payload.resultText || "回合已結束。");
    setStatus(payload.resultText || "回合已結束。");
    return;
  }

  if (payload.type === "leave_notice") {
    refreshPresence().catch((error) => console.error(error));
  }
}

function spawnBullet(player) {
  const aim = pointerForPlayer(player);
  const angle = Math.atan2(aim.y - player.y, aim.x - player.x);
  player.angle = angle;

  return {
    ownerId: player.id,
    x: player.x + Math.cos(angle) * (player.radius + 10),
    y: player.y + Math.sin(angle) * (player.radius + 10),
    vx: Math.cos(angle) * player.bulletSpeed,
    vy: Math.sin(angle) * player.bulletSpeed,
    radius: 5,
    life: 1.5,
    color: player.color === "#3dd9b1" ? "#9cf4db" : "#ffd5d5",
    damage: player.bulletDamage,
  };
}

function pointerForPlayer(player) {
  if (player.id === state.clientId) {
    return { x: localInput.aimX, y: localInput.aimY };
  }

  const input = state.hostInputs[player.id] || createEmptyInput();
  return {
    x: input.aimX,
    y: input.aimY,
  };
}

function createAiInput(player, target, now) {
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const distance = Math.hypot(dx, dy) || 1;
  const strafeSeed = Math.sin(now / 420 + player.x * 0.02);
  const shouldAdvance = distance > 250;
  const shouldRetreat = distance < 140;

  return {
    up: shouldAdvance ? dy < -18 : shouldRetreat ? dy > 18 : false,
    down: shouldAdvance ? dy > 18 : shouldRetreat ? dy < -18 : false,
    left: shouldAdvance ? dx < -18 : shouldRetreat ? dx > 18 : strafeSeed < -0.2,
    right: shouldAdvance ? dx > 18 : shouldRetreat ? dx < -18 : strafeSeed > 0.2,
    shooting: distance < 430,
    aimX: target.x,
    aimY: target.y,
  };
}

function tickHostGame(now, dt) {
  if (!state.hostGame || !state.hostGame.running) {
    return;
  }

  const game = state.hostGame;
  game.timeLeft = Math.max(0, ROUND_DURATION_MS - (now - game.startedAt));

  if (game.timeLeft <= 0) {
    finishMatch();
    return;
  }

  game.players.forEach((player) => {
    let input;

    if (player.id === state.clientId) {
      input = localInput;
    } else if (state.mode === "solo" && player.isBot) {
      const target = game.players.find((candidate) => candidate.id === state.clientId) || game.players[0];
      input = createAiInput(player, target, now);
      state.hostInputs[player.id] = input;
    } else {
      input = state.hostInputs[player.id] || createEmptyInput();
    }

    if (!player.alive) {
      if (player.respawnAt > 0 && now >= player.respawnAt) {
        player.x = player.color === "#3dd9b1" ? 140 : ARENA.width - 140;
        player.y = 120 + Math.random() * (ARENA.height - 240);
        player.health = 100;
        player.alive = true;
        player.respawnAt = 0;
      }
      return;
    }

    let moveX = 0;
    let moveY = 0;
    if (input.up) moveY -= 1;
    if (input.down) moveY += 1;
    if (input.left) moveX -= 1;
    if (input.right) moveX += 1;

    if (moveX !== 0 || moveY !== 0) {
      const length = Math.hypot(moveX, moveY) || 1;
      moveX /= length;
      moveY /= length;
    }

    moveWithCollision(player, player.x + moveX * player.speed * dt, player.y + moveY * player.speed * dt);
    player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);

    if (input.shooting && now - player.lastShotAt >= player.fireRate * 1000) {
      player.lastShotAt = now;
      game.bullets.push(spawnBullet(player));
    }
  });

  if (DEBUG_ENABLED) {
    debugLog("host tick positions", game.players.map((player) => ({
      id: player.id,
      x: Number(player.x.toFixed(1)),
      y: Number(player.y.toFixed(1)),
      alive: player.alive,
    })));
  }

  game.bullets = game.bullets.filter((bullet) => {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;

    if (
      bullet.life <= 0 ||
      bullet.x < -20 ||
      bullet.x > ARENA.width + 20 ||
      bullet.y < -20 ||
      bullet.y > ARENA.height + 20 ||
      isInsideObstacle(bullet.x, bullet.y, bullet.radius)
    ) {
      return false;
    }

    const attacker = game.players.find((player) => player.id === bullet.ownerId);
    const target = game.players.find((player) => player.id !== bullet.ownerId);

    if (!attacker || !target || !target.alive) {
      return true;
    }

    const distance = Math.hypot(bullet.x - target.x, bullet.y - target.y);
    if (distance <= bullet.radius + target.radius) {
      target.health -= bullet.damage;
      emitParticles(target.x, target.y, target.color);

      if (target.health <= 0) {
        target.health = 0;
        target.alive = false;
        target.respawnAt = now + RESPAWN_DELAY_MS;
        attacker.score += 1;
        game.statusText = `${attacker.name} 擊倒了 ${target.name}`;
      }

      return false;
    }

    return true;
  });

  state.renderGame = serializeGame(game);
}

function finishMatch() {
  if (!state.hostGame) {
    return;
  }

  const [firstPlayer, secondPlayer] = state.hostGame.players;
  let resultTag = "Draw";
  let resultText = "時間到，雙方平手。";

  if (firstPlayer.score > secondPlayer.score) {
    resultTag = "Victory";
    resultText = `${firstPlayer.name} 以 ${firstPlayer.score} 比 ${secondPlayer.score} 獲勝。`;
  } else if (firstPlayer.score < secondPlayer.score) {
    resultTag = "Victory";
    resultText = `${secondPlayer.name} 以 ${secondPlayer.score} 比 ${firstPlayer.score} 獲勝。`;
  }

  state.hostGame.running = false;
  state.hostGame.timeLeft = 0;
  state.hostGame.resultTag = resultTag;
  state.hostGame.resultText = resultText;
  state.renderGame = serializeGame(state.hostGame);
  state.matchState = "ended";
  showOverlay(resultTag, "對戰結束", resultText);
  setStatus(resultText);

  publishSystemState("match_ended", {
    resultTag,
    resultText,
    state: state.renderGame,
  });
}

function emitParticles(x, y, color) {
  for (let index = 0; index < 12; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 140;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.3 + Math.random() * 0.4,
      maxLife: 0.7,
      color,
      size: 2 + Math.random() * 4,
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
  if (!state.renderGame) {
    return;
  }

  state.renderGame.players.forEach((player) => {
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
  if (!state.renderGame) {
    return;
  }

  state.renderGame.bullets.forEach((bullet) => {
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
  if (state.matchState !== "running") {
    return;
  }

  const me = state.renderGame?.players.find((player) => player.id === state.clientId);
  if (!me || !me.alive) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(localInput.aimX, localInput.aimY, 12, 0, Math.PI * 2);
  ctx.moveTo(localInput.aimX - 18, localInput.aimY);
  ctx.lineTo(localInput.aimX - 6, localInput.aimY);
  ctx.moveTo(localInput.aimX + 6, localInput.aimY);
  ctx.lineTo(localInput.aimX + 18, localInput.aimY);
  ctx.moveTo(localInput.aimX, localInput.aimY - 18);
  ctx.lineTo(localInput.aimX, localInput.aimY - 6);
  ctx.moveTo(localInput.aimX, localInput.aimY + 6);
  ctx.lineTo(localInput.aimX, localInput.aimY + 18);
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

function gameLoop(now) {
  const dt = Math.min((now - state.lastFrameAt) / 1000, 0.032);
  state.lastFrameAt = now;
  const wallNow = Date.now();

  updateParticles(dt);

  if (state.isHost && state.matchState === "running" && state.hostGame?.running) {
    tickHostGame(wallNow, dt);
    updateHud();

    if (state.channel && wallNow - state.lastSnapshotAt >= SNAPSHOT_INTERVAL_MS) {
      state.lastSnapshotAt = wallNow;
      state.channel.publish("state", {
        matchState: state.hostGame.running ? "running" : "ended",
        state: serializeGame(state.hostGame),
      }).catch((error) => console.error(error));
    }
  }

  render();
  requestAnimationFrame(gameLoop);
}

async function startMatch() {
  if (!state.isHost) {
    setStatus("只有房主能開始對戰。");
    return;
  }

  if (state.presenceMembers.length !== 2) {
    setStatus("需要兩位玩家都在房間內才能開始。");
    return;
  }

  initializeMatch(Date.now());
  updateHud();
  hideOverlay();

  publishSystemState("match_started", {
    state: serializeGame(state.hostGame),
  });
}

createRoomButton.addEventListener("click", () => {
  joinRoom({ roomCode: generateRoomCode(), isHost: true });
});

soloMatchButton.addEventListener("click", () => {
  leaveCurrentRoom(false)
    .catch((error) => console.error(error))
    .finally(() => {
      initializeSoloMatch();
    });
});

joinRoomButton.addEventListener("click", () => {
  const roomCode = roomCodeInput.value.trim().toUpperCase();
  if (!roomCode) {
    setStatus("請先輸入房號。");
    return;
  }

  joinRoom({ roomCode, isHost: false });
});

leaveRoomButton.addEventListener("click", () => {
  leaveCurrentRoom(true).catch((error) => console.error(error));
  setStatus("已離開房間。");
});

startMatchButton.addEventListener("click", () => {
  startMatch().catch((error) => console.error(error));
});

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * ARENA.width;
  pointer.y = ((event.clientY - rect.top) / rect.height) * ARENA.height;
  localInput.aimX = pointer.x;
  localInput.aimY = pointer.y;
  publishInput();
});

canvas.addEventListener("mousedown", (event) => {
  if (event.button !== 0) {
    return;
  }
  localInput.shooting = true;
  publishInput();
});

window.addEventListener("mouseup", () => {
  localInput.shooting = false;
  publishInput();
});

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyW") localInput.up = true;
  if (event.code === "KeyS") localInput.down = true;
  if (event.code === "KeyA") localInput.left = true;
  if (event.code === "KeyD") localInput.right = true;
  if (event.code === "Space") {
    event.preventDefault();
    localInput.shooting = true;
  }
  publishInput();
});

window.addEventListener("keyup", (event) => {
  if (event.code === "KeyW") localInput.up = false;
  if (event.code === "KeyS") localInput.down = false;
  if (event.code === "KeyA") localInput.left = false;
  if (event.code === "KeyD") localInput.right = false;
  if (event.code === "Space") {
    localInput.shooting = false;
  }
  publishInput();
});

showOverlay("Lobby", "建立房間或直接單機遊玩", "你可以先用單機模式對戰 AI，也可以建立房間後和朋友連線對戰。");
setStatus("請先輸入玩家名稱，然後建立房間、加入房間，或直接開始單機模式。");
updateHud();
requestAnimationFrame(gameLoop);
