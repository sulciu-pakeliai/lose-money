import { useEffect, useMemo, useRef, useState } from "react";
import type { BetRecord, PlinkoDropResult, PlinkoDropSummary, PlinkoRisk } from "../lib/session";

type PlinkoGameProps = {
    balance: number;
    onDrop: (amount: number, risk: PlinkoRisk) => Promise<PlinkoDropResult>;
    onDropSettled: (result: PlinkoDropResult) => void;
    onOpenRules: () => void;
    onOutcomeReveal: (bet: BetRecord) => void;
};

type BallVisual = {
    id: string;
    left: number;
    top: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
    opacity: number;
    outcome?: "win" | "loss" | "push";
    finalSlot?: number;
    phase: "falling" | "exiting";
};

const betOptions = [10, 25, 50, 100, 250, 500];
const minBet = 1;
const maxBet = 10000;
const pegRows = 12;
const dropSegmentMs = 220;
const maxConcurrentDrops = 10;
const bucketCount = 13;
const laneLeftPercent = 7;
const laneWidthPercent = 86;
const laneGapPercent = laneWidthPercent / bucketCount;

const riskOptions: Array<{ risk: PlinkoRisk; label: string; note: string }> = [
    { risk: "low", label: "Low", note: "Steadier" },
    { risk: "medium", label: "Medium", note: "Balanced" },
    { risk: "high", label: "High", note: "Edge hunt" },
];

const multiplierTable: Record<PlinkoRisk, number[]> = {
    low: [5, 3, 2, 1.3, 1.1, 0.8, 0.5, 0.8, 1.1, 1.3, 2, 3, 5],
    medium: [16, 8, 4, 2, 1.4, 0.6, 0.3, 0.6, 1.4, 2, 4, 8, 16],
    high: [50, 20, 8, 3, 1.5, 0.4, 0.2, 0.4, 1.5, 3, 8, 20, 50],
};

function formatCredits(value: number) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatMultiplier(value: number) {
    return `${value.toFixed(value >= 10 ? 0 : value % 1 === 0 ? 0 : 1)}x`;
}

function easeOutBack(value: number) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2);
}

function easeInOutSine(value: number) {
    return -(Math.cos(Math.PI * value) - 1) / 2;
}

function quadraticBezier(start: number, control: number, end: number, progress: number) {
    const inverse = 1 - progress;
    return inverse * inverse * start + 2 * inverse * progress * control + progress * progress * end;
}

function pulseAt(progress: number, center: number, width: number) {
    const distance = Math.abs(progress - center);
    if (distance >= width) {
        return 0;
    }

    return 1 - distance / width;
}

function getPlinkoPosition(drop: PlinkoDropSummary, step: number) {
    if (step <= 0) {
        return { left: laneLeftPercent + (bucketCount / 2) * laneGapPercent, top: 4 };
    }

    if (step > drop.path.length) {
        return {
            left: laneLeftPercent + (drop.finalSlot + 0.5) * laneGapPercent,
            top: 88,
        };
    }

    const rightMoves = drop.path.slice(0, step).filter(direction => direction > 0).length;
    return {
        left: laneLeftPercent + ((bucketCount - step) / 2 + rightMoves) * laneGapPercent,
        top: 10 + step * 6.8,
    };
}

function bucketTone(multiplier: number) {
    if (multiplier >= 4) {
        return "border-rose-300/50 bg-rose-400/18 text-rose-100";
    }
    if (multiplier >= 1) {
        return "border-amber-300/45 bg-amber-300/12 text-amber-100";
    }
    return "border-cyan-300/35 bg-cyan-300/10 text-cyan-100";
}

function initialBall(id: string): BallVisual {
    return {
        id,
        left: 50,
        top: 4,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        phase: "falling",
    };
}

export function PlinkoGame({ balance, onDrop, onDropSettled, onOpenRules, onOutcomeReveal }: PlinkoGameProps) {
    const [bet, setBet] = useState(25);
    const [customBet, setCustomBet] = useState("25");
    const [risk, setRisk] = useState<PlinkoRisk>("medium");
    const [pendingDropCount, setPendingDropCount] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<PlinkoDropResult | null>(null);
    const [balls, setBalls] = useState<BallVisual[]>([]);
    const [activePegKeys, setActivePegKeys] = useState<string[]>([]);
    const [settledSlot, setSettledSlot] = useState<number | null>(null);
    const animationFrameRefs = useRef<Map<string, number>>(new Map());
    const timeoutRefs = useRef<number[]>([]);
    const impactedPegRefs = useRef<Set<string>>(new Set());
    const availableBalanceRef = useRef(balance);

    const pegs = useMemo(
        () =>
            Array.from({ length: pegRows }, (_, row) =>
                Array.from({ length: row + 3 }, (_, col) => ({
                    key: `${row}-${col}`,
                    left: laneLeftPercent + ((bucketCount - (row + 2)) / 2 + col) * laneGapPercent,
                    top: 12 + row * 6.8,
                })),
            ).flat(),
        [],
    );

    useEffect(() => {
        return () => {
            animationFrameRefs.current.forEach(frame => window.cancelAnimationFrame(frame));
            animationFrameRefs.current.clear();
            timeoutRefs.current.forEach(timeout => window.clearTimeout(timeout));
            timeoutRefs.current = [];
        };
    }, []);

    useEffect(() => {
        availableBalanceRef.current = balance;
    }, [balance]);

    const parsed = Number(customBet);
    const isCustomBetValid = Number.isFinite(parsed) && parsed >= minBet && parsed <= maxBet;
    const canAfford = bet <= balance;
    const activeDropCount = pendingDropCount + balls.filter(ball => ball.phase === "falling").length;
    const hasActiveDrops = activeDropCount > 0;
    const canReserveNextBet = canAfford;
    const canDrop = canAfford && canReserveNextBet && bet > 0 && isCustomBetValid && activeDropCount < maxConcurrentDrops;
    const currentMultipliers = multiplierTable[risk];
    const outcomeTone = result?.drop.outcome ?? (hasActiveDrops ? "active" : "idle");
    const highlightedSlot = settledSlot ?? result?.drop.finalSlot ?? null;

    const pulsePeg = (key: string, impactId: string) => {
        if (impactedPegRefs.current.has(impactId)) {
            return;
        }

        impactedPegRefs.current.add(impactId);
        setActivePegKeys(current => [...current, key]);
        const timeoutId = window.setTimeout(() => {
            setActivePegKeys(current => {
                const next = [...current];
                const index = next.indexOf(key);
                if (index >= 0) {
                    next.splice(index, 1);
                }
                return next;
            });
        }, 180);
        timeoutRefs.current.push(timeoutId);
    };

    const updateBall = (id: string, visual: Partial<BallVisual>) => {
        setBalls(current =>
            current.map(ball =>
                ball.id === id
                    ? {
                        ...ball,
                        ...visual,
                    }
                    : ball,
            ),
        );
    };

    const animateDrop = (response: PlinkoDropResult) => {
        const drop = response.drop;
        const ballId = response.bet.id;
        const totalSegments = drop.path.length + 1;
        const totalDuration = totalSegments * dropSegmentMs;
        let startedAt: number | null = null;

        setBalls(current => [...current, initialBall(ballId)]);
        setSettledSlot(null);

        const renderFrame = (timestamp: number) => {
            if (startedAt === null) {
                startedAt = timestamp;
            }

            const elapsed = Math.min(timestamp - startedAt, totalDuration);
            const segment = Math.min(Math.floor(elapsed / dropSegmentMs), totalSegments - 1);
            const localElapsed = elapsed - segment * dropSegmentMs;
            const localProgress = Math.min(1, localElapsed / dropSegmentMs);
            const travel = easeInOutSine(localProgress);
            const from = getPlinkoPosition(drop, segment);
            const to = getPlinkoPosition(drop, segment + 1);
            const direction = drop.path[segment] ?? 0;
            const sidePush = direction === 0 ? 0 : direction * 4.4;
            const controlLeft = (from.left + to.left) / 2 + sidePush;
            const controlTop = (from.top + to.top) / 2 - (segment < drop.path.length ? 6.2 : 1.6);
            const flightArc = Math.sin(localProgress * Math.PI) * 1.4;
            const impactSquash = segment < drop.path.length ? pulseAt(localProgress, 0.7, 0.11) : 0;
            const reboundStretch = segment < drop.path.length ? pulseAt(localProgress, 0.84, 0.14) : 0;
            const reboundLift = reboundStretch * 5.2;
            const impactDrop = impactSquash * 1.1;
            const sideRecoil = direction * reboundStretch * 1.9;
            const rightMovesBeforeImpact = drop.path.slice(0, segment).filter(next => next > 0).length;
            const pegKey = `${segment}-${rightMovesBeforeImpact + 1}`;

            if (segment < drop.path.length && localProgress > 0.64) {
                pulsePeg(pegKey, `${ballId}-${segment}`);
            }

            updateBall(ballId, {
                left: quadraticBezier(from.left, controlLeft, to.left, travel) + sideRecoil,
                top: quadraticBezier(from.top, controlTop, to.top, travel) - flightArc - reboundLift + impactDrop,
                rotation: (segment * 46 + localProgress * 112) * (direction >= 0 ? 1 : -1),
                scaleX: 1 + impactSquash * 0.34 - reboundStretch * 0.16,
                scaleY: 1 - impactSquash * 0.24 + reboundStretch * 0.22,
                opacity: 1,
            });

            if (elapsed < totalDuration) {
                const frame = window.requestAnimationFrame(renderFrame);
                animationFrameRefs.current.set(ballId, frame);
                return;
            }

            animationFrameRefs.current.delete(ballId);
            setSettledSlot(drop.finalSlot);
            setResult(response);
            onDropSettled(response);
            onOutcomeReveal(response.bet);
            updateBall(ballId, {
                left: getPlinkoPosition(drop, totalSegments).left,
                top: 101,
                rotation: (drop.finalSlot % 2 === 0 ? 1 : -1) * 28,
                scaleX: 0.74,
                scaleY: 1.18,
                opacity: 0,
                outcome: drop.outcome,
                finalSlot: drop.finalSlot,
                phase: "exiting",
            });

            const removeTimeout = window.setTimeout(() => {
                setBalls(current => current.filter(ball => ball.id !== ballId));
            }, 360);
            timeoutRefs.current.push(removeTimeout);
        };

        const frame = window.requestAnimationFrame(renderFrame);
        animationFrameRefs.current.set(ballId, frame);
    };

    const handleDrop = async () => {
        if (!canDrop || bet > availableBalanceRef.current) {
            return;
        }

        const nextBet = bet;
        const nextRisk = risk;
        availableBalanceRef.current -= nextBet;
        setPendingDropCount(current => current + 1);
        setError(null);
        setSettledSlot(null);

        try {
            const response = await onDrop(nextBet, nextRisk);
            animateDrop(response);
        } catch (requestError) {
            availableBalanceRef.current += nextBet;
            setError(requestError instanceof Error ? requestError.message : "Unable to drop Plinko ball");
        } finally {
            setPendingDropCount(current => Math.max(0, current - 1));
        }
    };

    return (
        <section className="game-shell game-shell-plinko page-swap page-from-right w-full max-w-5xl overflow-hidden rounded-3xl border border-cyan-300/20 bg-[linear-gradient(145deg,rgba(3,7,18,0.97),rgba(6,78,59,0.5)_48%,rgba(8,13,28,0.98))] p-6 shadow-[0_40px_120px_rgba(2,6,23,0.5)]">
            <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
                <aside className="rounded-3xl border border-white/10 bg-black/25 p-4">
                    <div>
                        <p className="game-eyebrow text-xs uppercase tracking-[0.3em] text-cyan-100/70">Plinko</p>
                        <h2 className="mt-2 font-display text-4xl text-white">Drop Board</h2>
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
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-300/70">Risk</p>
                        <div className="mt-2 grid gap-2">
                            {riskOptions.map(option => (
                                <button
                                    key={option.risk}
                                    onClick={() => {
                                        setRisk(option.risk);
                                        setResult(null);
                                        setError(null);
                                    }}
                                    disabled={hasActiveDrops}
                                    className={`arcade-button rounded-xl border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                        risk === option.risk
                                            ? "border-cyan-300/60 bg-cyan-300/14 text-cyan-100"
                                            : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20"
                                    }`}
                                    type="button"
                                >
                                    <span className="block font-display text-2xl leading-none">{option.label}</span>
                                    <span className="mt-1 block text-[10px] uppercase tracking-[0.22em] text-slate-300/70">{option.note}</span>
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
                                    setCustomBet(event.target.value);
                                    const next = Number(event.target.value);
                                    if (Number.isFinite(next) && next >= minBet && next <= maxBet) {
                                        setBet(next);
                                        setResult(null);
                                        setError(null);
                                    }
                                }}
                                className="min-w-0 flex-1 rounded-l-xl bg-transparent px-3 py-3 text-sm font-semibold text-white outline-none"
                                placeholder="Enter bet"
                                disabled={hasActiveDrops}
                            />
                            <button
                                onClick={() => {
                                    const nextBet = Math.max(minBet, Math.floor(bet / 2));
                                    setBet(nextBet);
                                    setCustomBet(String(nextBet));
                                }}
                                disabled={hasActiveDrops}
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
                                }}
                                disabled={hasActiveDrops}
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
                                    disabled={hasActiveDrops || amount > balance}
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
                    {activeDropCount >= maxConcurrentDrops && <p className="mt-2 text-xs uppercase tracking-[0.24em] text-amber-200">Let a few balls settle</p>}
                    {error && <p className="mt-2 text-xs uppercase tracking-[0.24em] text-rose-200">{error}</p>}

                    <button
                        onClick={() => void handleDrop()}
                        disabled={!canDrop}
                        className="arcade-button mt-5 w-full rounded-2xl bg-cyan-300 px-6 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                    >
                        {pendingDropCount > 0 ? "Dropping..." : "Drop Ball"}
                    </button>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs uppercase tracking-[0.22em] text-cyan-100/70">
                        Balance available
                        <div className="mt-2 font-display text-2xl tracking-normal text-white">₵ {formatCredits(balance)}</div>
                    </div>
                </aside>

                <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                    <div
                        className={`rounded-2xl border px-5 py-4 text-sm ${
                            outcomeTone === "win"
                                ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-100"
                                : outcomeTone === "loss"
                                    ? "border-rose-400/35 bg-rose-400/10 text-rose-100"
                                    : outcomeTone === "push"
                                        ? "border-amber-300/35 bg-amber-300/10 text-amber-100"
                                        : "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
                        }`}
                    >
                        {result
                            ? result.drop.outcome === "win"
                                ? `Winner. The last ball landed on ${formatMultiplier(result.drop.multiplier)}.`
                                : result.drop.outcome === "push"
                                    ? "Push. The last bucket returned your stake."
                                    : `The last ball landed on ${formatMultiplier(result.drop.multiplier)}.`
                            : hasActiveDrops
                                ? `${activeDropCount} ${activeDropCount === 1 ? "ball is" : "balls are"} live on the board.`
                                : "Set risk and wager, then drop the ball."}
                    </div>

                    <div className="plinko-board mt-5 rounded-3xl border border-white/10 bg-slate-950/50 p-4">
                        <div className="plinko-field">
                            <div className="plinko-dropper" />
                            {balls.map(ball => (
                                <div
                                    key={ball.id}
                                    className={`plinko-ball ${ball.phase === "exiting" ? "plinko-ball-exiting" : "plinko-ball-live"} ${ball.outcome ? `plinko-ball-${ball.outcome}` : ""}`}
                                    style={{
                                        left: `${ball.left}%`,
                                        top: `${ball.top}%`,
                                        opacity: ball.opacity,
                                        transform: `translate(-50%, -50%) rotate(${ball.rotation}deg) scale(${ball.scaleX}, ${ball.scaleY})`,
                                    }}
                                />
                            ))}
                            {pegs.map(peg => (
                                <span
                                    key={peg.key}
                                    className={`plinko-peg ${activePegKeys.includes(peg.key) ? "plinko-peg-active" : ""}`}
                                    style={{ left: `${peg.left}%`, top: `${peg.top}%` }}
                                />
                            ))}
                        </div>

                        <div className="plinko-bucket-row mt-3 grid grid-cols-13 gap-1">
                            {currentMultipliers.map((multiplier, index) => (
                                <div
                                    key={`${risk}-${index}`}
                                    className={`plinko-bucket rounded-lg border py-2 text-center font-display text-sm font-bold ${
                                        highlightedSlot === index ? "plinko-bucket-hit " : ""
                                    }${bucketTone(multiplier)}`}
                                >
                                    {formatMultiplier(multiplier)}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
                            <p className="text-xs uppercase tracking-[0.25em] text-slate-300/70">Live Balls</p>
                            <p className="mt-2 font-display text-3xl text-white">{activeDropCount}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
                            <p className="text-xs uppercase tracking-[0.25em] text-slate-300/70">Last Multiplier</p>
                            <p className="mt-2 font-display text-3xl text-white">{result ? formatMultiplier(result.drop.multiplier) : "-"}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
                            <p className="text-xs uppercase tracking-[0.25em] text-slate-300/70">Last Payout</p>
                            <p className="mt-2 font-display text-3xl text-white">
                                {result ? `₵ ${formatCredits(result.drop.payout)}` : "Pending"}
                            </p>
                        </div>
                    </div>

                    {result && (
                        <div
                            className={`result-pop mt-5 rounded-2xl border px-6 py-4 text-center ${
                                result.drop.outcome === "win"
                                    ? "border-emerald-400/40 bg-emerald-400/10"
                                    : result.drop.outcome === "push"
                                        ? "border-amber-300/40 bg-amber-300/10"
                                        : "border-rose-400/40 bg-rose-400/10"
                            }`}
                        >
                            <div className="text-sm uppercase tracking-[0.35em] text-slate-100">
                                {result.drop.outcome === "win"
                                    ? `LAST WIN - ${formatMultiplier(result.drop.multiplier)}`
                                    : result.drop.outcome === "push"
                                        ? "LAST PUSH"
                                        : "LAST LOSS"}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
