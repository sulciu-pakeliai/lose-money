# Performance Test Plan

This checklist defines the manual scenarios to execute while the Go backend is running with file-based profiling enabled.

## Profiling Setup

Run the application through Docker Compose so the backend writes profile files into `profiles/`.

Expected profile files:

- `profiles/manual-cpu.pprof`
- `profiles/manual-mem.pprof`

Stop the backend cleanly after the scenarios so the profile files are flushed.

## Manual Test Cases

| ID | Scenario | Actions | Expected Result |
| - | - | - | - |
| PT-01 | Load application state | Open `http://localhost:3000` and wait for the lobby/session data to load. | Application loads without errors and a session is created or restored. |
| PT-02 | Register user | Open authentication modal, register with a test email and password. | User account is created and session shows authenticated user data. |
| PT-03 | Login user | Log out if needed, then log in with the same test account. | Login succeeds and existing session/user data is loaded. |
| PT-04 | Top up balance | Use the top-up control to add credits, for example `100`, `250`, or `500`. | Balance increases and a notification is created. |
| PT-05 | Play coinflip | Place several small bets on Heads and Tails. | Bets complete, balance changes, and bet history updates. |
| PT-06 | Play dice | Place several dice bets using different bet types. | Dice results complete, balance changes, and history updates. |
| PT-07 | Play roulette | Place several roulette bets on different choices. | Roulette results complete, balance changes, and history updates. |
| PT-08 | Play slots | Spin slots several times with a small bet amount. | Slot results complete, balance changes, and history updates. |
| PT-09 | Play blackjack | Start a blackjack game, then use hit, stand, and split if available. | Blackjack state changes correctly and final result is recorded. |
| PT-10 | Play crash | Start crash, check status, and cash out or let it crash. | Crash game completes and result is recorded. |
| PT-11 | Play mines | Start mines, reveal several cells, then cash out or hit a mine. | Mines game completes and result is recorded. |
| PT-12 | Open profile | Open the profile/statistics view. | Profile totals load and reflect played bets. |
| PT-13 | Open settings | Open settings and change theme or bet limit. | Settings are saved and returned by the backend. |
| PT-14 | Review missions and achievements | Open missions/achievements after playing games. | Progress values update based on completed game actions. |
| PT-15 | Review notifications | Open notifications after wins, top-ups, or low balance events. | Notifications load and can be marked as read. |

## Execution Notes

- Use small bet amounts to avoid running out of balance too quickly.
- Repeat each game scenario several times so CPU and allocation profiles contain useful samples.
- Run the manual test session for at least 2-5 minutes.
- Stop the backend with `Ctrl+C` or `docker-compose stop backend`.

## Analysis Commands

CPU profile:

```powershell
go tool pprof .\profiles\manual-cpu.pprof
go tool pprof -http=:7070 .\profiles\manual-cpu.pprof
```

Memory snapshot:

```powershell
go tool pprof -inuse_space .\profiles\manual-mem.pprof
go tool pprof -http=:7071 -inuse_space .\profiles\manual-mem.pprof
```

Allocation analysis:

```powershell
go tool pprof -alloc_space .\profiles\manual-mem.pprof
go tool pprof -alloc_objects .\profiles\manual-mem.pprof
```

## Report Mapping

This checklist supports the lab task:

- "Manually execute some of main test cases from test plan"
- "Measure CPU usage"
- "Discover methods that consume most CPU time"
- "Measure memory usage"
- "Take memory snapshot after/during execution or test cases"
- "Discover what is the most allocated object"
