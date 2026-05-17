# Load Testing With k6

The load/stress test uses k6 to simulate concurrent users against the Go REST backend.

## Start Backend

```powershell
docker-compose up --build -d backend
```

Check that the backend is reachable:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:8080/api/health
```

## Run 1000-User Test

```powershell
.\tools\k6\k6-v1.7.1-windows-amd64\k6.exe run --vus 1000 --duration 5m --summary-export profiles/loadtest-results.json loadtest/mixed.js
```

The default script settings are:

- `1000` virtual users
- `5m` total duration
- `5s` think time between iterations
- up to `30s` randomized first-request jitter
- mixed application scenario
- `http://localhost:8080` backend URL

Override defaults if needed:

```powershell
$env:THINK_TIME="5"
$env:START_JITTER="30"
$env:BASE_URL="http://localhost:8080"
.\tools\k6\k6-v1.7.1-windows-amd64\k6.exe run --vus 1000 --duration 5m --summary-export profiles/loadtest-results.json loadtest/mixed.js
```

Quick test example:

```powershell
.\tools\k6\k6-v1.7.1-windows-amd64\k6.exe run --vus 50 --duration 30s --summary-export profiles/loadtest-results.json loadtest/mixed.js
```

## Mixed Scenario

Each virtual user keeps its own cookies and repeatedly performs realistic backend actions:

- load application state
- top up balance periodically
- open profile periodically
- play coinflip
- play dice
- play roulette
- spin slots
- drop plinko

## Report Metrics

Use the k6 console output and `profiles/loadtest-results.json` for:

- total requests
- failed request rate
- requests per second
- average response time
- p90/p95/p99 response time
- throughput
