import { useRef, useState } from "react";
import type { SlotSpinResult } from "../lib/session";

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
};

const betOptions = [1, 5, 10, 25, 50, 100];
const minBet = 1;
const maxBet = 10000;
const randomSymbol = () => SYMBOL_NAMES[Math.floor(Math.random() * SYMBOL_NAMES.length)];

export function SlotGame({ balance, onSpin }: SlotGameProps) {
    const [reels, setReels] = useState<[string, string, string]>(["cherry", "cherry", "cherry"]);
    const [isSpinning, setIsSpinning] = useState(false);
    const [result, setResult] = useState<SlotSpinResult | null>(null);
    const [bet, setBet] = useState(10);
    const [customBet, setCustomBet] = useState("10");
    const [showPayouts, setShowPayouts] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const parsed = Number(customBet);
    const isCustomBetValid = Number.isFinite(parsed) && parsed >= minBet && parsed <= maxBet;
    const canAfford = bet <= balance;
    const canSpin = !isSpinning && canAfford && bet > 0;

    const handleSpin = async () => {
        if (!canSpin) return;
        setIsSpinning(true);
        setResult(null);

        const interval = setInterval(() => {
            setReels([randomSymbol(), randomSymbol(), randomSymbol()] as [string, string, string]);
        }, 80);

        try {
            const next = await onSpin(bet);
            clearInterval(interval);

            setReels(r => [next.reels[0], r[1], r[2]]);
            setTimeout(() => setReels(r => [r[0], next.reels[1], r[2]]), 200);
            setTimeout(() => {
                setReels(next.reels);
                setResult(next);
                setIsSpinning(false);
            }, 400);
        } catch (e) {
            clearInterval(interval);
            setIsSpinning(false);
            console.error("Spin failed:", e);
        }
    };

    const won = result?.outcome === "win";

    return (
        <section className="page-swap page-from-right w-full max-w-2xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
            <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Slots</p>
                <button
                    onClick={() => setShowPayouts(p => !p)}
                    className="text-xs uppercase tracking-[0.2em] text-slate-400/70 transition hover:text-white"
                    type="button"
                >
                    {showPayouts ? "Hide payouts" : "Payouts"}
                </button>
            </div>

            {showPayouts && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-left">
                    <p className="mb-3 text-[10px] uppercase tracking-[0.3em] text-slate-400/70">Payout Table</p>
                    {PAYOUT_TABLE.map((row, i) => (
                        <div key={i} className="flex items-center justify-between py-1 text-xs">
                            <span className="text-slate-200">
                                {row.label}{row.note ? <span className="ml-2 text-slate-400/60">({row.note})</span> : null}
                            </span>
                            <span className="font-semibold text-amber-300">{row.multiplier}x</span>
                        </div>
                    ))}
                </div>
            )}

            <div className="mt-8 flex flex-col items-center gap-6">
                {/* Reels */}
                <div className="flex items-center gap-4">
                    {reels.map((symbol, i) => (
                        <div
                            key={i}
                            className={`grid h-24 w-24 place-items-center rounded-2xl border text-5xl transition-all duration-150 ${
                                isSpinning
                                    ? "border-white/10 bg-white/5 blur-[2px]"
                                    : won
                                    ? "border-emerald-400/40 bg-emerald-400/10"
                                    : result
                                    ? "border-rose-400/40 bg-rose-400/10"
                                    : "border-white/10 bg-white/5"
                            }`}
                        >
                            {SYMBOL_MAP[symbol] ?? symbol}
                        </div>
                    ))}
                </div>

                {/* Result */}
                {result ? (
                    <div className={`result-pop rounded-2xl border px-6 py-4 ${
                        won ? "border-emerald-400/40 bg-emerald-400/10" : "border-rose-400/40 bg-rose-400/10"
                    }`}>
                        <div className={`text-sm uppercase tracking-[0.35em] ${won ? "text-emerald-200" : "text-rose-200"}`}>
                            {won ? `YOU WON — ${result.multiplier}x` : "YOU LOST"}
                        </div>
                        {won && (
                            <div className="mt-2 text-xs uppercase tracking-[0.3em] text-slate-200/70">
                                +₵ {result.payout - result.bet.amount}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
                        {isSpinning ? "Spinning..." : "Waiting for spin"}
                    </div>
                )}

                {/* Bet options */}
                <div className="w-full max-w-md">
                    <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
                        {betOptions.map(amount => (
                            <button
                                key={amount}
                                onClick={() => { setBet(amount); setCustomBet(String(amount)); setResult(null); }}
                                disabled={isSpinning || amount > balance}
                                className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition disabled:cursor-not-allowed disabled:opacity-50 ${
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
                                value={customBet}
                                onChange={e => {
                                    setCustomBet(e.target.value);
                                    const p = Number(e.target.value);
                                    if (Number.isFinite(p) && p >= minBet && p <= maxBet) {
                                        setBet(p);
                                        setResult(null);
                                    }
                                }}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
                                placeholder="Enter bet"
                                disabled={isSpinning}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => { if (isCustomBetValid) { setBet(parsed); setResult(null); } }}
                            disabled={isSpinning || !isCustomBetValid}
                            className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200 transition disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Set bet
                        </button>
                    </div>
                </div>

                {!canAfford && (
                    <div className="text-xs uppercase tracking-[0.3em] text-rose-300">Not enough balance</div>
                )}

                <button
                    onClick={() => void handleSpin()}
                    disabled={!canSpin}
                    className="rounded-full bg-cyan-500 px-8 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isSpinning ? "Spinning..." : "Spin"}
                </button>

                <div className="text-xs uppercase tracking-[0.3em] text-slate-300/80">
                    Current bet: ₵ {bet}
                </div>
            </div>
        </section>
    );
}