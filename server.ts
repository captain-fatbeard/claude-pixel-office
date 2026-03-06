import { createServer } from "http";
import { readFileSync, readdirSync, statSync, watch, openSync, readSync, fstatSync, closeSync, existsSync } from "fs";
import { join, extname } from "path";
import { homedir } from "os";
import { WebSocketServer, WebSocket } from "ws";

const PORT = parseInt(process.env.PORT || "4444");
const CLAUDE_DIR = join(homedir(), ".claude", "projects");

// --- Load .env ---
function loadEnv() {
  const envPath = join(import.meta.dirname || ".", ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}
loadEnv();

const GITHUB_USERNAME = process.env.GITHUB_USERNAME || "";
const OFFICE_NAME = process.env.OFFICE_NAME || "Claude Pixel Office";

// --- GitHub weekly commits ---
interface WeeklyCommits {
  days: { label: string; count: number }[];
  total: number;
  fetchedAt: number;
}

let cachedCommits: WeeklyCommits | null = null;

async function fetchWeeklyCommits(): Promise<WeeklyCommits> {
  // Cache for 5 minutes
  if (cachedCommits && Date.now() - cachedCommits.fetchedAt < 5 * 60 * 1000) {
    return cachedCommits;
  }

  if (!GITHUB_USERNAME) {
    return { days: [], total: 0, fetchedAt: Date.now() };
  }

  try {
    const now = new Date();
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const days: { label: string; count: number }[] = [];

    // Initialize current week (Monday to today)
    const dateToIdx = new Map<string, number>();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    for (let i = 0; i <= daysSinceMonday; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - daysSinceMonday + i);
      const dateStr = d.toISOString().split("T")[0];
      days.push({ label: dayNames[d.getDay()], count: 0 });
      dateToIdx.set(dateStr, i);
    }

    // Scrape GitHub contributions page
    const res = await fetch(
      `https://github.com/users/${GITHUB_USERNAME}/contributions`,
      { headers: { "User-Agent": "claude-pixel-office" } }
    );
    if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
    const html = await res.text();

    // Parse: find each date cell and its matching tooltip
    // Cells: data-date="YYYY-MM-DD" id="contribution-day-component-X-Y"
    // Tooltips: "N contributions on Month Dayth." or "No contributions on..."
    const cellRegex = /data-date="(\d{4}-\d{2}-\d{2})" id="(contribution-day-component-[^"]+)"/g;
    const cellIds = new Map<string, string>(); // id -> date
    let match;
    while ((match = cellRegex.exec(html)) !== null) {
      cellIds.set(match[2], match[1]);
    }

    // Match tooltips to cells
    const tipRegex = /for="(contribution-day-component-[^"]+)"[^>]*>([^<]+)</g;
    while ((match = tipRegex.exec(html)) !== null) {
      const cellId = match[1];
      const tipText = match[2].trim();
      const date = cellIds.get(cellId);
      if (!date) continue;

      const idx = dateToIdx.get(date);
      if (idx === undefined) continue;

      // Parse count: "N contribution(s) on..." or "No contributions on..."
      const countMatch = tipText.match(/^(\d+) contribution/);
      if (countMatch) {
        days[idx].count = parseInt(countMatch[1], 10);
      }
    }

    const total = days.reduce((sum, d) => sum + d.count, 0);
    cachedCommits = { days, total, fetchedAt: Date.now() };
    return cachedCommits;
  } catch (err) {
    console.error("Error fetching GitHub contributions:", err);
    return cachedCommits || { days: [], total: 0, fetchedAt: Date.now() };
  }
}

// --- Types ---

interface AgentState {
  sessionId: string;
  projectName: string;
  activity: "idle" | "thinking" | "writing" | "reading" | "running" | "searching" | "waiting";
  lastTool?: string;
  lastText?: string;
  statusText?: string;

  timestamp: number;
}

// --- Transcript parsing ---

function parseProjectName(dirName: string): string {
  // e.g. "-Users-signifly-projects-my-app" -> "my-app"
  const cleaned = dirName.replace(/^-Users-[^-]+-projects-?/, "");
  return cleaned || "general";
}

function toolToActivity(toolName: string): AgentState["activity"] {
  switch (toolName) {
    case "Edit":
    case "Write":
    case "NotebookEdit":
      return "writing";
    case "Read":
      return "reading";
    case "Bash":
    case "TaskCreate":
    case "TaskOutput":
      return "running";
    case "Grep":
    case "Glob":
    case "WebFetch":
    case "WebSearch":
      return "searching";
    case "AskUserQuestion":
      return "waiting";
    default:
      return "thinking";
  }
}

import { basename } from "path";

function formatToolStatus(toolName: string, input: Record<string, unknown>): string {
  const base = (p: unknown) => typeof p === "string" ? basename(p) : "";
  switch (toolName) {
    case "Read": return `Reading ${base(input.file_path)}`;
    case "Edit": return `Editing ${base(input.file_path)}`;
    case "Write": return `Writing ${base(input.file_path)}`;
    case "Bash": return "Running command";
    case "Glob": return "Searching files";
    case "Grep": return `Searching code`;
    case "WebFetch": return "Fetching web page";
    case "WebSearch": return "Searching the web";
    case "NotebookEdit": return "Editing notebook";
    case "AskUserQuestion": return "Waiting for answer";
    case "EnterPlanMode": return "Planning";
    case "Task":
    case "TaskCreate": {
      const desc = typeof input.description === "string" ? input.description : "";
      return desc ? `Subtask: ${desc.slice(0, 40)}` : "Running subtask";
    }
    default: return `Using ${toolName}`;
  }
}

function readTail(filePath: string, bytes: number): string {
  try {
    const fd = openSync(filePath, "r");
    const stat = fstatSync(fd);
    const start = Math.max(0, stat.size - bytes);
    const buf = Buffer.alloc(Math.min(bytes, stat.size));
    readSync(fd, buf, 0, buf.length, start);
    closeSync(fd);
    return buf.toString("utf-8");
  } catch {
    return "";
  }
}

function getSessionId(filePath: string): string {
  // Read just the first 2KB to get the sessionId
  const head = readTail(filePath, 2048).split("\n")[0];
  try {
    // Try second line (first is often file-history-snapshot)
    const lines = readTail(filePath, 4096).split("\n");
    for (const line of lines.slice(0, 5)) {
      const obj = JSON.parse(line);
      if (obj.sessionId) return obj.sessionId;
    }
  } catch {}
  return "";
}

function parseTranscript(filePath: string): AgentState | null {
  try {
    // Read a larger tail to make sure we capture the latest user message
    const tail = readTail(filePath, 131072);
    const lines = tail.split("\n").filter((l) => l.trim());

    let sessionId = "";
    let activity: AgentState["activity"] = "idle";
    let lastTool: string | undefined;
    let lastText: string | undefined;
    let statusText: string | undefined;
    let timestamp = 0;
    let currentTurnHasText = false;
    let pendingCommitToolIds = new Set<string>();

    // Get sessionId from head of file
    sessionId = getSessionId(filePath);

    // Drop the first line — it's likely a partial JSON line from the tail cut
    if (lines.length > 0) lines.shift();

    // Parse tail for recent activity — process all lines to find latest state
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.sessionId) sessionId = obj.sessionId;
        if (obj.timestamp) timestamp = new Date(obj.timestamp).getTime();

        // User message = new turn or tool results
        if (obj.type === "user") {
          // Check for tool results from git commit
          const content = obj.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "tool_result" && pendingCommitToolIds.has(block.tool_use_id)) {
                pendingCommitToolIds.delete(block.tool_use_id);
                if (!block.is_error) {
                  statusText = "Committed!";
}
              }
            }
          }

          // If it's a real user message (not just tool results), reset turn
          const hasHumanText = Array.isArray(content) && content.some((b: any) => b.type === "text");
          if (hasHumanText || !Array.isArray(content)) {
            activity = "thinking";
            lastTool = undefined;
            lastText = undefined;
            statusText = "Thinking...";
            currentTurnHasText = false;
          }
        }

        if (obj.type === "assistant" && obj.message?.content) {
          for (const block of obj.message.content) {
            if (block.type === "tool_use") {
              activity = toolToActivity(block.name);
              lastTool = block.name;
              statusText = formatToolStatus(block.name, block.input || {});
              // Track git commit tool calls (fireworks on success)
              if (block.name === "Bash") {
                const cmd = ((block.input as any)?.command as string) || "";
                if (/git\s+commit/.test(cmd) && block.id) {
                  pendingCommitToolIds.add(block.id);
                }
              }
            } else if (block.type === "thinking") {
              activity = "thinking";
              statusText = "Thinking...";
            } else if (block.type === "text" && block.text?.trim()) {
              lastText = block.text;
              currentTurnHasText = true;
              // Only go idle if the response is fully complete
              if (obj.message.stop_reason === "end_turn") {
                activity = "idle";
                statusText = undefined;
              } else {
                statusText = "Responding...";
              }
            }
          }
        }
      } catch {}
    }

    // Only include lastText if it was set in the current turn
    if (!currentTurnHasText) lastText = undefined;

    // If the file was modified very recently, the agent is likely active
    const fileStat = statSync(filePath);
    const mtime = fileStat.mtimeMs;
    if (activity === "idle" && Date.now() - mtime < 5000) {
      activity = "thinking";
      statusText = "Thinking...";
    }

    if (!sessionId) return null;

    return { sessionId, projectName: "", activity, lastTool, lastText, statusText, timestamp };
  } catch {
    return null;
  }
}

function discoverAgents(): AgentState[] {
  const agents: AgentState[] = [];

  try {
    const projectDirs = readdirSync(CLAUDE_DIR);
    for (const dir of projectDirs) {
      const dirPath = join(CLAUDE_DIR, dir);
      try {
        const stat = statSync(dirPath);
        if (!stat.isDirectory()) {
          // It's a top-level .jsonl file
          if (dir.endsWith(".jsonl")) {
            const agent = parseTranscript(dirPath);
            if (agent) {
              agent.projectName = "general";
              // Only include if active in the last 10 minutes
              if (Date.now() - agent.timestamp < 20 * 60 * 1000) {
                agents.push(agent);
              }
            }
          }
          continue;
        }

        const projectName = parseProjectName(dir);
        const files = readdirSync(dirPath).filter((f) => f.endsWith(".jsonl"));

        for (const file of files) {
          const agent = parseTranscript(join(dirPath, file));
          if (agent) {
            agent.projectName = projectName;
            // Only include if active in the last 10 minutes
            if (Date.now() - agent.timestamp < 10 * 60 * 1000) {
              agents.push(agent);
            }
          }
        }
      } catch {}
    }
  } catch (err) {
    console.error("Error scanning claude dir:", err);
  }

  return agents;
}

// --- HTTP server ---

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
};

const server = createServer(async (req, res) => {
  if (req.url === "/api/agents") {
    const agents = discoverAgents();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(agents));
    return;
  }

  if (req.url === "/api/config") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ officeName: OFFICE_NAME }));
    return;
  }

  if (req.url === "/api/commits") {
    const commits = await fetchWeeklyCommits();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(commits));
    return;
  }

  // Serve static files from public/
  let filePath = join("public", req.url === "/" ? "index.html" : req.url!);
  try {
    const content = readFileSync(filePath);
    const ext = extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "text/plain" });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

// --- WebSocket ---

const wss = new WebSocketServer({ server });

function broadcast(data: unknown) {
  const msg = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

// Poll for changes every second
let lastAgentSnapshot = "";
setInterval(() => {
  const agents = discoverAgents();
  const snapshot = JSON.stringify(agents);
  if (snapshot !== lastAgentSnapshot) {
    lastAgentSnapshot = snapshot;
    broadcast({ type: "agents", agents });
  }
}, 1000);

// Also try watching for new files
try {
  watch(CLAUDE_DIR, { recursive: true }, () => {
    const agents = discoverAgents();
    const snapshot = JSON.stringify(agents);
    if (snapshot !== lastAgentSnapshot) {
      lastAgentSnapshot = snapshot;
      broadcast({ type: "agents", agents });
    }
  });
} catch {}

server.listen(PORT, () => {
  console.log(`Claude Pixel Office running at http://localhost:${PORT}`);
});
