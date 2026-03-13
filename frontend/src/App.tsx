import { useEffect, useState } from "react";
import "./index.css";

import {
  claimTopUp,
  fetchState,
  submitCoinFlip,
  type AppState,
  type CoinSide,
  type CoinFlipResult,
  type TopUpResult,
} from "./lib/session";
import { Header } from "./components/Header";
import { Lobby } from "./components/Lobby";
import { CoinFlipGame } from "./components/CoinFlipGame";
import { BetHistory } from "./components/BetHistory";
import { TopUp } from "./components/TopUp";

type View = "lobby" | "coinflip" | "history" | "topup";

export function App() {
  const [view, setView] = useState<View>("lobby");
  const [state, setState] = useState<AppState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  useEffect(() => {
    void loadState();
  }, []);

  const loadState = async () => {
    setIsLoading(true);
    setLoadingError(null);

    try {
      setState(await fetchState());
    } catch (error) {
      setLoadingError(error instanceof Error ? error.message : "Failed to load game state");
    } finally {
      setIsLoading(false);
    }
  };

  const applyCoinFlip = (next: CoinFlipResult) => {
    setState(current =>
      current
        ? {
            session: next.session,
            history: [next.bet, ...current.history].slice(0, 100),
            topUp: next.topUp,
          }
        : current,
    );
  };

  const applyTopUp = (next: TopUpResult) => {
    setState(current =>
      current
        ? {
            ...current,
            session: next.session,
            topUp: next.topUp,
          }
        : current,
    );
  };

  const handleCoinFlip = async (choice: CoinSide, amount: number) => {
    const next = await submitCoinFlip(choice, amount);
    applyCoinFlip(next);
    return next;
  };

  const handleTopUp = async (amount: number) => {
    const next = await claimTopUp(amount);
    applyTopUp(next);
    setView("lobby");
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 pb-14 pt-10">
        <Header
          balance={state?.session.balance ?? 0}
          onLobbyClick={() => setView("lobby")}
          onHistoryClick={() => setView("history")}
          onTopUpClick={() => setView("topup")}
          isLobby={view === "lobby"}
          isHistory={view === "history"}
        />

        <main className="flex flex-1 items-center justify-center py-12">
          {isLoading && (
            <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Loading table state</p>
              <p className="mt-4 text-sm text-slate-300/80">Syncing your server-side balance and history.</p>
            </section>
          )}

          {!isLoading && loadingError && !state && (
            <section className="w-full max-w-md rounded-3xl border border-rose-400/30 bg-rose-400/10 p-8 text-center">
              <p className="text-xs uppercase tracking-[0.3em] text-rose-200">Game state unavailable</p>
              <p className="mt-4 text-sm text-rose-100/80">{loadingError}</p>
              <button
                onClick={() => void loadState()}
                className="mt-6 rounded-full bg-white px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-slate-100"
                type="button"
              >
                Retry
              </button>
            </section>
          )}

          {!isLoading && state && view === "lobby" && <Lobby onSelectCoinFlip={() => setView("coinflip")} />}
          {!isLoading && state && view === "coinflip" && (
            <CoinFlipGame balance={state.session.balance} onFlip={handleCoinFlip} />
          )}
          {!isLoading && state && view === "history" && <BetHistory history={state.history} />}
          {!isLoading && state && view === "topup" && (
            <TopUp policy={state.topUp} onConfirm={handleTopUp} onCancel={() => setView("lobby")} />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
