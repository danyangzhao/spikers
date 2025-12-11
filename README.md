# 🏐 Spikers

A mobile-first web app for tracking Spikeball sessions, scores, and stats with friends.

## Features

- **Player Management**: Add players with custom emojis, track ratings
- **Session Tracking**: Schedule sessions, manage RSVPs, track attendance
- **Game Recording**: Random team generation, score tracking, ELO rating updates
- **Stats & Awards**: Partner chemistry, nemesis opponents, session awards
- **Badges**: Earn achievements for milestones and streaks

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL via Prisma
- **Deployment**: Railway

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (or use Railway's built-in Postgres)

### Local Development

1. Clone the repository:
```bash
git clone <your-repo-url>
cd spikers
```

2. Install dependencies:
```bash
npm install
```

3. Set up your environment variables:
```bash
cp .env.example .env
# Edit .env with your DATABASE_URL
```

4. Set up the database:
```bash
npx prisma db push
npx prisma db seed
```

5. Start the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000)

## Database Commands

```bash
# Generate Prisma client
npm run db:generate

# Push schema changes (development)
npm run db:push

# Create migrations (production-ready)
npm run db:migrate

# Seed badges into database
npm run db:seed

# Open Prisma Studio
npm run db:studio
```

## Deployment to Railway

1. Create a new project on [Railway](https://railway.app)

2. Add a PostgreSQL database to your project

3. Connect your GitHub repository

4. Railway will automatically:
   - Detect Next.js
   - Build the app
   - Run migrations and seed badges
   - Deploy

5. Set any additional environment variables if needed:
   - `NEXT_PUBLIC_APP_URL` - Your Railway app URL

## Project Structure

```
spikers/
├── app/
│   ├── api/           # API routes
│   │   ├── players/   # Player CRUD & stats
│   │   ├── sessions/  # Sessions, RSVP, attendance, games
│   │   ├── games/     # Game management
│   │   └── badges/    # Badge listing
│   ├── players/       # Player pages
│   ├── sessions/      # Session pages
│   └── page.tsx       # Home page
├── components/        # Reusable UI components
├── lib/
│   ├── prisma.ts      # Prisma client
│   ├── teams.ts       # Random team generator
│   ├── elo.ts         # ELO rating calculations
│   └── stats.ts       # Stats & badge computation
└── prisma/
    ├── schema.prisma  # Database schema
    └── seed.ts        # Badge seeding
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/players` | GET, POST | List/create players |
| `/api/players/[id]` | GET, PATCH | Get/update player |
| `/api/players/[id]/stats` | GET | Get player stats |
| `/api/sessions` | GET, POST | List/create sessions |
| `/api/sessions/[id]` | GET, PATCH | Get/update session |
| `/api/sessions/[id]/rsvp` | GET, POST | Manage RSVPs |
| `/api/sessions/[id]/attendance` | GET, POST | Manage attendance |
| `/api/sessions/[id]/games` | GET, POST | List/add games |
| `/api/sessions/[id]/summary` | GET | Get session awards |
| `/api/games/[id]` | PATCH, DELETE | Edit/delete game |
| `/api/badges` | GET | List all badges |

## Badges

- 🐦 **Early Bird** - Attended 3 consecutive sessions
- 🏃 **Marathoner** - Played 10+ games in a single session
- 🦋 **Social Butterfly** - Played with 5+ different teammates in one session
- 🔥 **Streak Beast** - 5+ session attendance streak
- 💯 **Century Club** - Played 100 total games
- 🏆 **First Win** - Won your first game
- 👑 **Undefeated** - Won all games in a session (min 3 games)

## License

MIT
