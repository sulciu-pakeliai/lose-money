import { useEffect, useRef, useState } from "react";
import type { BlackjackActionResult, BlackjackCard, BlackjackGameState } from "../lib/session";

type BlackjackGameProps = {
  balance: number;
  game: BlackjackGameState | null;
  onStart: (amount: number) => Promise<BlackjackActionResult>;
  onHit: () => Promise<BlackjackActionResult>;
  onStand: () => Promise<BlackjackActionResult>;
  onOpenRules: () => void;
};

const betOptions = [10, 25, 50, 100, 250, 500];
const minBet = 1;
const maxBet = 10000;

const suitAccent: Record<BlackjackCard["suit"], string> = {
  hearts: "text-rose-500",
  diamonds: "text-orange-400",
  clubs: "text-slate-900",
  spades: "text-slate-900",
};

const suitLabel: Record<BlackjackCard["suit"], string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

const resultTone: Record<string, string> = {
  active: "border-cyan-400/30 bg-cyan-400/10 text-cyan-100",
  blackjack: "border-emerald-400/40 bg-emerald-400/10 text-emerald-100",
  player_win: "border-emerald-400/40 bg-emerald-400/10 text-emerald-100",
  dealer_bust: "border-emerald-400/40 bg-emerald-400/10 text-emerald-100",
  push: "border-amber-300/40 bg-amber-300/10 text-amber-100",
  player_bust: "border-rose-400/40 bg-rose-400/10 text-rose-100",
  dealer_win: "border-rose-400/40 bg-rose-400/10 text-rose-100",
};

function formatBalance(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function CardFace({ card, hidden = false }: { card?: BlackjackCard; hidden?: boolean }) {
  if (hidden || !card) {
    return (
      <div className="blackjack-card blackjack-card-hidden">
        <div className="blackjack-card-surface">
          <div className="blackjack-card-backmark">
            LM
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="blackjack-card">
      <div className="blackjack-card-surface">
        <div className={`blackjack-card-center ${suitAccent[card.suit]}`}>
          <span className="blackjack-card-rank">{card.rank}</span>
          <span className="blackjack-card-suit">{suitLabel[card.suit]}</span>
        </div>
      </div>
    </div>
  );
}

export function BlackjackGame({ balance, game, onStart, onHit, onStand, onOpenRules }: BlackjackGameProps) {
  const [bet, setBet] = useState<number>(25);
  const [customBet, setCustomBet] = useState("25");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultFlash, setResultFlash] = useState<"win" | "loss" | "push" | "idle">("idle");
  const previousStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (bet > balance && balance > 0) {
      setBet(Math.min(balance, betOptions[0] ?? balance));
      setCustomBet(String(Math.min(balance, betOptions[0] ?? balance)));
    }
  }, [balance, bet]);

  useEffect(() => {
    const currentStatus = game?.status ?? null;
    const previousStatus = previousStatusRef.current;

    if (currentStatus && currentStatus !== previousStatus && currentStatus !== "active") {
      if (currentStatus === "push") {
        setResultFlash("push");
      } else if (currentStatus === "blackjack" || currentStatus === "player_win" || currentStatus === "dealer_bust") {
        setResultFlash("win");
      } else {
        setResultFlash("loss");
      }

      const timeout = window.setTimeout(() => setResultFlash("idle"), 900);
      previousStatusRef.current = currentStatus;
      return () => window.clearTimeout(timeout);
    }

    previousStatusRef.current = currentStatus;
  }, [game?.status]);

  const parsedCustomBet = Number(customBet);
  const isCustomBetValid =
    Number.isFinite(parsedCustomBet) && parsedCustomBet >= minBet && parsedCustomBet <= maxBet;

  const dealerCards = game?.dealerCards ?? [];
  const hiddenDealerCards = game?.dealerHiddenCount ?? 0;
  const playerCards = game?.playerCards ?? [];
  const canStart = !game || game.isComplete;
  const statusClass =
    resultFlash === "win"
      ? "table-status table-status-win"
      : resultFlash === "loss"
        ? "table-status table-status-loss"
        : resultFlash === "push"
          ? "table-status table-status-push"
          : "table-status";

  const handleStart = async () => {
    if (isBusy || bet < 1 || bet > balance) return;

    setError(null);
    setIsBusy(true);
    try {
      await onStart(bet);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to start blackjack hand");
    } finally {
      setIsBusy(false);
    }
  };

  const handleAction = async (action: "hit" | "stand") => {
    if (isBusy) return;

    setError(null);
    setIsBusy(true);
    try {
      if (action === "hit") {
        await onHit();
      } else {
        await onStand();
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Blackjack action failed");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="blackjack-table page-swap page-from-right w-full max-w-4xl overflow-hidden rounded-[2rem] border border-emerald-300/15 bg-[radial-gradient(circle_at_top,#0f5132,#052e16_42%,#03170f_100%)] p-6 shadow-[0_40px_120px_rgba(2,6,23,0.45)]">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-100/70">Blackjack Table</p>
            <h2 className="mt-2 font-display text-4xl text-white">High Table 21</h2>
            <p className="mt-2 max-w-xl text-sm text-emerald-50/70">
              Server-dealt cards, real hit and stand flow, and dealer logic handled in Go.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <button
              onClick={onOpenRules}
              className="arcade-button rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-100 transition hover:border-white/20 hover:bg-white/10"
              type="button"
            >
              Rules
            </button>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4">
              <p className="text-xs uppercase tracking-[0.28em] text-emerald-100/60">Active Wager</p>
              <p className="mt-2 font-display text-3xl text-white">₵ {formatBalance(game?.betAmount ?? bet)}</p>
            </div>
          </div>
        </div>

        <div
          className={`rounded-3xl border px-5 py-4 text-sm ${statusClass} ${resultTone[game?.status ?? "active"] ?? resultTone.active}`}
        >
          {game?.message ?? "Place a wager and deal a new hand."}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.3em] text-emerald-100/60">Dealer</p>
                  <p className="text-xs uppercase tracking-[0.24em] text-emerald-50/80">
                    Total: {game?.dealerTotal ?? 0}
                    {hiddenDealerCards > 0 ? " showing" : ""}
                  </p>
                </div>
                <div className="card-fan mt-4">
                  {dealerCards.length === 0 && (
                    <div className="flex h-28 w-20 items-center justify-center rounded-2xl border border-dashed border-white/15 text-xs uppercase tracking-[0.3em] text-emerald-50/50">
                      Wait
                    </div>
                  )}
                  {dealerCards.map((card, index) => (
                    <div
                      key={`dealer-${card.suit}-${card.rank}-${index}`}
                      style={{ ["--card-delay" as string]: `${index * 90}ms` }}
                    >
                      <CardFace card={card} />
                    </div>
                  ))}
                  {Array.from({ length: hiddenDealerCards }).map((_, index) => (
                    <div
                      key={`dealer-hidden-${index}`}
                      style={{ ["--card-delay" as string]: `${(dealerCards.length + index) * 90}ms` }}
                    >
                      <CardFace hidden />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.3em] text-emerald-100/60">Player</p>
                  <p className="text-xs uppercase tracking-[0.24em] text-emerald-50/80">
                    Total: {game?.playerTotal ?? 0}
                  </p>
                </div>
                <div className="card-fan mt-4">
                  {playerCards.length === 0 && (
                    <div className="flex h-28 w-20 items-center justify-center rounded-2xl border border-dashed border-white/15 text-xs uppercase tracking-[0.3em] text-emerald-50/50">
                      Deal
                    </div>
                  )}
                  {playerCards.map((card, index) => (
                    <div
                      key={`player-${card.suit}-${card.rank}-${index}`}
                      style={{ ["--card-delay" as string]: `${index * 90}ms` }}
                    >
                      <CardFace card={card} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-100/60">Table Controls</p>

            {canStart ? (
              <>
                <div className="mt-5 grid grid-cols-3 gap-3">
                  {betOptions.map(amount => (
                    <button
                      key={amount}
                      onClick={() => {
                        setBet(amount);
                        setCustomBet(String(amount));
                        setError(null);
                      }}
                      disabled={isBusy || amount > balance}
                      className={`arcade-button rounded-2xl border px-3 py-3 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                        bet === amount
                          ? "border-emerald-300/60 bg-emerald-300/10 text-emerald-100"
                          : "border-white/10 bg-white/5 text-emerald-50/70 hover:border-white/20"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                      type="button"
                    >
                      {amount}
                    </button>
                  ))}
                </div>

                <div className="mt-4 flex gap-3">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={minBet}
                    max={maxBet}
                    step="1"
                    value={customBet}
                    onChange={event => {
                      const value = event.target.value;
                      setCustomBet(value);
                      const parsed = Number(value);
                      if (Number.isFinite(parsed) && parsed >= minBet && parsed <= maxBet) {
                        setBet(parsed);
                        setError(null);
                      }
                    }}
                    className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-300/60"
                    placeholder="Enter bet"
                    disabled={isBusy}
                  />
                  <button
                    onClick={() => {
                      if (!isCustomBetValid) return;
                      setBet(parsedCustomBet);
                      setError(null);
                    }}
                    disabled={isBusy || !isCustomBetValid}
                    className="arcade-button rounded-2xl border border-emerald-300/40 bg-emerald-300/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100 transition disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                  >
                    Set
                  </button>
                </div>

                <button
                  onClick={() => void handleStart()}
                  disabled={isBusy || bet > balance || bet < 1}
                  className="arcade-button mt-5 w-full rounded-2xl bg-emerald-300 px-6 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                >
                  {game?.isComplete ? "Deal New Hand" : "Deal Cards"}
                </button>
              </>
            ) : (
              <div className="mt-5 grid gap-3">
                <button
                  onClick={() => void handleAction("hit")}
                  disabled={isBusy || !game?.canHit}
                  className="arcade-button rounded-2xl border border-cyan-300/40 bg-cyan-300/10 px-6 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                >
                  Hit
                </button>
                <button
                  onClick={() => void handleAction("stand")}
                  disabled={isBusy || !game?.canStand}
                  className="arcade-button rounded-2xl border border-amber-300/40 bg-amber-300/10 px-6 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-amber-100 transition hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                >
                  Stand
                </button>
              </div>
            )}

            {bet > balance && (
              <p className="mt-4 text-xs uppercase tracking-[0.24em] text-rose-200">Not enough balance</p>
            )}

            {error && <p className="mt-4 text-xs uppercase tracking-[0.24em] text-rose-200">{error}</p>}

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs uppercase tracking-[0.22em] text-emerald-50/70">
              Balance available
              <div className="mt-2 font-display text-2xl tracking-normal text-white">₵ {formatBalance(balance)}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
