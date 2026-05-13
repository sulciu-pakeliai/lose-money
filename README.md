# lose-money

A small full-stack gambling simulation.

**Stack:** Go, Bun + React, Postgres

## Run

```bash
docker compose up --build
```

| Service | URL |
| - | - |
| Frontend | http://localhost:3000 |
| Backend | http://localhost:8080 |

## Run Locally

```bash
# backend
cd backend
DATABASE_URL=postgres://postgres:example@localhost:5432/postgres?sslmode=disable go run .

# frontend
cd frontend
bun install
BACKEND_ORIGIN=http://localhost:8080 bun run dev
```

## Wiki

For the full documentation see the [wiki](../../wiki):

- [Getting Started](../../wiki/Getting-Started)
- [API](../../wiki/API)
- [Database Schema](../../wiki/Database-Schema)
