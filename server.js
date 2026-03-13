const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const ROUND_DURATION_MS = 5 * 60 * 1000;
const RESPAWN_DELAY_MS = 1200;
const TICK_MS = 1000 / 60;

const ARENA = {
  width: 960,
  height: 540,
  obstacle: { x: 390, y: 200, width: 180, height: 140 },
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const sockets = new Map();
const rooms = new Map();

const server = http.createServer((req, res) => {
  const urlPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(__dirname, safePath);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(content);
  });
});

const wss = new WebSocketServer({ server });

function createId() {
  return Math.random().toString(36).slice(2, 10);
}

function createRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  while (!code || rooms.has(code)) {
    code = "";
    for (let index = 0; index < 6; index += 1) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  }

  return code;
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

function createPlayer(clientId, name, isHost, slotIndex) {
  return {
    id: clientId,
    name,
    isHost,
    slotIndex,
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
    input: {
      up: false,
      down: false,
      left: false,
      right: false,
      shooting: false,
      aimX: slotIndex === 0 ? ARENA.width : 0,
      aimY: ARENA.height / 2,
    },
  };
}

function buildRoomState(room) {
  return {
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      isHost: player.isHost,
      score: player.score,
      health: player.health,
      alive: player.alive,
    })),
    matchState: room.matchState,
  };
}

function buildGameState(room) {
  return {
    timeLeft: room.timeLeft,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      x: player.x,
      y: player.y,
      angle: player.angle,
      radius: player.radius,
      health: player.health,
      score: player.score,
      alive: player.alive,
      color: player.color,
    })),
    bullets: room.bullets.map((bullet) => ({
      x: bullet.x,
      y: bullet.y,
      radius: bullet.radius,
      color: bullet.color,
    })),
    events: room.events,
    eventId: room.eventId,
  };
}

function send(socket, type, payload) {
  if (socket.readyState !== 1) {
    return;
  }

  socket.send(JSON.stringify({ type, payload }));
}

function broadcastRoom(room) {
  const payload = { roomCode: room.code, room: buildRoomState(room) };

  room.players.forEach((player) => {
    const socket = sockets.get(player.id);
    if (socket) {
      send(socket, "room_state", payload);
    }
  });
}

function broadcastGame(room) {
  const payload = buildGameState(room);

  room.players.forEach((player) => {
    const socket = sockets.get(player.id);
    if (socket) {
      send(socket, "game_state", payload);
    }
  });
}

function addEvent(room, event) {
  room.eventId += 1;
  room.events.push({ ...event, id: room.eventId });
  if (room.events.length > 20) {
    room.events.shift();
  }
}

function resetPlayerForRound(player) {
  player.x = player.slotIndex === 0 ? 140 : ARENA.width - 140;
  player.y = ARENA.height / 2;
  player.angle = player.slotIndex === 0 ? 0 : Math.PI;
  player.health = 100;
  player.score = 0;
  player.alive = true;
  player.respawnAt = 0;
  player.lastShotAt = 0;
  player.input.shooting = false;
}

function startRound(room) {
  room.matchState = "running";
  room.startedAt = Date.now();
  room.timeLeft = ROUND_DURATION_MS;
  room.bullets = [];
  room.events = [];
  room.eventId = 0;
  room.players.forEach(resetPlayerForRound);
  addEvent(room, { type: "round_started" });
  broadcastRoom(room);
  broadcastGame(room);
}

function endRound(room) {
  room.matchState = "waiting";
  room.timeLeft = 0;

  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  let message = "時間到，雙方平手。";
  if (sorted[0] && sorted[1] && sorted[0].score !== sorted[1].score) {
    message = `${sorted[0].name} 以 ${sorted[0].score} 比 ${sorted[1].score} 獲勝。`;
  }

  addEvent(room, { type: "round_ended", message });
  broadcastRoom(room);
  broadcastGame(room);
}

function respawnPlayer(player) {
  player.x = player.slotIndex === 0 ? 140 : ARENA.width - 140;
  player.y = 120 + Math.random() * (ARENA.height - 240);
  player.health = 100;
  player.alive = true;
  player.respawnAt = 0;
}

function createBullet(player) {
  const angle = Math.atan2(player.input.aimY - player.y, player.input.aimX - player.x);
  player.angle = angle;

  return {
    ownerId: player.id,
    x: player.x + Math.cos(angle) * (player.radius + 10),
    y: player.y + Math.sin(angle) * (player.radius + 10),
    vx: Math.cos(angle) * player.bulletSpeed,
    vy: Math.sin(angle) * player.bulletSpeed,
    radius: 5,
    color: player.slotIndex === 0 ? "#9cf4db" : "#ffd5d5",
    life: 1.5,
  };
}

function handlePlayerMovement(player, dt) {
  if (!player.alive) {
    return;
  }

  let moveX = 0;
  let moveY = 0;
  if (player.input.up) moveY -= 1;
  if (player.input.down) moveY += 1;
  if (player.input.left) moveX -= 1;
  if (player.input.right) moveX += 1;

  if (moveX !== 0 || moveY !== 0) {
    const length = Math.hypot(moveX, moveY) || 1;
    moveX /= length;
    moveY /= length;
  }

  moveWithCollision(player, player.x + moveX * player.speed * dt, player.y + moveY * player.speed * dt);
  player.angle = Math.atan2(player.input.aimY - player.y, player.input.aimX - player.x);
}

function handlePlayerShooting(room, player, now) {
  if (!player.alive || !player.input.shooting) {
    return;
  }

  if (now - player.lastShotAt < player.fireRate * 1000) {
    return;
  }

  player.lastShotAt = now;
  room.bullets.push(createBullet(player));
}

function handleDamage(room, attacker, target) {
  target.health -= 24;
  addEvent(room, { type: "hit", x: target.x, y: target.y, color: target.color });

  if (target.health > 0) {
    return;
  }

  target.alive = false;
  target.health = 0;
  target.respawnAt = Date.now() + RESPAWN_DELAY_MS;
  attacker.score += 1;
  addEvent(room, {
    type: "kill",
    x: target.x,
    y: target.y,
    color: target.color,
    attackerName: attacker.name,
    targetName: target.name,
  });
}

function tickRoom(room) {
  if (room.matchState !== "running") {
    return;
  }

  const now = Date.now();
  room.timeLeft = Math.max(0, ROUND_DURATION_MS - (now - room.startedAt));

  if (room.timeLeft <= 0) {
    endRound(room);
    return;
  }

  room.players.forEach((player) => {
    if (!player.alive && player.respawnAt > 0 && now >= player.respawnAt) {
      respawnPlayer(player);
    }
  });

  room.players.forEach((player) => {
    handlePlayerMovement(player, TICK_MS / 1000);
    handlePlayerShooting(room, player, now);
  });

  room.bullets = room.bullets.filter((bullet) => {
    bullet.x += bullet.vx * (TICK_MS / 1000);
    bullet.y += bullet.vy * (TICK_MS / 1000);
    bullet.life -= TICK_MS / 1000;

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

    const attacker = room.players.find((player) => player.id === bullet.ownerId);
    const target = room.players.find((player) => player.id !== bullet.ownerId);

    if (!attacker || !target || !target.alive) {
      return true;
    }

    const distance = Math.hypot(bullet.x - target.x, bullet.y - target.y);
    if (distance <= bullet.radius + target.radius) {
      handleDamage(room, attacker, target);
      return false;
    }

    return true;
  });

  broadcastGame(room);
  broadcastRoom(room);
}

function createRoomForPlayer(clientId, name) {
  const code = createRoomCode();
  const room = {
    code,
    players: [createPlayer(clientId, name, true, 0)],
    bullets: [],
    matchState: "waiting",
    startedAt: 0,
    timeLeft: ROUND_DURATION_MS,
    events: [],
    eventId: 0,
  };

  rooms.set(code, room);
  return room;
}

function getRoomByClientId(clientId) {
  for (const room of rooms.values()) {
    if (room.players.some((player) => player.id === clientId)) {
      return room;
    }
  }
  return null;
}

function leaveRoom(clientId) {
  const room = getRoomByClientId(clientId);
  if (!room) {
    return;
  }

  room.players = room.players.filter((player) => player.id !== clientId);

  if (room.players.length === 0) {
    rooms.delete(room.code);
    return;
  }

  room.players[0].isHost = true;
  room.players[0].slotIndex = 0;
  if (room.players[1]) {
    room.players[1].slotIndex = 1;
  }

  room.matchState = "waiting";
  room.bullets = [];
  room.timeLeft = ROUND_DURATION_MS;
  addEvent(room, { type: "round_ended", message: "有玩家離開房間，對戰已停止。" });
  broadcastRoom(room);
  broadcastGame(room);
}

wss.on("connection", (socket) => {
  const clientId = createId();
  sockets.set(clientId, socket);
  send(socket, "welcome", { clientId });

  socket.on("message", (raw) => {
    let message;

    try {
      message = JSON.parse(raw.toString());
    } catch (error) {
      send(socket, "error", { message: "訊息格式錯誤。" });
      return;
    }

    const { type, payload } = message;
    const room = getRoomByClientId(clientId);

    if (type === "create_room") {
      if (room) {
        send(socket, "error", { message: "你已經在房間裡了。" });
        return;
      }

      const nextRoom = createRoomForPlayer(clientId, payload.name || "Player");
      broadcastRoom(nextRoom);
      broadcastGame(nextRoom);
      send(socket, "info", { message: `房間已建立，房號 ${nextRoom.code}` });
      return;
    }

    if (type === "join_room") {
      if (room) {
        send(socket, "error", { message: "請先離開目前房間再加入新房間。" });
        return;
      }

      const targetRoom = rooms.get((payload.roomCode || "").toUpperCase());
      if (!targetRoom) {
        send(socket, "error", { message: "找不到這個房間。" });
        return;
      }

      if (targetRoom.players.length >= 2) {
        send(socket, "error", { message: "房間已滿。" });
        return;
      }

      targetRoom.players.push(createPlayer(clientId, payload.name || "Player", false, 1));
      broadcastRoom(targetRoom);
      broadcastGame(targetRoom);
      return;
    }

    if (type === "leave_room") {
      leaveRoom(clientId);
      send(socket, "left_room", {});
      return;
    }

    if (!room) {
      send(socket, "error", { message: "你尚未加入房間。" });
      return;
    }

    if (type === "start_match") {
      const me = room.players.find((player) => player.id === clientId);
      if (!me || !me.isHost) {
        send(socket, "error", { message: "只有房主能開始遊戲。" });
        return;
      }

      if (room.players.length !== 2) {
        send(socket, "error", { message: "需要兩位玩家才能開始。" });
        return;
      }

      startRound(room);
      return;
    }

    if (type === "input") {
      const me = room.players.find((player) => player.id === clientId);
      if (!me) {
        return;
      }

      me.input.up = Boolean(payload.up);
      me.input.down = Boolean(payload.down);
      me.input.left = Boolean(payload.left);
      me.input.right = Boolean(payload.right);
      me.input.shooting = Boolean(payload.shooting);
      me.input.aimX = clamp(Number(payload.aimX) || me.x, 0, ARENA.width);
      me.input.aimY = clamp(Number(payload.aimY) || me.y, 0, ARENA.height);
    }
  });

  socket.on("close", () => {
    leaveRoom(clientId);
    sockets.delete(clientId);
  });
});

setInterval(() => {
  rooms.forEach((room) => tickRoom(room));
}, TICK_MS);

server.listen(PORT, () => {
  console.log(`Arena Duel Online server running at http://localhost:${PORT}`);
});
