export interface AgentState {
  sessionId: string;
  projectName: string;
  activity: "idle" | "thinking" | "writing" | "reading" | "running" | "searching" | "waiting";
  lastTool?: string;
  lastText?: string;
  statusText?: string;
  timestamp: number;
  username: string;
}

export interface WeeklyCommits {
  days: { label: string; count: number }[];
  total: number;
}

interface UserState {
  username: string;
  agents: AgentState[];
  commits: WeeklyCommits;
  lastSeen: number;
}

// Global store — persists within a single serverless instance on Vercel.
// Agents re-post every few seconds so cold starts recover quickly.
const users = new Map<string, UserState>();

export function updateUser(data: {
  username: string;
  agents: Omit<AgentState, "username">[];
  commits: WeeklyCommits;
}) {
  users.set(data.username, {
    username: data.username,
    agents: data.agents.map((a) => ({ ...a, username: data.username })),
    commits: data.commits,
    lastSeen: Date.now(),
  });

  // Evict users not seen in 60s
  for (const [id, state] of users) {
    if (Date.now() - state.lastSeen > 15_000) {
      users.delete(id);
    }
  }
}

export function getAll(): {
  agents: AgentState[];
  commits: WeeklyCommits;
  users: string[];
} {
  const agents: AgentState[] = [];
  let commits: WeeklyCommits = { days: [], total: 0 };
  const usernames: string[] = [];

  for (const [, state] of users) {
    if (Date.now() - state.lastSeen > 15_000) continue;
    usernames.push(state.username);
    for (const agent of state.agents) {
      agents.push(agent);
    }
    if (state.commits.total > 0) {
      if (commits.days.length === 0) {
        commits = { ...state.commits };
      } else {
        for (let i = 0; i < state.commits.days.length; i++) {
          const existing = commits.days.find(
            (d) => d.label === state.commits.days[i].label
          );
          if (existing) {
            existing.count += state.commits.days[i].count;
          } else {
            commits.days.push({ ...state.commits.days[i] });
          }
        }
        commits.total += state.commits.total;
      }
    }
  }

  return { agents, commits, users: usernames };
}
