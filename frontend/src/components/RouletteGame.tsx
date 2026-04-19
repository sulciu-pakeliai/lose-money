import { useEffect, useMemo, useState } from "react";
import type { BetRecord, RouletteBetType, RouletteResult } from "../lib/session";

const betOptions = [10, 25, 50, 100, 250, 500];
const minBet = 1;
const maxBet = 10000;
const wheelNumbers = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const segmentAngle = 360 / wheelNumbers.length;

const isRed = (number: number) =>
    [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(number);

const colorOptions = ["red", "black"] as const;

type RouletteGameProps = {
    balance: number;
    onSpin: (betType: RouletteBetType, choice: string, amount: number) => Promise<RouletteResult>;
    onOpenRules: () => void;
    onOutcomeReveal: (bet: BetRecord) => void;
};

export function RouletteGame({ balance, onSpin, onOpenRules, onOutcomeReveal }: RouletteGameProps) {
    const [betType, setBetType] = useState<RouletteBetType>("number");
    const [numberChoice, setNumberChoice] = useState<string>("17");
    const [colorChoice, setColorChoice] = useState<"red" | "black">("red");
    const [bet, setBet] = useState<number>(25);
    const [customBet, setCustomBet] = useState<string>("25");
    const [isRequesting, setIsRequesting] = useState(false);
    const [isSpinning, setIsSpinning] = useState(false);
    const [revealOutcome, setRevealOutcome] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [spinResult, setSpinResult] = useState<RouletteResult | null>(null);
    const [rotation, setRotation] = useState(0);

    const choice = betType === "number" ? numberChoice : colorChoice;
    const parsedCustomBet = Number(customBet);
    const isCustomBetValid = Number.isFinite(parsedCustomBet) && parsedCustomBet >= minBet && parsedCustomBet <= maxBet;
    const canAfford = bet <= balance;
    const canSpin = !isRequesting && !isSpinning && canAfford && bet > 0;

    const wheelSegments = useMemo(() => {
        const wheelRadius = 170;
        const labelRadius = 115;
        const center = 180;

        return wheelNumbers.map((number, index) => {
            const startAngle = -90 + index * segmentAngle;
            const endAngle = startAngle + segmentAngle;
            const startRad = (startAngle * Math.PI) / 180;
            const endRad = (endAngle * Math.PI) / 180;
            const x1 = center + Math.cos(startRad) * wheelRadius;
            const y1 = center + Math.sin(startRad) * wheelRadius;
            const x2 = center + Math.cos(endRad) * wheelRadius;
            const y2 = center + Math.sin(endRad) * wheelRadius;
            const midAngle = startAngle + segmentAngle / 2;
            const midRad = (midAngle * Math.PI) / 180;
            const labelX = center + Math.cos(midRad) * labelRadius;
            const labelY = center + Math.sin(midRad) * labelRadius;

            return {
                number,
                color: number === 0 ? "green" : isRed(number) ? "red" : "black",
                path: `M ${center} ${center} L ${x1} ${y1} A ${wheelRadius} ${wheelRadius} 0 0 1 ${x2} ${y2} Z`,
                labelX,
                labelY,
            };
        });
    }, []);

    useEffect(() => {
        if (bet > balance && balance > 0) {
            const nextBet = Math.min(balance, betOptions[0] ?? balance);
            setBet(nextBet);
            setCustomBet(String(nextBet));
        }
    }, [balance, bet]);

    useEffect(() => {
        if (!spinResult) {
            return;
        }

        const targetIndex = wheelNumbers.indexOf(spinResult.spin.number);
        if (targetIndex < 0) {
            return;
        }

        const extraSpin = 5 * 360;
        const desiredRotation = -(targetIndex + 0.5) * segmentAngle;

        setIsSpinning(true);
        setRevealOutcome(false);
        setRotation((prev: number) => {
            const currentModulo = ((prev % 360) + 360) % 360;
            const normalizedDesired = ((desiredRotation % 360) + 360) % 360;
            const additionalRotation = extraSpin + ((normalizedDesired - currentModulo + 360) % 360);
            return prev + additionalRotation;
        });

        let revealTimeout: number | undefined;
        const spinTimeout = window.setTimeout(() => {
            setIsSpinning(false);
            revealTimeout = window.setTimeout(() => {
                setRevealOutcome(true);
            }, 700);
        }, 2600);

        return () => {
            window.clearTimeout(spinTimeout);
            if (revealTimeout !== undefined) {
                window.clearTimeout(revealTimeout);
            }
        };
    }, [spinResult]);

    const handleSpin = async () => {
        if (!canSpin) {
            return;
        }

        setError(null);
        setIsRequesting(true);
        setSpinResult(null);

        try {
            const response = await onSpin(betType, choice, bet);
            setSpinResult(response);
            onOutcomeReveal(response.bet);
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Unable to spin the wheel");
        } finally {
            setIsRequesting(false);
        }
    };

    const selectedNumber = spinResult?.spin.number;
    const selectedColor = spinResult?.spin.color ?? "green";
    const resultTone = spinResult && revealOutcome ? (spinResult.bet.outcome === "win" ? "win" : "loss") : "idle";

    return (
        <section className="game-shell game-shell-roulette page-swap page-from-right w-full max-w-5xl rounded-4xl border border-fuchsia-300/20 bg-[radial-gradient(circle_at_top,_rgba(190,18,60,0.18),_rgba(15,23,42,0.96)_48%,_rgba(8,15,33,0.98)_100%)] p-6 shadow-[0_40px_120px_rgba(2,6,23,0.45)]">
            <div className="flex flex-col gap-6 lg:flex-row">
                <div className="space-y-4 lg:w-7/12">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-[0.3em] text-rose-200/70">Roulette</p>
                            <h2 className="mt-2 font-display text-4xl text-white">Roulette Royale</h2>
                        </div>
                        <button
                            onClick={onOpenRules}
                            className="arcade-button rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-200 transition hover:border-white/20 hover:bg-white/10"
                            type="button"
                        >
                            Rules
                        </button>
                    </div>

                    <div className={`rounded-3xl border px-5 py-4 text-sm ${
                        resultTone === "win"
                            ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-100"
                            : resultTone === "loss"
                            ? "border-rose-400/35 bg-rose-400/10 text-rose-100"
                            : "border-fuchsia-300/30 bg-fuchsia-300/10 text-fuchsia-100"
                    }`}>
                        {spinResult ? (
                            revealOutcome ? (
                                <>
                                    <div className="text-sm uppercase tracking-[0.3em] text-slate-200">Result</div>
                                    <div className="mt-2 text-3xl font-display text-white">
                                        {spinResult.spin.number} {formatRouletteLabel(spinResult.spin.color)}
                                    </div>
                                    <div className="mt-3 text-sm uppercase tracking-[0.3em] text-white/70">
                                        {spinResult.bet.outcome === "win" ? "Winner" : "Missed"}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="text-sm uppercase tracking-[0.3em] text-slate-200">Spinning</div>
                                    <div className="mt-2 text-3xl font-display text-white">Please wait…</div>
                                    <div className="mt-3 text-sm uppercase tracking-[0.3em] text-white/70">
                                        Wheel is spinning, outcome will appear after it stops.
                                    </div>
                                </>
                            )
                        ) : (
                            <span>Choose a number or color, place your wager, and spin the wheel.</span>
                        )}
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
                        <div className="roulette-board">
                            <div className="roulette-pointer" />
                            <div className="roulette-wheel">
                                <svg
                                    viewBox="0 0 360 360"
                                    className="roulette-wheel-svg"
                                    aria-hidden="true"
                                    style={{ transform: `rotate(${rotation}deg)` }}
                                >
                                    <g className="roulette-wheel-inner">
                                        {wheelSegments.map(segment => (
                                            <g key={segment.number}>
                                                <path
                                                    d={segment.path}
                                                    className="roulette-segment"
                                                    fill={
                                                        segment.color === "green"
                                                            ? "#10b981"
                                                            : segment.color === "red"
                                                            ? "#ef4444"
                                                            : "#111827"
                                                    }
                                                />
                                                <text
                                                    x={segment.labelX}
                                                    y={segment.labelY}
                                                    className="roulette-segment-label"
                                                    textAnchor="middle"
                                                    dominantBaseline="middle"
                                                >
                                                    {segment.number}
                                                </text>
                                            </g>
                                        ))}
                                    </g>
                                    <circle cx="180" cy="180" r="90" className="roulette-center-plate" />
                                </svg>
                                <div className="roulette-center-overlay">
                                    <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Win</div>
                                    <div className="mt-1 text-5xl font-display text-white">{revealOutcome ? selectedNumber : "--"}</div>
                                    <div className="mt-1 text-xs uppercase tracking-[0.28em] text-slate-300">{revealOutcome ? formatRouletteLabel(selectedColor) : "Spinning..."}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {spinResult && revealOutcome && (
                        <div className="result-pop rounded-3xl border px-5 py-4 bg-white/5 text-white/90">
                            <div className="flex items-center justify-between gap-4 text-sm uppercase tracking-[0.24em] text-slate-300">
                                <span>Result</span>
                                <span>{spinResult.spin.betType === "number" ? "Number" : "Color"}</span>
                            </div>
                            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Call</div>
                                    <div className="mt-1 font-display text-2xl text-white">{formatRouletteLabel(spinResult.spin.choice)}</div>
                                </div>
                                <div>
                                    <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Payout</div>
                                    <div className="mt-1 font-display text-2xl text-white">
                                        {spinResult.spin.won ? `+₵ ${formatCredits(bet * spinResult.spin.profitMultiplier)}` : "No return"}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="lg:w-5/12">
                    <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Current balance</p>
                                <div className="mt-2 text-3xl font-display text-white">₵ {formatCredits(balance)}</div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
                                {betType === "number" ? "Number Bet" : "Color Bet"}
                            </div>
                        </div>

                        <div className="mt-6 grid gap-3">
                            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                                <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Bet type</p>
                                <div className="mt-3 grid grid-cols-2 gap-3">
                                    {(["number", "color"] as RouletteBetType[]).map(type => (
                                        <button
                                            key={type}
                                            type="button"
                                            onClick={() => {
                                                setBetType(type);
                                                setError(null);
                                                setSpinResult(null);
                                            }}
                                            className={`arcade-button rounded-2xl border px-4 py-3 text-left text-sm font-semibold uppercase tracking-[0.18em] transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                                betType === type
                                                    ? "border-amber-300/60 bg-amber-300/12 text-amber-100"
                                                    : "border-white/10 bg-white/5 text-slate-200/70 hover:border-white/20"
                                            }`}
                                        >
                                            {type === "number" ? "Specific Number" : "Red or Black"}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {betType === "number" ? (
                                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                                    <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Number</p>
                                    <div className="mt-3 flex items-center gap-3">
                                        <input
                                            type="number"
                                            min={0}
                                            max={36}
                                            value={numberChoice}
                                            onChange={event => {
                                                const value = event.target.value;
                                                setNumberChoice(value);
                                                setError(null);
                                                setSpinResult(null);
                                            }}
                                            className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-lg text-white outline-none transition focus:border-amber-300/60"
                                        />
                                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
                                            0-36
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                                    <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Color</p>
                                    <div className="mt-3 grid grid-cols-2 gap-3">
                                        {colorOptions.map(color => (
                                            <button
                                                key={color}
                                                type="button"
                                                onClick={() => {
                                                    setColorChoice(color);
                                                    setError(null);
                                                    setSpinResult(null);
                                                }}
                                                className={`arcade-button rounded-2xl border px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] transition ${
                                                    colorChoice === color
                                                        ? color === "red"
                                                            ? "border-red-400/60 bg-red-400/12 text-red-100"
                                                            : "border-slate-300/60 bg-slate-300/12 text-slate-100"
                                                        : "border-white/10 bg-white/5 text-slate-200/70 hover:border-white/20"
                                                }`}
                                            >
                                                {color.toUpperCase()}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                                <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Wager</p>
                                <div className="mt-3 grid grid-cols-3 gap-3">
                                    {betOptions.map(amount => (
                                        <button
                                            key={amount}
                                            onClick={() => {
                                                setBet(amount);
                                                setCustomBet(String(amount));
                                                setError(null);
                                                setSpinResult(null);
                                            }}
                                            disabled={amount > balance}
                                            className={`arcade-button rounded-2xl border px-3 py-3 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                                                bet === amount
                                                    ? "border-amber-300/60 bg-amber-300/12 text-amber-100"
                                                    : "border-white/10 bg-white/5 text-slate-200/70 hover:border-white/20"
                                            } disabled:cursor-not-allowed disabled:opacity-50`}
                                            type="button"
                                        >
                                            {amount}
                                        </button>
                                    ))}
                                </div>
                                <div className="mt-4 flex items-center gap-3">
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
                                                setSpinResult(null);
                                            }
                                        }}
                                        className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-300/60"
                                        placeholder="Custom bet"
                                        disabled={isRequesting || isSpinning}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!isCustomBetValid) return;
                                            setBet(parsedCustomBet);
                                            setError(null);
                                            setSpinResult(null);
                                        }}
                                        disabled={isRequesting || isSpinning || !isCustomBetValid}
                                        className="arcade-button rounded-full border border-amber-300/40 bg-amber-300/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-100 transition disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Set
                                    </button>
                                </div>
                            </div>

                            {error && <div className="text-xs uppercase tracking-[0.3em] text-rose-200">{error}</div>}
                            {!canAfford && <div className="text-xs uppercase tracking-[0.3em] text-rose-200">Not enough balance</div>}

                            <button
                                onClick={handleSpin}
                                disabled={!canSpin}
                                className="arcade-button mt-2 w-full rounded-full bg-amber-400 px-6 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isRequesting ? "Calling the wheel..." : isSpinning ? "Spinning..." : "Spin the Wheel"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

function formatCredits(value: number) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatRouletteLabel(value: string) {
    if (!value) {
        return value;
    }

    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
