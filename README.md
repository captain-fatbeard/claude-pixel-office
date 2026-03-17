# Claude Pixel Office

A real-time pixel art visualization of your active [Claude Code](https://claude.com/claude-code) sessions — across multiple machines. Each agent gets their own desk in a cozy Copenhagen-style office, complete with herringbone floors, tall windows, and a kitchen with an espresso machine.

![Claude Pixel Office](https://img.shields.io/badge/claude-pixel%20office-7c83ff?style=flat-square)

## What it does

Multiple developers run a local **agent** that watches Claude Code transcripts and posts state to a shared **web dashboard** (deployable on Vercel). All connected agents appear in one shared pixel office.

- Characters **sit at their desks** and type when working
- Activity badges show what each agent is doing — reading, writing, running commands, thinking
- **Idle agents** get bored and wander to the coffee machine
- **Fireworks** go off when an agent makes a git commit
- Each agent gets a unique appearance (skin tone, hair, shirt color) based on their session ID
- GitHub username and project name are displayed under each workstation
- **Weekly GitHub contributions** whiteboard

## Architecture

```
apps/
├── web/       → Next.js dashboard (deploy to Vercel)
└── agent/     → NestJS local service (runs on each dev machine)
```

- **`apps/web`** — Next.js app that receives agent state via webhook and renders the shared pixel office. Polling-based real-time updates.
- **`apps/agent`** — NestJS background service that reads `~/.claude/projects` transcripts, fetches GitHub contributions, and posts everything to the web app via `POST /api/webhook` every 2 seconds.

## Getting started

### Prerequisites

- Node.js 20+
- pnpm 10+

### Install

```bash
pnpm install
```

### Run the agent

```bash
pnpm start:agent
```

### Development

```bash
# Run everything locally
pnpm dev

# Or run individually
pnpm dev:web      # http://localhost:3000
pnpm dev:agent    # posts to web app
```

### Build

```bash
pnpm build
```

### Agent configuration

Copy and edit the agent `.env` file:

```bash
cp apps/agent/.env.example apps/agent/.env
```

| Variable | Description | Default |
|---|---|---|
| `WEBHOOK_URL` | URL of the web app's webhook endpoint | `https://claude-pixel-office-web.vercel.app/api/webhook` |
| `GITHUB_USERNAME` | GitHub username (used as identifier and for contribution chart) | _(required)_ |
| `POLL_INTERVAL` | How often to scan transcripts (ms) | `2000` |

### Deploy

The web app deploys to Vercel as a standard Next.js app. The default `WEBHOOK_URL` already points to the production deployment.

## API

| Endpoint | Method | Description |
|---|---|---|
| `/api/webhook` | POST | Receives agent state from local services |
| `/api/agents` | GET | Returns all agents from all connected users |

## Activities

| State | What the agent is doing |
|---|---|
| Thinking | Extended thinking or planning |
| Writing | Editing or creating files |
| Reading | Reading files |
| Running | Executing shell commands or tasks |
| Searching | Grep, glob, or web searches |
| Waiting | Waiting for user input |
| Idle | Slacking off (scrolling X, reading HN, snacking...) |

## Tech stack

- **Monorepo** — Turborepo + pnpm workspaces
- **Web** — Next.js 15, React 19, vanilla Canvas API
- **Agent** — NestJS 11 with `@nestjs/schedule` and `@nestjs/config`

## License

MIT
