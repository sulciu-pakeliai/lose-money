import { useState } from "react";
import type { BetRecord, CoinFlipResult, CoinSide } from "../lib/session";

type CoinFlipGameProps = {
    balance: number;
    onFlip: (choice: CoinSide, amount: number) => Promise<CoinFlipResult>;
    onOpenRules: () => void;
    onOutcomeReveal: (bet: BetRecord) => void;
};

const betOptions = [1, 5, 10, 25, 50, 100];
const flipDurationMs = 2000;
const minBet = 1;
const maxBet = 10000;

function formatCredits(value: number) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function CoinFlipGame({ balance, onFlip, onOpenRules, onOutcomeReveal }: CoinFlipGameProps) {
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
            const serverResult = response.bet.result;
            if (serverResult !== "Heads" && serverResult !== "Tails") {
                throw new Error("Received invalid coin flip result");
            }
            const next: CoinSide = serverResult;
            setPendingResult(next);
            setIsRequesting(false);
            setIsFlipping(true);

            await new Promise(resolve => window.setTimeout(resolve, flipDurationMs));
            setResult(next);
            onOutcomeReveal(response.bet);
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
        <section className="game-shell game-shell-coinflip page-swap page-from-right w-full max-w-5xl overflow-hidden rounded-3xl border border-amber-300/20 bg-[linear-gradient(145deg,rgba(17,24,39,0.98),rgba(120,53,15,0.44)_54%,rgba(8,13,28,0.98))] p-6 shadow-[0_40px_120px_rgba(2,6,23,0.5)]">
            <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
                <aside className="rounded-3xl border border-white/10 bg-black/25 p-4">
                    <div>
                        <p className="game-eyebrow text-xs uppercase tracking-[0.3em] text-amber-100/70">Coin Flip</p>
                        <h2 className="mt-2 font-display text-4xl text-white">Heads or Tails</h2>
                    </div>

                    <button
                        onClick={onOpenRules}
                        className="arcade-button mt-4 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-100 transition hover:border-white/20 hover:bg-white/10"
                        type="button"
                    >
                        Rules
                    </button>

                    <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-300/70">Current Wager</p>
                        <p className="mt-2 font-display text-3xl text-white">₵ {formatCredits(bet)}</p>
                    </div>

                    <div className="mt-4">
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-300/70">Pick a side</p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
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
                                    className={`arcade-button rounded-lg border px-3 py-3 text-xs font-semibold uppercase tracking-[0.22em] transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                        choice === side
                                            ? "border-amber-300/60 bg-amber-300/14 text-amber-100"
                                            : "border-white/10 bg-white/5 text-slate-200/75 hover:border-white/20"
                                    }`}
                                    type="button"
                                >
                                    {side}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mt-4">
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-300/70">Bet amount</p>
                        <div className="mt-2 flex rounded-xl border border-white/10 bg-slate-950/70">
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
                                className="min-w-0 flex-1 rounded-l-xl bg-transparent px-3 py-3 text-sm font-semibold text-white outline-none"
                                placeholder="Enter bet"
                                disabled={isBusy}
                            />
                            <button
                                onClick={() => {
                                    const nextBet = Math.max(minBet, Math.floor(bet / 2));
                                    setBet(nextBet);
                                    setCustomBet(String(nextBet));
                                    setError(null);
                                    setResult(null);
                                    setPendingResult(null);
                                }}
                                disabled={isBusy}
                                className="border-l border-white/10 px-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:text-white disabled:opacity-40"
                                type="button"
                            >
                                1/2
                            </button>
                            <button
                                onClick={() => {
                                    const nextBet = Math.min(maxBet, bet * 2);
                                    setBet(nextBet);
                                    setCustomBet(String(nextBet));
                                    setError(null);
                                    setResult(null);
                                    setPendingResult(null);
                                }}
                                disabled={isBusy}
                                className="border-l border-white/10 px-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:text-white disabled:opacity-40"
                                type="button"
                            >
                                2x
                            </button>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2">
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
                                    className={`arcade-button rounded-lg border px-2 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
                                        bet === amount
                                            ? "border-cyan-300/60 bg-cyan-300/14 text-cyan-100"
                                            : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20"
                                    }`}
                                    type="button"
                                >
                                    {amount}
                                </button>
                            ))}
                        </div>
                    </div>

                    {!canAfford && <p className="mt-4 text-xs uppercase tracking-[0.24em] text-rose-200">Not enough balance</p>}
                    {!isCustomBetValid && <p className="mt-2 text-xs uppercase tracking-[0.24em] text-rose-200">Enter a valid bet</p>}
                    {error && <p className="mt-2 text-xs uppercase tracking-[0.24em] text-rose-200">{error}</p>}

                    <button
                        onClick={() => void handleFlip()}
                        className="arcade-button mt-5 w-full rounded-2xl bg-amber-300 px-6 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={!canFlip || !isCustomBetValid}
                        type="button"
                    >
                        {isRequesting ? "Calling the house..." : isFlipping ? "Flipping..." : "Flip Coin"}
                    </button>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs uppercase tracking-[0.22em] text-amber-50/70">
                        Balance available
                        <div className="mt-2 font-display text-2xl tracking-normal text-white">₵ {formatCredits(balance)}</div>
                    </div>
                </aside>

                <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                    <div
                        className={`rounded-2xl border px-5 py-4 text-sm ${
                            outcomeTone === "win"
                                ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-100"
                                : outcomeTone === "lose"
                                    ? "border-rose-400/35 bg-rose-400/10 text-rose-100"
                                    : "border-amber-300/30 bg-amber-300/10 text-amber-50"
                        }`}
                    >
                        {result
                            ? result === choice
                                ? `Winner. ${result} landed and paid 1:1.`
                                : `Missed it. ${result} landed this round.`
                            : "Pick a side, lock a wager, and flip the coin."}
                    </div>

                    <div className="mt-6 flex flex-col items-center gap-6">
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

                        <div className="grid w-full gap-3 sm:grid-cols-3">
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
                                <p className="text-xs uppercase tracking-[0.25em] text-slate-300/70">Your call</p>
                                <p className="mt-2 font-display text-3xl text-white">{choice}</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
                                <p className="text-xs uppercase tracking-[0.25em] text-slate-300/70">Result</p>
                                <p className="mt-2 font-display text-3xl text-white">{result ?? "-"}</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
                                <p className="text-xs uppercase tracking-[0.25em] text-slate-300/70">Payout</p>
                                <p className="mt-2 font-display text-3xl text-white">
                                    {result ? (result === choice ? `+₵ ${formatCredits(bet)}` : "No return") : "Pending"}
                                </p>
                            </div>
                        </div>

                        {outcomeText && (
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
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}
