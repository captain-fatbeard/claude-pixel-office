# Claude Pixel Office

A real-time pixel art visualization of your active [Claude Code](https://claude.com/claude-code) sessions. Each agent gets their own desk in a cozy Copenhagen-style office, complete with herringbone floors, tall windows, and a kitchen with an espresso machine.

![Claude Pixel Office](https://img.shields.io/badge/claude-pixel%20office-7c83ff?style=flat-square)

## What it does

The server watches your local `~/.claude/projects` directory for active Claude Code session transcripts and renders each agent as a pixel art character in a shared virtual office.

- Characters **sit at their desks** and type when working
- Activity badges show what each agent is doing — reading, writing, running commands, thinking
- **Idle agents** get bored and wander to the coffee machine
- **Fireworks** go off when an agent makes a git commit
- Each agent gets a unique appearance (skin tone, hair, shirt color) based on their session ID
- Project names are displayed under each workstation

## Getting started

```bash
npm install
npm start
```

Then open [http://localhost:3333](http://localhost:3333) in your browser.

## How it works

- **`server.ts`** — Node server that reads Claude Code JSONL transcripts, parses the latest activity from each session, and pushes updates over WebSocket
- **`public/app.js`** — Canvas-based pixel art renderer with character animation, office furniture, and particle effects
- **`public/index.html`** — Minimal page that hosts the canvas

The server polls `~/.claude/projects` every second and also uses `fs.watch` for faster updates. Only sessions active within the last 10 minutes are shown. The office supports up to 8 workstations.

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

- TypeScript + Node.js (via `tsx`)
- WebSocket (`ws`) for real-time updates
- Vanilla Canvas API — no frameworks, no dependencies on the client side

## License

MIT
