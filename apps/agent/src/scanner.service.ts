import { Injectable, Logger } from '@nestjs/common';
import {
  readdirSync,
  statSync,
  openSync,
  readSync,
  fstatSync,
  closeSync,
} from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';

export interface AgentState {
  sessionId: string;
  projectName: string;
  activity:
    | 'idle'
    | 'thinking'
    | 'writing'
    | 'reading'
    | 'running'
    | 'searching'
    | 'waiting';
  lastTool?: string;
  lastText?: string;
  statusText?: string;
  timestamp: number;
}

@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);
  private readonly claudeDir = join(homedir(), '.claude', 'projects');

  discoverAgents(): AgentState[] {
    const agents: AgentState[] = [];
    try {
      const projectDirs = readdirSync(this.claudeDir);
      for (const dir of projectDirs) {
        const dirPath = join(this.claudeDir, dir);
        try {
          const stat = statSync(dirPath);
          if (!stat.isDirectory()) {
            if (dir.endsWith('.jsonl')) {
              const agent = this.parseTranscript(dirPath);
              if (agent) {
                agent.projectName = 'general';
                if (Date.now() - agent.timestamp < 2 * 60 * 1000)
                  agents.push(agent);
              }
            }
            continue;
          }
          const projectName = this.parseProjectName(dir);
          const files = readdirSync(dirPath).filter((f) =>
            f.endsWith('.jsonl'),
          );
          for (const file of files) {
            const agent = this.parseTranscript(join(dirPath, file));
            if (agent) {
              agent.projectName = projectName;
              if (Date.now() - agent.timestamp < 2 * 60 * 1000)
                agents.push(agent);
            }
          }
        } catch {}
      }
    } catch (err) {
      this.logger.error('Error scanning claude dir', err);
    }
    return agents;
  }

  private parseProjectName(dirName: string): string {
    const cleaned = dirName.replace(/^-Users-[^-]+-projects-?/, '');
    return cleaned || 'general';
  }

  private toolToActivity(toolName: string): AgentState['activity'] {
    switch (toolName) {
      case 'Edit':
      case 'Write':
      case 'NotebookEdit':
        return 'writing';
      case 'Read':
        return 'reading';
      case 'Bash':
      case 'TaskCreate':
      case 'TaskOutput':
        return 'running';
      case 'Grep':
      case 'Glob':
      case 'WebFetch':
      case 'WebSearch':
        return 'searching';
      case 'AskUserQuestion':
        return 'waiting';
      default:
        return 'thinking';
    }
  }

  private formatToolStatus(
    toolName: string,
    input: Record<string, unknown>,
  ): string {
    const base = (p: unknown) => (typeof p === 'string' ? basename(p) : '');
    switch (toolName) {
      case 'Read':
        return `Reading ${base(input.file_path)}`;
      case 'Edit':
        return `Editing ${base(input.file_path)}`;
      case 'Write':
        return `Writing ${base(input.file_path)}`;
      case 'Bash':
        return 'Running command';
      case 'Glob':
        return 'Searching files';
      case 'Grep':
        return 'Searching code';
      case 'WebFetch':
        return 'Fetching web page';
      case 'WebSearch':
        return 'Searching the web';
      case 'NotebookEdit':
        return 'Editing notebook';
      case 'AskUserQuestion':
        return 'Waiting for answer';
      case 'EnterPlanMode':
        return 'Planning';
      case 'Task':
      case 'TaskCreate': {
        const desc =
          typeof input.description === 'string' ? input.description : '';
        return desc ? `Subtask: ${desc.slice(0, 40)}` : 'Running subtask';
      }
      default:
        return `Using ${toolName}`;
    }
  }

  private readTail(filePath: string, bytes: number): string {
    try {
      const fd = openSync(filePath, 'r');
      const stat = fstatSync(fd);
      const start = Math.max(0, stat.size - bytes);
      const buf = Buffer.alloc(Math.min(bytes, stat.size));
      readSync(fd, buf, 0, buf.length, start);
      closeSync(fd);
      return buf.toString('utf-8');
    } catch {
      return '';
    }
  }

  private getSessionId(filePath: string): string {
    try {
      const lines = this.readTail(filePath, 4096).split('\n');
      for (const line of lines.slice(0, 5)) {
        const obj = JSON.parse(line);
        if (obj.sessionId) return obj.sessionId;
      }
    } catch {}
    return '';
  }

  private parseTranscript(filePath: string): AgentState | null {
    try {
      const tail = this.readTail(filePath, 131072);
      const lines = tail.split('\n').filter((l) => l.trim());
      let sessionId = '';
      let activity: AgentState['activity'] = 'idle';
      let lastTool: string | undefined;
      let lastText: string | undefined;
      let statusText: string | undefined;
      let timestamp = 0;
      let currentTurnHasText = false;
      const pendingCommitToolIds = new Set<string>();

      sessionId = this.getSessionId(filePath);
      if (lines.length > 0) lines.shift();

      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj.sessionId) sessionId = obj.sessionId;
          if (obj.timestamp) timestamp = new Date(obj.timestamp).getTime();

          if (obj.type === 'user') {
            const content = obj.message?.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (
                  block.type === 'tool_result' &&
                  pendingCommitToolIds.has(block.tool_use_id)
                ) {
                  pendingCommitToolIds.delete(block.tool_use_id);
                  if (!block.is_error) statusText = 'Committed!';
                }
              }
            }
            const hasHumanText =
              Array.isArray(content) &&
              content.some((b: any) => b.type === 'text');
            if (hasHumanText || !Array.isArray(content)) {
              activity = 'thinking';
              lastTool = undefined;
              lastText = undefined;
              statusText = 'Thinking...';
              currentTurnHasText = false;
            }
          }

          if (obj.type === 'assistant' && obj.message?.content) {
            for (const block of obj.message.content) {
              if (block.type === 'tool_use') {
                activity = this.toolToActivity(block.name);
                lastTool = block.name;
                statusText = this.formatToolStatus(
                  block.name,
                  block.input || {},
                );
                if (block.name === 'Bash') {
                  const cmd =
                    ((block.input as any)?.command as string) || '';
                  if (/git\s+commit/.test(cmd) && block.id)
                    pendingCommitToolIds.add(block.id);
                }
              } else if (block.type === 'thinking') {
                activity = 'thinking';
                statusText = 'Thinking...';
              } else if (block.type === 'text' && block.text?.trim()) {
                lastText = block.text;
                currentTurnHasText = true;
                if (obj.message.stop_reason === 'end_turn') {
                  activity = 'idle';
                  statusText = undefined;
                } else {
                  statusText = 'Responding...';
                }
              }
            }
          }
        } catch {}
      }

      if (!currentTurnHasText) lastText = undefined;

      const fileStat = statSync(filePath);
      if (activity === 'idle' && Date.now() - fileStat.mtimeMs < 5000) {
        activity = 'thinking';
        statusText = 'Thinking...';
      }

      if (!sessionId) return null;
      return {
        sessionId,
        projectName: '',
        activity,
        lastTool,
        lastText,
        statusText,
        timestamp,
      };
    } catch {
      return null;
    }
  }
}
