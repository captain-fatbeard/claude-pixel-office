// --- Canvas setup ---
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const status = document.getElementById("status");

const W = canvas.width;
const H = canvas.height;

// --- Fireworks ---

const fireworkParticles = [];
const fireworkColors = ["#ff4444", "#ffcc00", "#44ff44", "#4488ff", "#ff44ff", "#ff8844", "#44ffff"];
const activeFireworks = new Set(); // track which sessions already fired

function spawnFireworks(x, y) {
  const count = 40 + Math.floor(Math.random() * 20);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 4;
    fireworkParticles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 60 + Math.floor(Math.random() * 40),
      color: fireworkColors[Math.floor(Math.random() * fireworkColors.length)],
      size: 2 + Math.random() * 3,
    });
  }
}

function updateAndDrawFireworks() {
  for (let i = fireworkParticles.length - 1; i >= 0; i--) {
    const p = fireworkParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.06; // gravity
    p.life--;
    p.size *= 0.98;

    if (p.life <= 0) {
      fireworkParticles.splice(i, 1);
      continue;
    }

    const alpha = Math.min(1, p.life / 30);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);

    // Sparkle trail
    if (Math.random() > 0.5) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(p.x - p.vx * 0.5, p.y - p.vy * 0.5, p.size * 0.5, p.size * 0.5);
    }
  }
  ctx.globalAlpha = 1;
}

// --- Colors (Copenhagen apartment / modern agency) ---
const COLORS = {
  floor: "#c8a882",       // warm oak herringbone
  floorLight: "#d4b890",  // lighter plank
  floorDark: "#b89870",   // darker plank
  wall: "#f2ede8",        // off-white plaster walls
  wallTrim: "#e0d8d0",    // subtle trim
  wallAccent: "#e8e2da",  // wainscoting
  ceiling: "#f8f5f0",     // bright ceiling line
  desk: "#2a2a2a",        // dark modern desk
  deskTop: "#333",        // desk surface
  deskLeg: "#222",        // slim metal legs
  monitor: "#1a1a1a",     // sleek monitor
  monitorScreen: "#2a2a2a",
  monitorScreenActive: "#e8f0ff",
  chair: "#333",
  chairSeat: "#444",
  plant: "#5a9a5a",
  plantDark: "#3a7a3a",
  pot: "#f0e6d8",         // ceramic white pot
  potRim: "#e0d6c8",
  window: "#b8d0e8",      // pale sky
  windowFrame: "#f0ece6", // white frame
  windowMullion: "#e0dcd4",
  windowLight: "#d0e4f4", // sky highlight
  carpet1: "#8a6a5a",     // warm terracotta rug
  carpet2: "#6a7a6a",     // sage green rug
  carpet3: "#7a7088",     // muted purple rug
};

// --- Appearance ---

const SKIN_TONES = ["#f5c6a0", "#e8a87c", "#c68642", "#8d5524", "#6b3a2a"];
const SHIRT_COLORS = ["#7c83ff", "#ff6b8a", "#4acfac", "#ffb347", "#c084fc", "#ff5757", "#5ce1e6"];
const HAIR_COLORS = ["#2a1a0a", "#5a3a1a", "#c4a35a", "#8a2a1a", "#1a1a2a", "#e8e0d0"];

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function agentAppearance(sessionId) {
  const h = hashStr(sessionId);
  return {
    skin: SKIN_TONES[h % SKIN_TONES.length],
    shirt: SHIRT_COLORS[(h >> 4) % SHIRT_COLORS.length],
    hair: HAIR_COLORS[(h >> 8) % HAIR_COLORS.length],
  };
}

// --- Agent movement state ---
// Each agent gets a sprite with position, target, and facing direction

const sprites = {}; // keyed by sessionId
let initialLoad = true;

function getSprite(agent, deskIdx) {
  if (!sprites[agent.sessionId]) {
    const ws = WORKSTATIONS[deskIdx];
    const seatX = ws.x + 22;
    const seatY = ws.y - 2;

    if (initialLoad) {
      // Already here — place directly at desk
      sprites[agent.sessionId] = {
        x: seatX,
        y: seatY,
        targetX: seatX,
        targetY: seatY,
        deskIdx: deskIdx,
        facing: 1,
        state: agent.activity !== "idle" ? "sitting" : "standing",
        walkFrame: 0,
        settled: true,
      };
    } else {
      // New agent mid-session — walk in from the right
      sprites[agent.sessionId] = {
        x: W + 20,
        y: seatY,
        targetX: seatX,
        targetY: seatY,
        deskIdx: deskIdx,
        facing: 1,
        state: "walking",
        walkFrame: 0,
        settled: false,
      };
    }
  }

  const sp = sprites[agent.sessionId];
  const ws = WORKSTATIONS[deskIdx];

  // Chair position is where the character sits (in world coords, accounting for scale)
  const seatX = ws.x + 22 * AGENT_SCALE;
  const seatY = ws.y - 2 * AGENT_SCALE;

  // If activity changed or desk changed, update target
  if (agent.activity === "idle") {
    // Track when idle started
    if (!sp.idleSince) {
      sp.idleSince = Date.now();
    }

    const idleFor = Date.now() - sp.idleSince;

    if (idleFor >= 5 * 60 * 1000 && sp.settled && !sp.atCoffee && !sp.coffeeTrip) {
      // Idle for 5 minutes — walk to coffee machine
      const offsetX = (deskIdx % 3) * 14 - 14;
      sp.targetX = COFFEE_MACHINE.x + offsetX;
      sp.targetY = COFFEE_MACHINE.y + 60;
      sp.state = "walking";
      sp.settled = false;
      sp.coffeeTrip = true;
    } else if (sp.coffeeTrip && sp.atCoffee && sp.settled && !sp.returnTimer) {
      // At coffee machine — hang out for a bit then walk back
      sp.returnTimer = Date.now() + 4000;
    } else if (sp.coffeeTrip && sp.returnTimer && Date.now() > sp.returnTimer) {
      // Head back to desk
      sp.targetX = seatX;
      sp.targetY = seatY;
      sp.state = "walking";
      sp.settled = false;
      sp.returnTimer = null;
      sp.atCoffee = false;
      sp.coffeeTrip = false;
    } else if (sp.coffeeTrip && sp.settled && !sp.atCoffee) {
      // Back at desk after coffee
      sp.coffeeTrip = false;
    }

    // Mark as at coffee when arrived at machine
    if (sp.coffeeTrip && sp.settled && !sp.returnTimer) {
      sp.atCoffee = true;
    }
  } else {
    // Working — go sit at desk
    sp.targetX = seatX;
    sp.targetY = seatY;
    sp.idleSince = null;
    sp.coffeeTimer = null;
    sp.coffeeTrip = false;
    sp.atCoffee = false;
    sp.returnTimer = null;
  }

  // First time: assign desk and walk there
  if (sp.deskIdx !== deskIdx) {
    sp.deskIdx = deskIdx;
    sp.targetX = seatX;
    sp.targetY = seatY;
    sp.settled = false;
  }

  return sp;
}

function updateSprite(sp, agent) {
  const dx = sp.targetX - sp.x;
  const dy = sp.targetY - sp.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 2) {
    // Move toward target
    const speed = 1.5;
    sp.x += (dx / dist) * speed;
    sp.y += (dy / dist) * speed;
    sp.state = "walking";
    sp.facing = dx > 0 ? 1 : dx < 0 ? -1 : sp.facing;
    sp.walkFrame = (sp.walkFrame + 0.15) % 4;
    sp.settled = false;
  } else {
    // Arrived
    sp.x = sp.targetX;
    sp.y = sp.targetY;
    if (agent.activity !== "idle") {
      sp.state = "sitting";
    } else {
      sp.state = "standing";
    }
    sp.settled = true;
    sp.walkFrame = 0;
  }
}

// --- Office furniture ---

function drawDesk(x, y) {
  // Modern slim desk - white oak top, thin metal legs
  ctx.fillStyle = "#e8ddd0";
  ctx.fillRect(x, y, 64, 4);
  ctx.fillStyle = "#ddd2c4";
  ctx.fillRect(x, y + 4, 64, 2);
  // Thin black metal legs
  ctx.fillStyle = COLORS.deskLeg;
  ctx.fillRect(x + 4, y + 6, 2, 20);
  ctx.fillRect(x + 58, y + 6, 2, 20);
  // Cross bar
  ctx.fillRect(x + 4, y + 18, 56, 1);
}

function drawMonitor(x, y, active) {
  // Slim modern monitor
  ctx.fillStyle = COLORS.monitor;
  ctx.fillRect(x, y, 28, 20);
  // Screen
  ctx.fillStyle = active ? COLORS.monitorScreenActive : COLORS.monitorScreen;
  ctx.fillRect(x + 1, y + 1, 26, 18);
  // Stand
  ctx.fillStyle = "#ccc";
  ctx.fillRect(x + 11, y + 20, 6, 3);
  ctx.fillRect(x + 8, y + 23, 12, 1);

  if (active) {
    // Code lines on screen
    ctx.fillStyle = "#6a8acc";
    for (let i = 0; i < 5; i++) {
      const lineW = 4 + ((i * 7) % 16);
      ctx.fillRect(x + 3, y + 3 + i * 3, lineW, 1);
    }
    // Cursor blink
    if (Math.floor(Date.now() / 500) % 2 === 0) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(x + 3 + ((Date.now() / 200) % 14), y + 3 + 12, 2, 2);
    }
  }
}

function drawChair(x, y) {
  // Modern office chair - dark with colored cushion
  ctx.fillStyle = COLORS.chair;
  ctx.fillRect(x + 2, y - 12, 16, 12);
  ctx.fillStyle = COLORS.chairSeat;
  ctx.fillRect(x, y, 20, 5);
  // Cushion
  ctx.fillStyle = "#5a5a5a";
  ctx.fillRect(x + 3, y - 10, 14, 8);
  ctx.fillRect(x + 2, y + 1, 16, 3);
  // Chrome base
  ctx.fillStyle = "#aaa";
  ctx.fillRect(x + 8, y + 5, 4, 6);
  // Star base
  ctx.fillStyle = "#999";
  ctx.fillRect(x + 2, y + 11, 16, 2);
  // Wheels
  ctx.fillStyle = "#666";
  ctx.fillRect(x + 2, y + 13, 3, 2);
  ctx.fillRect(x + 15, y + 13, 3, 2);
}

function drawPlant(x, y) {
  // White ceramic pot
  ctx.fillStyle = COLORS.pot;
  ctx.fillRect(x + 1, y + 8, 14, 12);
  ctx.fillStyle = COLORS.potRim;
  ctx.fillRect(x, y + 6, 16, 3);
  // Soil
  ctx.fillStyle = "#5a4a3a";
  ctx.fillRect(x + 2, y + 6, 12, 2);
  // Lush leaves
  ctx.fillStyle = COLORS.plant;
  ctx.fillRect(x + 3, y - 6, 10, 14);
  ctx.fillRect(x - 2, y - 2, 8, 8);
  ctx.fillRect(x + 10, y - 4, 8, 8);
  ctx.fillStyle = COLORS.plantDark;
  ctx.fillRect(x + 5, y - 10, 6, 8);
  ctx.fillRect(x + 1, y - 4, 4, 6);
  ctx.fillRect(x + 12, y - 2, 4, 4);
}

function drawWindow(x, y, w, h) {
  w = w || 80;
  h = h || 100;
  // Tall Copenhagen apartment window - white frame, many panes
  // Outer frame
  ctx.fillStyle = COLORS.windowFrame;
  ctx.fillRect(x, y, w, h);
  // Window sill
  ctx.fillStyle = "#e8e2da";
  ctx.fillRect(x - 4, y + h, w + 8, 5);
  ctx.fillStyle = "#ddd6cc";
  ctx.fillRect(x - 4, y + h + 5, w + 8, 2);

  // Glass panes (2 columns, 3 rows)
  const paneW = (w - 10) / 2;
  const paneH = (h - 14) / 3;
  for (let col = 0; col < 2; col++) {
    for (let row = 0; row < 3; row++) {
      const px = x + 4 + col * (paneW + 2);
      const py = y + 4 + row * (paneH + 2);
      // Sky gradient (lighter at top)
      ctx.fillStyle = row === 0 ? COLORS.windowLight : COLORS.window;
      ctx.fillRect(px, py, paneW, paneH);
      // Light reflection
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(px + 2, py + 2, paneW / 3, paneH - 4);
    }
  }
  // Mullions
  ctx.fillStyle = COLORS.windowMullion;
  ctx.fillRect(x + w / 2 - 1, y + 3, 2, h - 4);
  for (let row = 1; row < 3; row++) {
    ctx.fillRect(x + 3, y + 3 + row * (paneH + 2) - 2, w - 6, 2);
  }
}

function drawCoffeeMug(x, y) {
  // Minimalist white mug
  ctx.fillStyle = "#f0ece6";
  ctx.fillRect(x, y, 6, 7);
  ctx.fillRect(x + 6, y + 2, 2, 3);
  ctx.fillStyle = "#3a2a1a";
  ctx.fillRect(x + 1, y + 1, 4, 3);
  // Steam
  ctx.fillStyle = "rgba(180,170,160,0.3)";
  const t = Date.now() / 400;
  ctx.fillRect(x + 1 + Math.sin(t) * 1, y - 3, 1, 2);
  ctx.fillRect(x + 3 + Math.cos(t) * 1, y - 4, 1, 2);
}

function drawCarpet(x, y, w, h, color) {
  // Area rug with border pattern
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  // Border
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(x + 3, y + 3, w - 6, 2);
  ctx.fillRect(x + 3, y + h - 5, w - 6, 2);
  ctx.fillRect(x + 3, y + 3, 2, h - 6);
  ctx.fillRect(x + w - 5, y + 3, 2, h - 6);
  // Inner border
  ctx.fillStyle = "rgba(0,0,0,0.06)";
  ctx.fillRect(x + 7, y + 7, w - 14, 1);
  ctx.fillRect(x + 7, y + h - 8, w - 14, 1);
  ctx.fillRect(x + 7, y + 7, 1, h - 14);
  ctx.fillRect(x + w - 8, y + 7, 1, h - 14);
  // Subtle texture
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  for (let tx = x + 10; tx < x + w - 10; tx += 6) {
    for (let ty = y + 10; ty < y + h - 10; ty += 6) {
      if ((tx + ty) % 12 === 0) ctx.fillRect(tx, ty, 3, 3);
    }
  }
}

// --- Character drawing ---

function drawCharacter(x, y, appearance, activity, state, walkFrame, facing) {
  const { skin, shirt, hair } = appearance;

  // Flip context for facing direction
  ctx.save();
  if (facing === -1) {
    ctx.translate(x + 8, 0);
    ctx.scale(-1, 1);
    x = -8;
  }

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(x - 1, y + 24, 18, 4);

  if (state === "walking") {
    // Walking legs animation
    const step = Math.floor(walkFrame);
    ctx.fillStyle = "#3a3a5a";
    const legOffsets = [
      [0, 0], [3, -3], [0, 0], [-3, 3],
    ];
    const [l1, l2] = [legOffsets[step], legOffsets[(step + 2) % 4]];
    ctx.fillRect(x + 3 + l1[0], y + 18 + l1[1], 4, 8);
    ctx.fillRect(x + 9 + l2[0], y + 18 + l2[1], 4, 8);

    // Body bob
    const bob = step % 2 === 0 ? 0 : -1;

    // Body
    ctx.fillStyle = shirt;
    ctx.fillRect(x + 2, y + 8 + bob, 12, 10);

    // Arms swing
    ctx.fillRect(x - 2, y + 10 + l2[1], 4, 8);
    ctx.fillRect(x + 14, y + 10 + l1[1], 4, 8);

    // Head
    ctx.fillStyle = skin;
    ctx.fillRect(x + 3, y + bob, 10, 10);

    // Hair
    ctx.fillStyle = hair;
    ctx.fillRect(x + 2, y - 2 + bob, 12, 4);
    ctx.fillRect(x + 2, y + bob, 2, 4);

    // Eyes
    ctx.fillStyle = "#fff";
    ctx.fillRect(x + 5, y + 4 + bob, 3, 2);
    ctx.fillRect(x + 9, y + 4 + bob, 3, 2);
    ctx.fillStyle = "#111";
    ctx.fillRect(x + 6, y + 4 + bob, 2, 2);
    ctx.fillRect(x + 10, y + 4 + bob, 2, 2);
  } else if (state === "sitting") {
    // Sitting at desk
    const bobY = 0;

    // Legs (sitting)
    ctx.fillStyle = "#3a3a5a";
    ctx.fillRect(x + 2, y + 16, 12, 4);
    ctx.fillRect(x + 2, y + 20, 4, 6);
    ctx.fillRect(x + 10, y + 20, 4, 6);

    // Body
    ctx.fillStyle = shirt;
    ctx.fillRect(x + 2, y + 8, 12, 10);

    // Arms based on activity
    if (activity === "writing" || activity === "running") {
      const armOff = Math.sin(Date.now() / 100) > 0 ? 1 : 0;
      ctx.fillRect(x - 2, y + 10 + armOff, 4, 6);
      ctx.fillRect(x + 14, y + 10 + (1 - armOff), 4, 6);
      ctx.fillStyle = skin;
      ctx.fillRect(x - 2, y + 16 + armOff, 4, 2);
      ctx.fillRect(x + 14, y + 16 + (1 - armOff), 4, 2);
    } else if (activity === "thinking") {
      ctx.fillRect(x - 2, y + 10, 4, 8);
      ctx.fillRect(x + 14, y + 8, 4, 4);
      ctx.fillStyle = skin;
      ctx.fillRect(x + 14, y + 8, 4, 2);
    } else if (activity === "reading" || activity === "searching") {
      ctx.fillRect(x - 2, y + 10, 4, 8);
      ctx.fillRect(x + 14, y + 10, 4, 8);
    } else {
      ctx.fillRect(x - 2, y + 10, 4, 8);
      ctx.fillRect(x + 14, y + 10, 4, 8);
    }

    // Head
    ctx.fillStyle = skin;
    ctx.fillRect(x + 3, y, 10, 10);

    // Hair
    ctx.fillStyle = hair;
    ctx.fillRect(x + 2, y - 2, 12, 4);
    ctx.fillRect(x + 2, y, 2, 4);

    // Eyes
    ctx.fillStyle = "#fff";
    ctx.fillRect(x + 5, y + 4, 3, 2);
    ctx.fillRect(x + 9, y + 4, 3, 2);
    ctx.fillStyle = "#111";
    if (Math.floor(Date.now() / 2000) % 8 === 0) {
      ctx.fillRect(x + 5, y + 4, 3, 1);
      ctx.fillRect(x + 9, y + 4, 3, 1);
    } else {
      const lookDir = activity === "reading" ? 1 : 0;
      ctx.fillRect(x + 6 + lookDir, y + 4, 2, 2);
      ctx.fillRect(x + 10 + lookDir, y + 4, 2, 2);
    }
  } else {
    // Standing idle
    const bobY = Math.sin(Date.now() / 600) * 1;

    ctx.fillStyle = "#3a3a5a";
    ctx.fillRect(x + 3, y + 18 + bobY, 4, 8);
    ctx.fillRect(x + 9, y + 18 + bobY, 4, 8);

    ctx.fillStyle = shirt;
    ctx.fillRect(x + 2, y + 8 + bobY, 12, 10);

    ctx.fillRect(x - 2, y + 10 + bobY, 4, 8);
    ctx.fillRect(x + 14, y + 10 + bobY, 4, 8);

    ctx.fillStyle = skin;
    ctx.fillRect(x + 3, y + bobY, 10, 10);

    ctx.fillStyle = hair;
    ctx.fillRect(x + 2, y - 2 + bobY, 12, 4);
    ctx.fillRect(x + 2, y + bobY, 2, 4);

    ctx.fillStyle = "#fff";
    ctx.fillRect(x + 5, y + 4 + bobY, 3, 2);
    ctx.fillRect(x + 9, y + 4 + bobY, 3, 2);
    ctx.fillStyle = "#111";
    ctx.fillRect(x + 6, y + 4 + bobY, 2, 2);
    ctx.fillRect(x + 10, y + 4 + bobY, 2, 2);
  }

  // Thinking dots (above head, any state)
  if (activity === "thinking") {
    ctx.fillStyle = "#ffcc00";
    const dotPhase = Math.floor(Date.now() / 300) % 3;
    for (let i = 0; i <= dotPhase; i++) {
      ctx.fillRect(x + 16 + i * 4, y - 6 - i * 3, 2, 2);
    }
  }

  ctx.restore();
}

// --- Activity indicator ---

function drawActivityBadge(x, y, activity, tool, sessionId, statusText, idleSince) {
  const idleActivities = [
    "scrolling X",
    "on Reddit",
    "watching YT",
    "checking phone",
    "staring at wall",
    "doodling",
    "stretching",
    "snacking",
    "daydreaming",
    "googling self",
    "online shopping",
    "reading HN",
    "refilling water",
  ];

  const fallbackLabels = {
    thinking: "Thinking...",
    writing: "Writing...",
    reading: "Reading...",
    running: "Running...",
    searching: "Searching...",
    waiting: "Waiting for input",
    idle: null, // handled separately
  };

  const badgeColors = {
    thinking: "#ffcc00",
    writing: "#4acfac",
    reading: "#7c83ff",
    running: "#ff6b8a",
    searching: "#c084fc",
    waiting: "#ff9944",
    idle: "#888",
  };

  let text;
  if (activity === "idle") {
    const idleFor = idleSince ? Date.now() - idleSince : 0;
    if (idleFor >= 10 * 60 * 1000) {
      // Idle for 10+ minutes — show fun idle activities
      const seed = hashStr(sessionId || "idle");
      const offset = seed % idleActivities.length;
      const cycle = Math.floor((Date.now() + seed * 1000) / 8000);
      const idx = (offset + cycle) % idleActivities.length;
      text = idleActivities[idx];
    } else {
      return; // no badge for short idle
    }
  } else {
    // Use rich status text from server, fall back to generic label
    text = statusText || fallbackLabels[activity] || "?";
  }
  const color = badgeColors[activity] || "#888";

  // Measure text width for dynamic bubble size
  ctx.font = "bold 11px monospace";
  const textW = ctx.measureText(text).width;
  const padX = 7;
  const padY = 5;
  const bw = textW + padX * 2;
  const bh = 14 + padY;

  // Bubble
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x - bw / 2, y - bh, bw, bh, 4);
  ctx.fill();

  // Pointer triangle
  ctx.beginPath();
  ctx.moveTo(x - 4, y);
  ctx.lineTo(x + 4, y);
  ctx.lineTo(x, y + 6);
  ctx.closePath();
  ctx.fill();

  // Text
  ctx.fillStyle = activity === "thinking" ? "#333" : "#fff";
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "center";
  ctx.fillText(text, x, y - padY);
  ctx.textAlign = "left";
}

// --- Coffee machine ---

const KITCHEN_X = 10;
const KITCHEN_Y = 205;
const KITCHEN_H = H - KITCHEN_Y - 10;
const COFFEE_MACHINE = { x: KITCHEN_X + 12, y: KITCHEN_Y + 14 };
const AGENT_SCALE = 1.8;

function drawKitchen(x, y) {
  const cw = 60; // counter depth
  const ch = KITCHEN_H; // full height

  // Counter side (visible front face)
  ctx.fillStyle = "#d0c8bc";
  ctx.fillRect(x + cw, y, 8, ch);
  // Counter top surface
  ctx.fillStyle = "#e8e0d4";
  ctx.fillRect(x, y, cw, ch);

  // Cabinet doors along the front
  ctx.fillStyle = "#c8c0b4";
  const cabinetH = 70;
  const cabinetGap = 8;
  const numCabinets = Math.floor(ch / (cabinetH + cabinetGap));
  for (let i = 0; i < numCabinets; i++) {
    const cy = y + 6 + i * (cabinetH + cabinetGap);
    ctx.fillStyle = "#c8c0b4";
    ctx.fillRect(x + cw + 1, cy, 6, cabinetH);
    // Handle
    ctx.fillStyle = "#a09888";
    ctx.fillRect(x + cw + 3, cy + cabinetH / 2 - 6, 2, 12);
  }

  // === Items on counter ===

  // Coffee machine goes at the top (drawn separately)

  // Sink area (middle of counter)
  const sinkY = y + Math.floor(ch * 0.35);
  ctx.fillStyle = "#ccc";
  ctx.fillRect(x + 10, sinkY, 36, 44);
  ctx.fillStyle = "#bbb";
  ctx.fillRect(x + 13, sinkY + 3, 30, 38);
  // Faucet
  ctx.fillStyle = "#aaa";
  ctx.fillRect(x + 2, sinkY + 16, 5, 5);
  ctx.fillRect(x + 0, sinkY + 4, 4, 16);
  ctx.fillRect(x + 0, sinkY + 4, 9, 3);

  // Fruit bowl (lower area)
  const fruitY = y + Math.floor(ch * 0.6);
  ctx.fillStyle = "#e0d6c8";
  ctx.fillRect(x + 10, fruitY, 32, 16);
  ctx.fillStyle = "#e8a030";
  ctx.fillRect(x + 14, fruitY - 8, 10, 10);
  ctx.fillStyle = "#d04040";
  ctx.fillRect(x + 28, fruitY - 6, 8, 8);
  ctx.fillStyle = "#60b040";
  ctx.fillRect(x + 20, fruitY - 10, 8, 8);

  // Kitchen label
  ctx.fillStyle = "#a09080";
  ctx.font = "bold 12px monospace";
  ctx.fillText("KITCHEN", x + 4, y + ch + 18);
}

function drawCoffeeMachine(x, y) {
  // Sleek silver espresso machine
  ctx.fillStyle = "#c0c0c0";
  ctx.fillRect(x, y, 30, 40);
  ctx.fillStyle = "#d0d0d0";
  ctx.fillRect(x + 2, y + 2, 26, 12);
  // Display
  ctx.fillStyle = "#2a4a3a";
  ctx.fillRect(x + 4, y + 4, 10, 8);
  // Buttons
  ctx.fillStyle = "#e8d0a0";
  ctx.fillRect(x + 18, y + 5, 4, 3);
  ctx.fillRect(x + 18, y + 9, 4, 3);
  // Drip area
  ctx.fillStyle = "#999";
  ctx.fillRect(x + 6, y + 18, 18, 18);
  ctx.fillStyle = "#888";
  ctx.fillRect(x + 8, y + 20, 14, 14);
  // Drip tray
  ctx.fillStyle = "#aaa";
  ctx.fillRect(x + 6, y + 36, 18, 3);
  // Base
  ctx.fillStyle = "#b0b0b0";
  ctx.fillRect(x - 1, y + 39, 32, 2);
  // Label
  ctx.fillStyle = "#888";
  ctx.font = "bold 10px monospace";
  ctx.fillText("COFFEE", x - 1, y + 52);
  // Steam
  ctx.fillStyle = "rgba(160,150,140,0.3)";
  const t = Date.now() / 500;
  ctx.fillRect(x + 12 + Math.sin(t) * 2, y - 6, 2, 4);
  ctx.fillRect(x + 16 + Math.cos(t) * 2, y - 8, 2, 5);
  ctx.fillRect(x + 14 + Math.sin(t + 1) * 1, y - 11, 2, 3);
}

// --- Workstation layout ---

const WORKSTATIONS = [];
for (let row = 0; row < 2; row++) {
  for (let col = 0; col < 4; col++) {
    WORKSTATIONS.push({
      x: 320 + col * 310,
      y: 310 + row * 280,
    });
  }
}

// --- Scene ---

function drawHerringboneFloor() {
  // Herringbone parquet pattern
  const plankW = 16;
  const plankH = 6;
  for (let y = 200; y < H; y += plankH) {
    for (let x = 0; x < W; x += plankW * 2) {
      const row = Math.floor((y - 200) / plankH);
      const offsetX = (row % 2) * plankW;
      // Light plank
      ctx.fillStyle = COLORS.floorLight;
      ctx.fillRect(x + offsetX, y, plankW - 1, plankH - 1);
      // Dark plank
      ctx.fillStyle = COLORS.floorDark;
      ctx.fillRect(x + offsetX + plankW, y, plankW - 1, plankH - 1);
    }
  }
}

function drawBackground() {
  // Base floor
  ctx.fillStyle = COLORS.floor;
  ctx.fillRect(0, 200, W, H - 200);

  // Herringbone parquet
  drawHerringboneFloor();

  // Wall
  ctx.fillStyle = COLORS.wall;
  ctx.fillRect(0, 0, W, 200);

  // Wainscoting / panel detail on lower wall
  ctx.fillStyle = COLORS.wallAccent;
  ctx.fillRect(0, 140, W, 60);
  // Panel lines
  ctx.fillStyle = COLORS.wallTrim;
  ctx.fillRect(0, 140, W, 2);
  ctx.fillRect(0, 198, W, 2);
  // Vertical panel dividers
  for (let x = 0; x < W; x += 160) {
    ctx.fillRect(x, 142, 1, 56);
  }

  // Ceiling line
  ctx.fillStyle = COLORS.ceiling;
  ctx.fillRect(0, 0, W, 3);
  // Crown molding
  ctx.fillStyle = COLORS.wallTrim;
  ctx.fillRect(0, 3, W, 3);

  // Tall windows (on the right side of the wall, leaving kitchen space on left)
  drawWindow(460, 10, 100, 180);
  drawWindow(700, 10, 100, 180);
  drawWindow(940, 10, 100, 180);
  drawWindow(1180, 10, 100, 180);
  drawWindow(1420, 10, 100, 180);

  // Kitchen floor tile (different from office)
  ctx.fillStyle = "rgba(220, 215, 205, 0.3)";
  ctx.fillRect(0, 200, 120, H - 200);

  // Kitchen area along the left wall
  drawKitchen(KITCHEN_X, KITCHEN_Y);
  drawCoffeeMachine(COFFEE_MACHINE.x, COFFEE_MACHINE.y);

  // Area rugs under workstation rows
  drawCarpet(300, 290, 620, 140, COLORS.carpet1);
  drawCarpet(960, 290, 580, 140, COLORS.carpet2);
  drawCarpet(420, 570, 500, 140, COLORS.carpet3);
  drawCarpet(960, 570, 500, 140, COLORS.carpet1);

  // Plants
  drawPlant(260, 198);
  drawPlant(590, 198);
  drawPlant(830, 198);
  drawPlant(1090, 198);
  drawPlant(1330, 198);
  drawPlant(W - 40, 198);

  // (agents walk in from the right side)
}

function drawWorkstation(ws, occupied) {
  ctx.save();
  ctx.translate(ws.x, ws.y);
  ctx.scale(AGENT_SCALE, AGENT_SCALE);
  drawDesk(0, 0);
  drawMonitor(18, -22, occupied);
  drawCoffeeMug(48, -6);
  drawChair(20, 22);
  ctx.restore();
}

// --- State ---

let agents = [];

// Stable agent map - survives brief data dropouts
const knownAgents = {}; // sessionId -> { agent, deskIdx, lastSeen }
const takenDesks = new Set();

function pickRandomDesk(sessionId) {
  // Use sessionId hash to pick a stable random desk
  const h = hashStr(sessionId);
  const available = [];
  for (let i = 0; i < WORKSTATIONS.length; i++) {
    if (!takenDesks.has(i)) available.push(i);
  }
  if (available.length === 0) return h % WORKSTATIONS.length;
  return available[h % available.length];
}

function updateKnownAgents() {
  const now = Date.now();
  const currentIds = new Set();

  for (const agent of agents) {
    currentIds.add(agent.sessionId);
    if (knownAgents[agent.sessionId]) {
      // Update existing agent data
      knownAgents[agent.sessionId].agent = agent;
      knownAgents[agent.sessionId].lastSeen = now;
    } else {
      // New agent - assign a random desk
      const deskIdx = pickRandomDesk(agent.sessionId);
      takenDesks.add(deskIdx);
      knownAgents[agent.sessionId] = {
        agent,
        deskIdx,
        lastSeen: now,
      };
    }
  }

  // Remove agents gone for more than 30 seconds
  for (const id of Object.keys(knownAgents)) {
    if (now - knownAgents[id].lastSeen > 30000) {
      takenDesks.delete(knownAgents[id].deskIdx);
      delete knownAgents[id];
      delete sprites[id];
    }
  }
}

function render() {
  ctx.clearRect(0, 0, W, H);
  drawBackground();

  updateKnownAgents();

  const entries = Object.values(knownAgents);

  // Draw all workstations
  const occupiedDesks = new Set(entries.map((e) => e.deskIdx));
  for (let i = 0; i < WORKSTATIONS.length; i++) {
    drawWorkstation(WORKSTATIONS[i], occupiedDesks.has(i));
  }

  // Update and draw agents
  for (const entry of entries) {
    const { agent, deskIdx } = entry;
    const sp = getSprite(agent, deskIdx);
    updateSprite(sp, agent);

    const appearance = agentAppearance(agent.sessionId);

    // Draw character scaled (bigger than furniture)
    const charScale = AGENT_SCALE * 1.4;
    ctx.save();
    ctx.translate(sp.x, sp.y);
    ctx.scale(charScale, charScale);
    drawCharacter(0, 0, appearance, agent.activity, sp.state, sp.walkFrame, sp.facing);
    ctx.restore();

    // Draw speech bubble with last response text above agent
    if (agent.lastText && agent.activity !== "idle") {
      const fullText = agent.lastText;
      const bubbleX = sp.x + 4 * charScale;
      const bubbleY = sp.y - 24 * charScale;
      const maxLineW = 260;

      ctx.save();
      ctx.font = "13px monospace";

      // Word-wrap text into lines
      const words = fullText.split(" ");
      const lines = [];
      let currentLine = "";
      for (const word of words) {
        const test = currentLine ? currentLine + " " + word : word;
        if (ctx.measureText(test).width > maxLineW && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = test;
        }
      }
      if (currentLine) lines.push(currentLine);

      const lineH = 16;
      const padX = 10;
      const padY = 8;
      const textBlockH = lines.length * lineH;
      const actualW = Math.max(...lines.map(l => ctx.measureText(l).width));
      const bw = actualW + padX * 2;
      const bh = textBlockH + padY * 2;

      // Bubble background
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.beginPath();
      ctx.roundRect(bubbleX - bw / 2, bubbleY - bh, bw, bh, 6);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.1)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Pointer triangle
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.beginPath();
      ctx.moveTo(bubbleX - 5, bubbleY);
      ctx.lineTo(bubbleX + 5, bubbleY);
      ctx.lineTo(bubbleX, bubbleY + 7);
      ctx.closePath();
      ctx.fill();

      // Text lines
      ctx.fillStyle = "#333";
      ctx.textAlign = "center";
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], bubbleX, bubbleY - bh + padY + (i + 1) * lineH - 2);
      }
      ctx.textAlign = "left";
      ctx.restore();
    }

    // Trigger fireworks on git commit
    const isCommit = agent.statusText === "Committed!";
    if (isCommit && !activeFireworks.has(agent.sessionId)) {
      activeFireworks.add(agent.sessionId);
      spawnFireworks(sp.x, sp.y - 30);
      spawnFireworks(sp.x - 40, sp.y - 60);
      spawnFireworks(sp.x + 50, sp.y - 50);
    } else if (!isCommit) {
      activeFireworks.delete(agent.sessionId);
    }

    // Project name label near desk
    const ws = WORKSTATIONS[deskIdx];
    const labelY = ws.y + 55 * AGENT_SCALE;
    const label = agent.projectName.slice(0, 18);
    ctx.font = "bold 15px monospace";
    const labelW = ctx.measureText(label).width;

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillRect(ws.x - 3, labelY - 14, labelW + 6, 20);
    ctx.fillStyle = "#2a2a2a";
    ctx.fillText(label, ws.x, labelY);

    // Status text to the right of the agent
    const statusColors = {
      thinking: "#7a6a00",
      writing: "#2a9a7a",
      reading: "#5a6acc",
      running: "#cc4a6a",
      searching: "#8a5acc",
      waiting: "#cc7722",
      idle: "#999",
    };
    let statusStr = "";
    if (agent.activity === "idle") {
      const idleFor = sp.idleSince ? Date.now() - sp.idleSince : 0;
      if (idleFor >= 10 * 60 * 1000) {
        const seed = hashStr(agent.sessionId || "idle");
        const idleActivities = ["scrolling X","on Reddit","watching YT","checking phone","staring at wall","doodling","stretching","snacking","daydreaming","googling self","online shopping","reading HN","refilling water"];
        const offset = seed % idleActivities.length;
        const cycle = Math.floor((Date.now() + seed * 1000) / 8000);
        statusStr = idleActivities[(offset + cycle) % idleActivities.length];
      }
    } else {
      statusStr = agent.statusText || agent.activity;
    }

    if (statusStr) {
      const statusX = sp.x + 18 * charScale;
      const statusY = sp.y + 6 * charScale;
      ctx.font = "bold 15px monospace";
      const statusW = ctx.measureText(statusStr).width;
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillRect(statusX - 3, statusY - 14, statusW + 6, 20);
      ctx.fillStyle = statusColors[agent.activity] || "#999";
      ctx.fillText(statusStr, statusX, statusY);
    }
  }

  if (entries.length === 0) {
    ctx.fillStyle = "#8a7a6a";
    ctx.font = "14px monospace";
    ctx.fillText("No active agents... start a Claude Code session!", W / 2 - 200, H - 50);
  }

  // Draw fireworks on top of everything
  updateAndDrawFireworks();

  requestAnimationFrame(render);
}

// --- Clean up sprites for agents that are gone ---
// Keep sprites around for 30s after disappearing to avoid flicker from partial reads

const spriteLastSeen = {};

function cleanSprites() {
  const now = Date.now();
  const activeIds = new Set(agents.map((a) => a.sessionId));

  for (const id of activeIds) {
    spriteLastSeen[id] = now;
  }

  for (const id of Object.keys(sprites)) {
    if (!activeIds.has(id) && now - (spriteLastSeen[id] || 0) > 30000) {
      delete sprites[id];
      delete spriteLastSeen[id];
    }
  }
}

// --- WebSocket ---

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen = () => {
    status.textContent = "connected - watching for agents";
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => {
        agents = data;
        cleanSprites();
        // After first load, new agents walk in from door
        setTimeout(() => { initialLoad = false; }, 500);
      });
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "agents") {
      agents = msg.agents;
      cleanSprites();
      status.textContent = `${agents.length} active agent${agents.length !== 1 ? "s" : ""}`;
    }
  };

  ws.onclose = () => {
    status.textContent = "disconnected - reconnecting...";
    setTimeout(connect, 2000);
  };
}

connect();
render();
