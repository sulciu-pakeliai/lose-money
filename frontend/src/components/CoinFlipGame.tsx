import { useState } from "react";
import type { CoinFlipResult, CoinSide } from "../lib/session";

type CoinFlipGameProps = {
  balance: number;
  onFlip: (choice: CoinSide, amount: number) => Promise<CoinFlipResult>;
};

const betOptions = [1, 5, 10, 25, 50, 100];
const flipDurationMs = 2000;
const minBet = 1;
const maxBet = 10000;

export function CoinFlipGame({ balance, onFlip }: CoinFlipGameProps) {
  const [result, setResult] = useState<CoinSide | null>(null);
  const [pendingResult, setPendingResult] = useState<CoinSide | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<CoinSide>("Heads");
  const [bet, setBet] = useState<number>(10);
  const [customBet, setCustomBet] = useState<string>("10");

  const parsedCustomBet = Number(customBet);
  const isCustomBetValid =
    Number.isFinite(parsedCustomBet) && parsedCustomBet >= minBet && parsedCustomBet <= maxBet;

  const canAfford = bet <= balance;
  const isBusy = isRequesting || isFlipping;
  const canFlip = !isBusy && canAfford && bet > 0;

  const handleFlip = async () => {
    if (!canFlip) return;

    setError(null);
    setIsRequesting(true);
    setResult(null);
    setPendingResult(null);

    try {
      const response = await onFlip(choice, bet);
      const next = response.bet.result;
      setPendingResult(next);
      setIsRequesting(false);
      setIsFlipping(true);

      await new Promise(resolve => window.setTimeout(resolve, flipDurationMs));
      setResult(next);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to resolve flip");
    } finally {
      setIsRequesting(false);
      setIsFlipping(false);
    }
  };

  const outcomeText = result
    ? result === choice
      ? "YOU WON"
      : "YOU LOST"
    : "";

  const outcomeTone = result === null ? "" : result === choice ? "win" : "lose";

  const coinClass = [
    "coin",
    isFlipping ? "flipping" : "",
    isFlipping && pendingResult === "Heads" ? "flip-heads" : "",
    isFlipping && pendingResult === "Tails" ? "flip-tails" : "",
    !isFlipping && result === "Heads" ? "land-heads" : "",
    !isFlipping && result === "Tails" ? "land-tails" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className="page-swap page-from-right w-full max-w-2xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Flipzilla</p>

      <div className="mt-8 flex flex-col items-center gap-6">
        <div className="coin-wrap">
          <div className={coinClass}>
            <div className="coin-face coin-front">
              <span>H</span>
            </div>
            <div className="coin-face coin-back">
              <span>T</span>
            </div>
          </div>
        </div>

        {outcomeText ? (
          <div
            className={`result-pop rounded-2xl border px-6 py-4 ${
              outcomeTone === "win"
                ? "border-emerald-400/40 bg-emerald-400/10"
                : "border-rose-400/40 bg-rose-400/10"
            }`}
          >
            <div
              className={`text-sm uppercase tracking-[0.35em] ${
                outcomeTone === "win" ? "text-emerald-200" : "text-rose-200"
              }`}
            >
              {outcomeText}
            </div>
            <div className="mt-2 text-xs uppercase tracking-[0.3em] text-slate-200/70">
              Result: {result}
            </div>
          </div>
        ) : (
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Waiting for flip</div>
        )}

        <div className="w-full max-w-md">
          <div className="mt-3 grid grid-cols-2 gap-3">
            {(["Heads", "Tails"] as CoinSide[]).map(side => (
              <button
                key={side}
                onClick={() => {
                  setChoice(side);
                  setError(null);
                  setResult(null);
                  setPendingResult(null);
                }}
                disabled={isBusy}
                className={`arcade-button rounded-2xl border px-4 py-3 text-sm font-semibold uppercase tracking-[0.2em] transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  choice === side
                    ? "border-amber-400/60 bg-amber-400/10 text-amber-200"
                    : "border-white/10 bg-white/5 text-slate-200/70 hover:border-white/20"
                }`}
                type="button"
              >
                {side}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full max-w-md">
          <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
            {betOptions.map(amount => (
              <button
                key={amount}
                onClick={() => {
                  setBet(amount);
                  setCustomBet(String(amount));
                  setError(null);
                  setResult(null);
                  setPendingResult(null);
                }}
                disabled={isBusy || amount > balance}
                className={`arcade-button rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  bet === amount
                    ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-200"
                    : "border-white/10 bg-white/5 text-slate-200/70 hover:border-white/20"
                }`}
                type="button"
              >
                {amount}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full max-w-md">
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex-1">
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
                    setResult(null);
                    setPendingResult(null);
                  }
                }}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
                placeholder="Enter bet"
                disabled={isBusy}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                if (!isCustomBetValid) return;
                setBet(parsedCustomBet);
                setError(null);
                setResult(null);
                setPendingResult(null);
              }}
              disabled={isBusy || !isCustomBetValid}
              className="arcade-button rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200 transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              Set bet
            </button>
          </div>
        </div>

        {!canAfford && (
          <div className="text-xs uppercase tracking-[0.3em] text-rose-300">
            Not enough balance
          </div>
        )}

        {error && <div className="text-xs uppercase tracking-[0.3em] text-rose-200">{error}</div>}

        <button
          onClick={() => void handleFlip()}
          className="arcade-button rounded-full bg-cyan-500 px-6 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canFlip}
        >
          {isRequesting ? "Calling House..." : isFlipping ? "Flipping..." : "Flip Coin"}
        </button>
        <div className="text-xs uppercase tracking-[0.3em] text-slate-300/80">
          Current bet: ₵ {bet}
        </div>
      </div>
    </section>
  );
}
