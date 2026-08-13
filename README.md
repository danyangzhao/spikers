# Spikers Web

Web app and backend for Spikers - run group-based roundnet sessions, ELO rankings, tournaments, seasons, and announcements from a single Next.js + Prisma codebase.

## Overview

This repository contains both the Spikers web UI and the API/database layer used by all clients.

- Web/backend repo: [https://github.com/danyangzhao/spikers](https://github.com/danyangzhao/spikers)
- Companion iOS app: [https://github.com/danyangzhao/spiker-ios](https://github.com/danyangzhao/spiker-ios)
- Production host: [https://spikers-production.up.railway.app](https://spikers-production.up.railway.app)

## Features

- Group-based flow: create and join groups by name
- Session lifecycle: upcoming, in-progress, completed
- RSVP and attendance tracking per session
- 2v2 game logging with automatic ELO updates
- Session awards and advanced player stats
- Tournaments (round-robin and bracket support)
- Seasons with scheduling and activation workflows
- Group messages with push notifications
- Badges and progress tracking
- Shared API consumed by web and iOS clients

## Tech Stack

- Next.js 16 (App Router) with React 19 and TypeScript
- Tailwind CSS 4
- Next.js API routes
- Prisma + PostgreSQL
- Railway deployment

## Requirements

- Node.js 20.9+ and npm 10+
- PostgreSQL database

## Local Development

1. Clone and install:
   ```bash
   git clone <your-repo-url>
   cd spikers
   npm install
   ```
2. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
3. Prepare database and Prisma client:
   ```bash
   npm run db:push
   npm run db:seed
   npm run db:generate
   ```
4. Start the app:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000)

## Common Commands

```bash
npm run dev         # Start local app
npm run build       # Prisma generate + Next build
npm run start       # Start production build
npm run test        # Run tests
npm run lint        # Run ESLint

npm run db:generate # Generate Prisma client
npm run db:push     # Push schema (dev)
npm run db:migrate  # Create/apply local migration
npm run db:seed     # Seed badge data
npm run db:studio   # Open Prisma Studio
```

## Project Structure

- `app/` - Next.js routes and pages
- `app/api/` - API endpoints (groups, players, sessions, seasons, notifications, games)
- `components/` - shared UI components
- `lib/` - core business logic and utilities
- `prisma/` - schema and seeds
- `video-lab/` - isolated offline video tracking v2 tooling and docs

## Video Lab (Tracking v2 milestone)

For the from-scratch roundnet tracking milestone (offline processing + review UI), see:

- `video-lab/README.md`
- setup UI: `/video-lab/setup`
- review UI: `/video-lab/review`

## License

MIT
