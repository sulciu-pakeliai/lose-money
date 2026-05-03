import { useEffect, useRef, useState } from "react";
import type { BetRecord, SlotSpinResult } from "../lib/session";

const SYMBOL_MAP: Record<string, string> = {
    cherry:  "🍒",
    lemon:   "🍋",
    orange:  "🍊",
    grape:   "🍇",
    diamond: "💎",
    seven:   "7️⃣",
};

const SYMBOL_NAMES = Object.keys(SYMBOL_MAP);

const PAYOUT_TABLE = [
    { label: "7️⃣ 7️⃣ 7️⃣",  multiplier: 30 },
    { label: "💎 💎 💎",     multiplier: 15 },
    { label: "🍇 🍇 🍇",     multiplier: 6  },
    { label: "🍊 🍊 🍊",     multiplier: 4  },
    { label: "🍋 🍋 🍋",     multiplier: 3  },
    { label: "🍒 🍒 🍒",     multiplier: 2  },
    { label: "🍒 🍒 any",    multiplier: 1, note: "break even" },
];

type SlotGameProps = {
    balance: number;
    onSpin: (amount: number) => Promise<SlotSpinResult>;
    onOpenRules: () => void;
    onOutcomeReveal: (bet: BetRecord) => void;
};

const betOptions = [1, 5, 10, 25, 50, 100];
const minBet = 1;
const maxBet = 10000;
const minSpinDurationMs = 850;
const reelStopDelayMs = 320;
const spinningSymbolLoop = [...SYMBOL_NAMES, ...SYMBOL_NAMES, ...SYMBOL_NAMES, ...SYMBOL_NAMES];

function wait(ms: number) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
}

function formatCredits(value: number) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function SlotReel({ symbol, isRolling, tone, index }: { symbol: string; isRolling: boolean; tone: "win" | "loss" | "idle"; index: number }) {
    const toneClass =
        tone === "win"
            ? "border-emerald-400/40 bg-emerald-400/10"
            : tone === "loss"
                ? "border-rose-400/40 bg-rose-400/10"
                : "border-white/10 bg-white/5";

    return (
        <div className={`slot-reel-window ${toneClass} ${isRolling ? "slot-reel-window-rolling" : "slot-reel-window-settled"}`}>
            {isRolling ? (
                <div className="slot-reel-strip" style={{ animationDelay: `${index * -140}ms` }}>
                    {spinningSymbolLoop.map((nextSymbol, symbolIndex) => (
                        <div key={`${index}-${nextSymbol}-${symbolIndex}`} className="slot-reel-symbol">
                            {SYMBOL_MAP[nextSymbol] ?? nextSymbol}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="slot-reel-final">
                    {SYMBOL_MAP[symbol] ?? symbol}
                </div>
            )}
        </div>
    );
}

export function SlotGame({ balance, onSpin, onOpenRules, onOutcomeReveal }: SlotGameProps) {
    const [reels, setReels] = useState<[string, string, string]>(["cherry", "cherry", "cherry"]);
    const [rollingReels, setRollingReels] = useState<[boolean, boolean, boolean]>([false, false, false]);
    const [isSpinning, setIsSpinning] = useState(false);
    const [result, setResult] = useState<SlotSpinResult | null>(null);
    const [bet, setBet] = useState(10);
    const [customBet, setCustomBet] = useState("10");
    const [showPayouts, setShowPayouts] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const stopTimeoutsRef = useRef<number[]>([]);

    useEffect(() => {
        return () => {
            stopTimeoutsRef.current.forEach(timeout => window.clearTimeout(timeout));
        };
    }, []);

    const parsed = Number(customBet);
    const isCustomBetValid = Number.isFinite(parsed) && parsed >= minBet && parsed <= maxBet;
    const canAfford = bet <= balance;
    const canSpin = !isSpinning && canAfford && bet > 0;

    const handleSpin = async () => {
        if (!canSpin) return;
        stopTimeoutsRef.current.forEach(timeout => window.clearTimeout(timeout));
        stopTimeoutsRef.current = [];
        setIsSpinning(true);
        setRollingReels([true, true, true]);
        setError(null);
        setResult(null);

        try {
            const [next] = await Promise.all([onSpin(bet), wait(minSpinDurationMs)]);

            next.reels.forEach((symbol, index) => {
                const timeoutId = window.setTimeout(() => {
                    setReels(current => {
                        const updated = [...current] as [string, string, string];
                        updated[index] = symbol;
                        return updated;
                    });
                    setRollingReels(current => {
                        const updated = [...current] as [boolean, boolean, boolean];
                        updated[index] = false;
                        return updated;
                    });
                }, index * reelStopDelayMs);
                stopTimeoutsRef.current.push(timeoutId);
            });

            const finalTimeoutId = window.setTimeout(() => {
                setResult(next);
                onOutcomeReveal(next.bet);
                setIsSpinning(false);
                stopTimeoutsRef.current = [];
            }, (next.reels.length - 1) * reelStopDelayMs + 180);
            stopTimeoutsRef.current.push(finalTimeoutId);
        } catch (e) {
            stopTimeoutsRef.current.forEach(timeout => window.clearTimeout(timeout));
            stopTimeoutsRef.current = [];
            setRollingReels([false, false, false]);
            setIsSpinning(false);
            setError(e instanceof Error ? e.message : "Unable to resolve slot spin");
        }
    };

    const won = result?.outcome === "win";
    const reelTone = result ? (won ? "win" : "loss") : "idle";

    return (
        <section className="game-shell game-shell-slots page-swap page-from-right w-full max-w-5xl overflow-hidden rounded-3xl border border-fuchsia-300/20 bg-[linear-gradient(145deg,rgba(17,24,39,0.97),rgba(67,20,89,0.52)_50%,rgba(8,13,28,0.98))] p-6 shadow-[0_40px_120px_rgba(2,6,23,0.5)]">
            <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
                <aside className="rounded-3xl border border-white/10 bg-black/25 p-4">
                    <div>
                        <p className="game-eyebrow text-xs uppercase tracking-[0.3em] text-fuchsia-100/70">Slots</p>
                        <h2 className="mt-2 font-display text-4xl text-white">Triple Reels</h2>
                    </div>

                    <div className="mt-4 flex gap-2">
                        <button
                            onClick={onOpenRules}
                            className="arcade-button rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-100 transition hover:border-white/20 hover:bg-white/10"
                            type="button"
                        >
                            Rules
                        </button>
                        <button
                            onClick={() => setShowPayouts(p => !p)}
                            className="arcade-button rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-100 transition hover:border-white/20 hover:bg-white/10"
                            type="button"
                        >
                            {showPayouts ? "Hide payouts" : "Payouts"}
                        </button>
                    </div>

                    <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-300/70">Current Wager</p>
                        <p className="mt-2 font-display text-3xl text-white">₵ {formatCredits(bet)}</p>
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
                                onChange={e => {
                                    setCustomBet(e.target.value);
                                    const p = Number(e.target.value);
                                    if (Number.isFinite(p) && p >= minBet && p <= maxBet) {
                                        setBet(p);
                                        setResult(null);
                                        setError(null);
                                    }
                                }}
                                className="min-w-0 flex-1 rounded-l-xl bg-transparent px-3 py-3 text-sm font-semibold text-white outline-none"
                                placeholder="Enter bet"
                                disabled={isSpinning}
                            />
                            <button
                                onClick={() => {
                                    const nextBet = Math.max(minBet, Math.floor(bet / 2));
                                    setBet(nextBet);
                                    setCustomBet(String(nextBet));
                                    setResult(null);
                                    setError(null);
                                }}
                                disabled={isSpinning}
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
                                    setResult(null);
                                    setError(null);
                                }}
                                disabled={isSpinning}
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
                                        setResult(null);
                                        setError(null);
                                    }}
                                    disabled={isSpinning || amount > balance}
                                    className={`arcade-button rounded-lg border px-2 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
                                        bet === amount
                                            ? "border-fuchsia-300/60 bg-fuchsia-300/10 text-fuchsia-100"
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
                        onClick={() => void handleSpin()}
                        disabled={!canSpin || !isCustomBetValid}
                        className="arcade-button mt-5 w-full rounded-2xl bg-fuchsia-300 px-6 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-slate-950 transition hover:bg-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                    >
                        {isSpinning ? "Spinning..." : "Spin Reels"}
                    </button>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs uppercase tracking-[0.22em] text-fuchsia-100/70">
                        Balance available
                        <div className="mt-2 font-display text-2xl tracking-normal text-white">₵ {formatCredits(balance)}</div>
                    </div>
                </aside>

                <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                    <div
                        className={`rounded-2xl border px-5 py-4 text-sm ${
                            result
                                ? won
                                    ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-100"
                                    : "border-rose-400/35 bg-rose-400/10 text-rose-100"
                                : "border-fuchsia-300/30 bg-fuchsia-300/10 text-fuchsia-100"
                        }`}
                    >
                        {result
                            ? won
                                ? `Winner. ${result.multiplier}x hit on that line.`
                                : "No line this spin. Try another pull."
                            : isSpinning
                                ? "Reels are rolling..."
                                : "Set a wager, spin the machine, and chase a line."}
                    </div>

                    {showPayouts && (
                        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-left">
                            <p className="mb-3 text-[10px] uppercase tracking-[0.3em] text-slate-400/70">Payout Table</p>
                            {PAYOUT_TABLE.map((row, i) => (
                                <div key={i} className="flex items-center justify-between py-1 text-xs">
                                    <span className="text-slate-200">
                                        {row.label}{row.note ? <span className="ml-2 text-slate-400/60">({row.note})</span> : null}
                                    </span>
                                    <span className="font-semibold text-fuchsia-200">{row.multiplier}x</span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="mt-6 flex flex-col items-center gap-6">
                        <div className="flex items-center gap-4">
                            {reels.map((symbol, i) => (
                                <SlotReel
                                    key={i}
                                    symbol={symbol}
                                    isRolling={rollingReels[i] ?? false}
                                    tone={reelTone}
                                    index={i}
                                />
                            ))}
                        </div>

                        <div className="grid w-full gap-3 sm:grid-cols-3">
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
                                <p className="text-xs uppercase tracking-[0.25em] text-slate-300/70">Outcome</p>
                                <p className="mt-2 font-display text-3xl text-white">{result ? (won ? "Win" : "Loss") : "-"}</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
                                <p className="text-xs uppercase tracking-[0.25em] text-slate-300/70">Multiplier</p>
                                <p className="mt-2 font-display text-3xl text-white">{result ? `${result.multiplier}x` : "-"}</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
                                <p className="text-xs uppercase tracking-[0.25em] text-slate-300/70">Payout</p>
                                <p className="mt-2 font-display text-3xl text-white">
                                    {result ? (won ? `+₵ ${formatCredits(result.payout - result.bet.amount)}` : "No return") : "Pending"}
                                </p>
                            </div>
                        </div>

                        {result && (
                            <div
                                className={`result-pop rounded-2xl border px-6 py-4 ${
                                    won ? "border-emerald-400/40 bg-emerald-400/10" : "border-rose-400/40 bg-rose-400/10"
                                }`}
                            >
                                <div className={`text-sm uppercase tracking-[0.35em] ${won ? "text-emerald-200" : "text-rose-200"}`}>
                                    {won ? `YOU WON - ${result.multiplier}x` : "YOU LOST"}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}
