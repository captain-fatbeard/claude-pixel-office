export interface AgentState {
  sessionId: string;
  projectName: string;
  activity: "idle" | "thinking" | "writing" | "reading" | "running" | "searching" | "waiting";
  lastTool?: string;
  lastText?: string;
  statusText?: string;
  timestamp: number;
  machineName: string;
}

export interface WeeklyCommits {
  days: { label: string; count: number }[];
  total: number;
}

export interface MachineState {
  machineId: string;
  machineName: string;
  agents: AgentState[];
  commits: WeeklyCommits;
  lastSeen: number;
}

// Global store — persists within a single serverless instance on Vercel.
// Agents re-post every few seconds so cold starts recover quickly.
const machines = new Map<string, MachineState>();

export function updateMachine(data: {
  machineId: string;
  machineName: string;
  agents: Omit<AgentState, "machineName">[];
  commits: WeeklyCommits;
}) {
  machines.set(data.machineId, {
    machineId: data.machineId,
    machineName: data.machineName,
    agents: data.agents.map((a) => ({ ...a, machineName: data.machineName })),
    commits: data.commits,
    lastSeen: Date.now(),
  });

  // Evict machines not seen in 60s
  for (const [id, state] of machines) {
    if (Date.now() - state.lastSeen > 60_000) {
      machines.delete(id);
    }
  }
}

export function getAll(): {
  agents: AgentState[];
  commits: WeeklyCommits;
  machines: string[];
} {
  const agents: AgentState[] = [];
  let commits: WeeklyCommits = { days: [], total: 0 };
  const machineNames: string[] = [];

  for (const [, state] of machines) {
    if (Date.now() - state.lastSeen > 60_000) continue;
    machineNames.push(state.machineName);
    for (const agent of state.agents) {
      agents.push(agent);
    }
    if (state.commits.total > 0) {
      // Merge commits: sum days by label
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

  return { agents, commits, machines: machineNames };
}
