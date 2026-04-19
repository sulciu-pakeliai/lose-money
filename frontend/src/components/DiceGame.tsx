import { useEffect, useRef, useState } from "react";
import type { BetRecord, DiceBetType, DiceRollResult, DiceRollSummary } from "../lib/session";

type DiceGameProps = {
    balance: number;
    onRoll: (betType: DiceBetType, amount: number) => Promise<DiceRollResult>;
    onOpenRules: () => void;
    onOutcomeReveal: (bet: BetRecord) => void;
};

const betOptions = [10, 25, 50, 100, 250, 500];
const minBet = 1;
const maxBet = 10000;
const rollDurationMs = 1600;

const laneMeta: Record<DiceBetType, { label: string; subtitle: string; accent: string }> = {
    low: {
        label: "Low 2-6",
        subtitle: "Pays 1:1",
        accent: "border-cyan-300/40 bg-cyan-300/10 text-cyan-100",
    },
    lucky7: {
        label: "Lucky 7",
        subtitle: "Pays 4:1",
        accent: "border-amber-300/40 bg-amber-300/12 text-amber-100",
    },
    high: {
        label: "High 8-12",
        subtitle: "Pays 1:1",
        accent: "border-rose-300/40 bg-rose-300/10 text-rose-100",
    },
};

const pipLayouts: Record<number, Array<[number, number]>> = {
    1: [[50, 50]],
    2: [[28, 28], [72, 72]],
    3: [[28, 28], [50, 50], [72, 72]],
    4: [[28, 28], [72, 28], [28, 72], [72, 72]],
    5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
    6: [[28, 28], [72, 28], [28, 50], [72, 50], [28, 72], [72, 72]],
};

function formatCredits(value: number) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function randomDieFace() {
    return Math.floor(Math.random() * 6) + 1;
}

function DiceFace({ value, rolling = false }: { value: number; rolling?: boolean }) {
    const layout: Array<[number, number]> = pipLayouts[value] ?? [[50, 50]];

    return (
        <div className={`die-face ${rolling ? "die-face-rolling" : ""}`}>
            {layout.map(([left, top], index) => (
                <span
                    key={`${value}-${left}-${top}-${index}`}
                    className="die-pip"
                    style={{ left: `${left}%`, top: `${top}%` }}
                />
            ))}
        </div>
    );
}

export function DiceGame({ balance, onRoll, onOpenRules, onOutcomeReveal }: DiceGameProps) {
    const [betType, setBetType] = useState<DiceBetType>("lucky7");
    const [bet, setBet] = useState<number>(25);
    const [customBet, setCustomBet] = useState<string>("25");
    const [isRequesting, setIsRequesting] = useState(false);
    const [isRolling, setIsRolling] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [roll, setRoll] = useState<DiceRollSummary | null>(null);
    const [displayedDice, setDisplayedDice] = useState<[number, number]>([2, 5]);
    const animationIntervalRef = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (animationIntervalRef.current !== null) {
                window.clearInterval(animationIntervalRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (bet > balance && balance > 0) {
            const nextBet = Math.min(balance, betOptions[0] ?? balance);
            setBet(nextBet);
            setCustomBet(String(nextBet));
        }
    }, [balance, bet]);

    const parsedCustomBet = Number(customBet);
    const isCustomBetValid =
        Number.isFinite(parsedCustomBet) && parsedCustomBet >= minBet && parsedCustomBet <= maxBet;
    const canAfford = bet <= balance;
    const isBusy = isRequesting || isRolling;
    const canRoll = !isBusy && canAfford && bet > 0;

    const handleRoll = async () => {
        if (!canRoll) {
            return;
        }

        setError(null);
        setRoll(null);
        setIsRequesting(true);

        try {
            const response = await onRoll(betType, bet);

            setIsRequesting(false);
            setIsRolling(true);
            animationIntervalRef.current = window.setInterval(() => {
                setDisplayedDice([randomDieFace(), randomDieFace()]);
            }, 90);

            await new Promise(resolve => window.setTimeout(resolve, rollDurationMs));

            setDisplayedDice([response.roll.dieOne, response.roll.dieTwo]);
            setRoll(response.roll);
            onOutcomeReveal(response.bet);
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Unable to resolve dice roll");
        } finally {
            if (animationIntervalRef.current !== null) {
                window.clearInterval(animationIntervalRef.current);
                animationIntervalRef.current = null;
            }
            setIsRequesting(false);
            setIsRolling(false);
        }
    };

    const outcomeTone = roll ? (roll.won ? "win" : "loss") : "idle";

    return (
        <section className="game-shell game-shell-dice page-swap page-from-right w-full max-w-5xl overflow-hidden rounded-4xl border border-amber-300/20 bg-[radial-gradient(circle_at_top,rgba(120,53,15,0.68),rgba(41,37,36,0.92)_38%,rgba(15,23,42,0.98)_100%)] p-6 shadow-[0_40px_120px_rgba(2,6,23,0.45)]">
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-amber-100/70">Dice</p>
                        <h2 className="mt-2 font-display text-4xl text-white">Lucky 7</h2>
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
                            <p className="text-xs uppercase tracking-[0.28em] text-amber-100/60">Wager</p>
                            <p className="mt-2 font-display text-3xl text-white">₵ {formatCredits(bet)}</p>
                        </div>
                    </div>
                </div>

                <div
                    className={`rounded-3xl border px-5 py-4 text-sm ${
                        outcomeTone === "win"
                            ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-100"
                            : outcomeTone === "loss"
                                ? "border-rose-400/35 bg-rose-400/10 text-rose-100"
                                : "border-amber-300/30 bg-amber-300/10 text-amber-50"
                    }`}
                >
                    {roll
                        ? roll.won
                            ? `Winner. Total ${roll.total} hit your call.`
                            : `Missed it. The dice settled on ${roll.total}.`
                        : "Pick a lane, set a wager, and throw the bones."}
                </div>

                <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
                    <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                        <div className="dice-stage">
                            <div className="dice-tray">
                                <DiceFace value={displayedDice[0]} rolling={isRolling} />
                                <DiceFace value={displayedDice[1]} rolling={isRolling} />
                            </div>
                            <div className="mt-6 text-center">
                                <p className="text-xs uppercase tracking-[0.3em] text-amber-100/60">Table total</p>
                                <p className="mt-2 font-display text-5xl text-white">{roll?.total ?? displayedDice[0] + displayedDice[1]}</p>
                            </div>
                        </div>

                        <div className="mt-6 grid gap-3 md:grid-cols-3">
                            {(Object.keys(laneMeta) as DiceBetType[]).map(type => (
                                <button
                                    key={type}
                                    onClick={() => {
                                        setBetType(type);
                                        setError(null);
                                        setRoll(null);
                                    }}
                                    disabled={isBusy}
                                    className={`arcade-button rounded-2xl border px-4 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                        betType === type
                                            ? laneMeta[type].accent
                                            : "border-white/10 bg-white/5 text-slate-200/75 hover:border-white/20"
                                    }`}
                                    type="button"
                                >
                                    <div className="text-xs uppercase tracking-[0.24em]">{laneMeta[type].subtitle}</div>
                                    <div className="mt-2 font-display text-3xl">{laneMeta[type].label}</div>
                                </button>
                            ))}
                        </div>

                        {roll && (
                            <div
                                className={`result-pop mt-6 rounded-3xl border px-5 py-4 ${
                                    roll.won ? "border-emerald-400/35 bg-emerald-400/10" : "border-rose-400/35 bg-rose-400/10"
                                }`}
                            >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <p className="text-xs uppercase tracking-[0.3em] text-slate-200/70">Last result</p>
                                        <p className="mt-2 font-display text-3xl text-white">
                                            {roll.dieOne} + {roll.dieTwo} = {roll.total}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs uppercase tracking-[0.3em] text-slate-200/70">Payout</p>
                                        <p className="mt-2 font-display text-3xl text-white">
                                            {roll.won ? `+₵ ${formatCredits(bet * roll.profitMultiplier)}` : "No return"}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
                        <p className="text-xs uppercase tracking-[0.3em] text-amber-100/60">Controls</p>

                        <div className="mt-5 grid grid-cols-3 gap-3">
                            {betOptions.map(amount => (
                                <button
                                    key={amount}
                                    onClick={() => {
                                        setBet(amount);
                                        setCustomBet(String(amount));
                                        setError(null);
                                        setRoll(null);
                                    }}
                                    disabled={isBusy || amount > balance}
                                    className={`arcade-button rounded-2xl border px-3 py-3 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                                        bet === amount
                                            ? "border-amber-300/60 bg-amber-300/12 text-amber-100"
                                            : "border-white/10 bg-white/5 text-slate-200/75 hover:border-white/20"
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
                                        setRoll(null);
                                    }
                                }}
                                className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-300/60"
                                placeholder="Enter bet"
                                disabled={isBusy}
                            />
                            <button
                                onClick={() => {
                                    if (!isCustomBetValid) {
                                        return;
                                    }
                                    setBet(parsedCustomBet);
                                    setError(null);
                                    setRoll(null);
                                }}
                                disabled={isBusy || !isCustomBetValid}
                                className="arcade-button rounded-2xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-amber-100 transition disabled:cursor-not-allowed disabled:opacity-50"
                                type="button"
                            >
                                Set
                            </button>
                        </div>

                        {!canAfford && (
                            <p className="mt-4 text-xs uppercase tracking-[0.24em] text-rose-200">Not enough balance</p>
                        )}

                        {error && <p className="mt-4 text-xs uppercase tracking-[0.24em] text-rose-200">{error}</p>}

                        <button
                            onClick={() => void handleRoll()}
                            disabled={!canRoll}
                            className="arcade-button mt-5 w-full rounded-2xl bg-amber-300 px-6 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                            type="button"
                        >
                            {isRequesting ? "Calling the table..." : isRolling ? "Rolling..." : "Roll Dice"}
                        </button>

                        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs uppercase tracking-[0.22em] text-amber-50/70">
                            Balance available
                            <div className="mt-2 font-display text-2xl tracking-normal text-white">₵ {formatCredits(balance)}</div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
