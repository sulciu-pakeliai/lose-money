# lose-money

Small full-stack project with:
- `frontend`: Bun + React + Tailwind
- `backend`: Go
- `db`: Postgres (via Docker Compose)

## Current Architecture

- Browser state is no longer authoritative for balance, game results, or bet history.
- `backend` owns the session cookie, balance, coin flip resolution, and bet history.
- `backend` also owns active blackjack hands, dealer logic, and blackjack settlement.
- `frontend` now renders UI and calls `/api/*`.
- The Bun frontend server proxies `/api/*` to the Go backend using `BACKEND_ORIGIN`.

## Prerequisites

- Docker Desktop (for containerized run)
- Bun (for local frontend run)
- Go 1.24+ (for local backend run)

## Run With Docker (recommended)

From repo root:

```bash
docker compose up --build
```

Services:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8080`
- Postgres: `localhost:5432`

Important:
- Frontend proxy target in Docker is set with `BACKEND_ORIGIN=http://backend:8080`
- Backend reads `DATABASE_URL` and `PORT`
- `backend:8080` only works from inside Docker containers. From your browser or host machine, use `http://localhost:8080`.

## Run Locally

Frontend:

```bash
cd frontend
bun install
BACKEND_ORIGIN=http://localhost:8080 bun run dev
```

Backend:

```bash
cd backend
DATABASE_URL=postgres://postgres:example@localhost:5432/postgres?sslmode=disable go run .
```

## API Overview

- `GET /api/state`
- `POST /api/coinflip`
- `POST /api/top-up`
- `POST /api/blackjack/start`
- `POST /api/blackjack/hit`
- `POST /api/blackjack/stand`
- `GET /api/health`

## Security Notes

- The client can no longer change balance or write fake bet history through `localStorage`.
- This is still an anonymous session system, not a full production anti-abuse setup.
- The next security step after this is user accounts, rate limiting, and real payment/deposit handling instead of a faucet.
