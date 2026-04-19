import { useEffect, useMemo, useRef, useState } from "react";
import type { BetRecord, CrashCashoutResult, CrashGameState, CrashStartResult } from "../lib/session";

type CrashGameProps = {
    balance: number;
    game: CrashGameState | null;
    onStart: (amount: number) => Promise<CrashStartResult>;
    onCashout: () => Promise<CrashCashoutResult>;
    onOpenRules: () => void;
    onOutcomeReveal: (bet: BetRecord) => void;
};

const betOptions = [10, 25, 50, 100, 250, 500];
const minBet = 1;
const maxBet = 10000;

function formatCredits(value: number) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatMultiplier(value: number) {
    return `${value.toFixed(2)}x`;
}

function multiplierForElapsed(ms: number) {
    if (ms <= 0) {
        return 1;
    }
    return 1 + Math.pow(ms / 2800, 1.42);
}

function getInitialMultiplier(game: CrashGameState | null) {
    if (!game) {
        return 1;
    }
    if (game.status === "active") {
        const elapsed = Math.max(0, Date.now() - new Date(game.startedAt).getTime());
        return Math.min(game.crashMultiplier, multiplierForElapsed(elapsed));
    }
    return game.cashoutMultiplier ?? game.crashMultiplier;
}

function getRoundMultiplierLabel(game: CrashGameState) {
    return formatMultiplier(game.cashoutMultiplier ?? game.crashMultiplier);
}

function buildCrashCurvePath(progress: number) {
    const clampedProgress = Math.max(0.01, Math.min(1, progress));
    const steps = 30;
    const points = Array.from({ length: steps }, (_, index) => {
        const t = clampedProgress * (index / (steps - 1));
        const x = 8 + t * 84;
        const y = 88 - Math.pow(t, 1.58) * 70;
        return `${x.toFixed(2)} ${y.toFixed(2)}`;
    });

    return `M ${points.join(" L ")}`;
}

export function CrashGame({ balance, game, onStart, onCashout, onOpenRules, onOutcomeReveal }: CrashGameProps) {
    const [mode, setMode] = useState<"manual" | "auto">("manual");
    const [bet, setBet] = useState(25);
    const [customBet, setCustomBet] = useState("25");
    const [autoTarget, setAutoTarget] = useState("2.00");
    const [displayMultiplier, setDisplayMultiplier] = useState(() => getInitialMultiplier(game));
    const [isRequesting, setIsRequesting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastResult, setLastResult] = useState<CrashCashoutResult | null>(null);
    const [recentRounds, setRecentRounds] = useState<string[]>([]);
    const animationFrameRef = useRef<number | null>(null);
    const settlingGameIdRef = useRef<string | null>(null);
    const cashoutInFlightRef = useRef(false);
    const recordedRecentRoundIdsRef = useRef<Set<string>>(new Set());

    const activeGame = game?.status === "active" ? game : null;
    const availableBalance = activeGame ? balance + activeGame.betAmount : balance;
    const parsedCustomBet = Number(customBet);
    const parsedAutoTarget = Number(autoTarget);
    const isCustomBetValid = Number.isFinite(parsedCustomBet) && parsedCustomBet >= minBet && parsedCustomBet <= maxBet;
    const isAutoTargetValid = Number.isFinite(parsedAutoTarget) && parsedAutoTarget >= 1.01 && parsedAutoTarget <= 100;
    const canAfford = bet <= balance;
    const canStart = !activeGame && !isRequesting && canAfford && bet > 0;
    const canCashout = Boolean(activeGame) && !isRequesting && !cashoutInFlightRef.current;
    const shownMultiplier = activeGame ? displayMultiplier : game ? displayMultiplier : 1;
    const potentialReturn = activeGame ? Math.floor(activeGame.betAmount * shownMultiplier) : Math.floor(bet * shownMultiplier);
    const profit = activeGame ? Math.max(0, potentialReturn - activeGame.betAmount) : 0;

    const graphProgress = useMemo(() => {
        if (!game) {
            return 0;
        }
        if (game.status === "active") {
            const elapsed = Math.max(0, Date.now() - new Date(game.startedAt).getTime());
            return Math.min(1, elapsed / Math.max(1, game.crashAfterMs));
        }
        if (game.status === "cashed_out" && game.cashoutMultiplier) {
            return Math.min(1, Math.max(0.08, game.cashoutMultiplier / Math.max(game.crashMultiplier, 1)));
        }
        return 1;
    }, [displayMultiplier, game]);

    const pathEndX = 8 + graphProgress * 84;
    const pathEndY = 88 - Math.pow(graphProgress, 1.58) * 70;
    const curvePath = buildCrashCurvePath(graphProgress);
    const roundTone = game?.status === "cashed_out" ? "win" : game?.status === "crashed" ? "loss" : "live";

    useEffect(() => {
        return () => {
            if (animationFrameRef.current !== null) {
                window.cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, []);

    useEffect(() => {
        setDisplayMultiplier(getInitialMultiplier(game));
        if (game?.status !== "active") {
            settlingGameIdRef.current = null;
            cashoutInFlightRef.current = false;
        }
    }, [game?.id, game?.status]);

    useEffect(() => {
        if (!activeGame) {
            return;
        }

        const tick = () => {
            const elapsed = Math.max(0, Date.now() - new Date(activeGame.startedAt).getTime());
            const nextMultiplier = Math.min(activeGame.crashMultiplier, multiplierForElapsed(elapsed));
            setDisplayMultiplier(nextMultiplier);

            if (
                mode === "auto" &&
                isAutoTargetValid &&
                nextMultiplier >= parsedAutoTarget &&
                elapsed < activeGame.crashAfterMs &&
                !cashoutInFlightRef.current
            ) {
                void settleRound();
                return;
            }

            if (elapsed >= activeGame.crashAfterMs) {
                setDisplayMultiplier(activeGame.crashMultiplier);
                if (settlingGameIdRef.current !== activeGame.id) {
                    settlingGameIdRef.current = activeGame.id;
                    void settleRound();
                }
                return;
            }

            animationFrameRef.current = window.requestAnimationFrame(tick);
        };

        animationFrameRef.current = window.requestAnimationFrame(tick);
        return () => {
            if (animationFrameRef.current !== null) {
                window.cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        };
    }, [activeGame?.id, mode, autoTarget]);

    useEffect(() => {
        if (!activeGame && bet > balance && balance > 0) {
            const nextBet = Math.min(balance, betOptions[0] ?? balance);
            setBet(nextBet);
            setCustomBet(String(nextBet));
        }
    }, [activeGame, balance, bet]);

    useEffect(() => {
        if (!game || game.status === "active" || recordedRecentRoundIdsRef.current.has(game.id)) {
            return;
        }

        recordedRecentRoundIdsRef.current.add(game.id);
        setRecentRounds(current => [getRoundMultiplierLabel(game), ...current].slice(0, 7));
    }, [game?.id, game?.status]);

    const settleRound = async () => {
        if (!activeGame || cashoutInFlightRef.current) {
            return;
        }

        cashoutInFlightRef.current = true;
        setIsRequesting(true);
        setError(null);

        try {
            const next = await onCashout();
            setLastResult(next);
            setDisplayMultiplier(next.crash.cashoutMultiplier ?? next.crash.crashMultiplier);
            if (!recordedRecentRoundIdsRef.current.has(next.crash.id)) {
                recordedRecentRoundIdsRef.current.add(next.crash.id);
                setRecentRounds(current => [getRoundMultiplierLabel(next.crash), ...current].slice(0, 7));
            }
            onOutcomeReveal(next.bet);
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Unable to settle Crash round");
            settlingGameIdRef.current = null;
        } finally {
            cashoutInFlightRef.current = false;
            setIsRequesting(false);
        }
    };

    const startRound = async () => {
        if (!canStart) {
            return;
        }

        setError(null);
        setLastResult(null);
        setDisplayMultiplier(1);
        setIsRequesting(true);
        settlingGameIdRef.current = null;

        try {
            await onStart(bet);
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Unable to start Crash round");
        } finally {
            setIsRequesting(false);
        }
    };

    return (
        <section className="game-shell game-shell-crash page-swap page-from-right w-full max-w-5xl overflow-hidden rounded-3xl border border-emerald-300/20 bg-[linear-gradient(145deg,rgba(3,7,18,0.96),rgba(6,78,59,0.46)_48%,rgba(8,13,28,0.98))] shadow-[0_40px_120px_rgba(2,6,23,0.48)]">
            <div className="grid min-h-160 lg:grid-cols-[17rem_minmax(0,1fr)]">
                <aside className="border-b border-white/10 bg-black/24 p-4 lg:border-b-0 lg:border-r">
                    <div className="grid grid-cols-2 rounded-xl bg-slate-950/70 p-1">
                        {(["manual", "auto"] as const).map(nextMode => (
                            <button
                                key={nextMode}
                                onClick={() => setMode(nextMode)}
                                className={`rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                                    mode === nextMode ? "bg-slate-700/80 text-white" : "text-slate-400 hover:text-white"
                                }`}
                                type="button"
                            >
                                {nextMode}
                            </button>
                        ))}
                    </div>

                    <div className="mt-5">
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-slate-400">
                            <span>Bet Amount</span>
                            <span>₵ {formatCredits(balance)}</span>
                        </div>
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
                                    const parsed = Number(event.target.value);
                                    if (Number.isFinite(parsed) && parsed >= minBet && parsed <= maxBet) {
                                        setBet(parsed);
                                        setError(null);
                                    }
                                }}
                                className="min-w-0 flex-1 rounded-l-xl bg-transparent px-3 py-3 text-sm font-semibold text-white outline-none"
                                disabled={Boolean(activeGame) || isRequesting}
                            />
                            <button
                                onClick={() => {
                                    const nextBet = Math.max(minBet, Math.floor(bet / 2));
                                    setBet(nextBet);
                                    setCustomBet(String(nextBet));
                                }}
                                disabled={Boolean(activeGame) || isRequesting}
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
                                disabled={Boolean(activeGame) || isRequesting}
                                className="border-l border-white/10 px-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:text-white disabled:opacity-40"
                                type="button"
                            >
                                2x
                            </button>
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                        {betOptions.map(amount => (
                            <button
                                key={amount}
                                onClick={() => {
                                    setBet(amount);
                                    setCustomBet(String(amount));
                                    setError(null);
                                }}
                                disabled={Boolean(activeGame) || isRequesting || amount > balance}
                                className={`arcade-button rounded-lg border px-2 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
                                    bet === amount
                                        ? "border-emerald-300/60 bg-emerald-300/14 text-emerald-100"
                                        : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20"
                                }`}
                                type="button"
                            >
                                {amount}
                            </button>
                        ))}
                    </div>

                    {mode === "auto" && (
                        <div className="mt-5">
                            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-slate-400">
                                <span>Auto Cashout</span>
                                <span>x</span>
                            </div>
                            <input
                                type="number"
                                inputMode="decimal"
                                min="1.01"
                                max="100"
                                step="0.01"
                                value={autoTarget}
                                onChange={event => {
                                    setAutoTarget(event.target.value);
                                    setError(null);
                                }}
                                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm font-semibold text-white outline-none transition focus:border-emerald-300/60"
                                disabled={Boolean(activeGame) || isRequesting}
                            />
                        </div>
                    )}

                    <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-slate-400">
                            <span>Profit on Win</span>
                            <span>₵ {formatCredits(profit)}</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30">
                            <div
                                className="h-full rounded-full bg-linear-to-r from-lime-300 via-emerald-300 to-cyan-300 transition-all"
                                style={{ width: `${Math.min(100, Math.max(4, (shownMultiplier / 8) * 100))}%` }}
                            />
                        </div>
                    </div>

                    {!canAfford && !activeGame && (
                        <p className="mt-4 text-xs uppercase tracking-[0.22em] text-rose-200">Not enough balance</p>
                    )}
                    {!isAutoTargetValid && mode === "auto" && (
                        <p className="mt-4 text-xs uppercase tracking-[0.22em] text-rose-200">Auto target must be 1.01x to 100x</p>
                    )}
                    {error && <p className="mt-4 text-xs uppercase tracking-[0.22em] text-rose-200">{error}</p>}

                    {activeGame ? (
                        <button
                            onClick={() => void settleRound()}
                            disabled={!canCashout}
                            className="arcade-button mt-5 w-full rounded-lg bg-lime-300 px-5 py-4 text-xs font-bold uppercase tracking-[0.22em] text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-60"
                            type="button"
                        >
                            {isRequesting ? "Locking..." : `Cash Out ₵ ${formatCredits(potentialReturn)}`}
                        </button>
                    ) : (
                        <button
                            onClick={() => void startRound()}
                            disabled={!canStart || (mode === "auto" && !isAutoTargetValid)}
                            className="arcade-button mt-5 w-full rounded-lg bg-emerald-400 px-5 py-4 text-xs font-bold uppercase tracking-[0.22em] text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                            type="button"
                        >
                            {isRequesting ? "Starting..." : "Bet"}
                        </button>
                    )}

                    <button
                        onClick={onOpenRules}
                        className="mt-4 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-300 transition hover:border-white/20 hover:text-white"
                        type="button"
                    >
                        Rules
                    </button>
                </aside>

                <div className="crash-main">
                    <div className="flex flex-col gap-4 px-5 pt-4 sm:flex-row sm:items-start sm:justify-between">
                        {recentRounds.length > 0 ? (
                            <div className="min-w-0">
                                <p className="text-[10px] uppercase tracking-[0.28em] text-slate-400">Recent</p>
                                <div className="mt-2 flex max-w-full flex-wrap gap-2">
                                    {recentRounds.map((round, index) => (
                                        <span
                                            key={`${round}-${index}`}
                                            className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                                                Number(round.replace("x", "")) >= 2
                                                    ? "bg-lime-300/18 text-lime-200"
                                                    : "bg-slate-700/55 text-slate-200"
                                            }`}
                                        >
                                            {round}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div>
                                <p className="text-[10px] uppercase tracking-[0.28em] text-slate-400">Crash</p>
                                <h2 className="mt-1 font-display text-3xl text-white">Single Player</h2>
                            </div>
                        )}

                        <div className="shrink-0 text-left sm:text-right">
                            <p className="text-[10px] uppercase tracking-[0.28em] text-slate-400">Balance</p>
                            <p className="mt-1 font-display text-2xl text-white">₵ {formatCredits(availableBalance)}</p>
                        </div>
                    </div>

                    <div className="crash-stage">
                        <div className="crash-axis crash-axis-y">
                            <span>5.0x</span>
                            <span>3.0x</span>
                            <span>1.5x</span>
                            <span>1.0x</span>
                        </div>
                        <div className="crash-axis crash-axis-x">
                            <span>0s</span>
                            <span>3s</span>
                            <span>6s</span>
                            <span>9s</span>
                        </div>

                        <svg className="crash-curve" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                            <path className="crash-curve-shadow" d={curvePath} />
                            <path className={`crash-curve-line crash-curve-${roundTone}`} d={curvePath} />
                        </svg>

                        {game && (
                            <div
                                className={`crash-rocket crash-rocket-${roundTone}`}
                                style={{ left: `${pathEndX}%`, top: `${pathEndY}%` }}
                            />
                        )}

                        <div className={`crash-multiplier crash-multiplier-${roundTone}`}>
                            {game ? formatMultiplier(shownMultiplier) : "1.00x"}
                        </div>

                        <div className={`crash-status crash-status-${roundTone}`}>
                            {activeGame
                                ? "Live"
                                : game?.status === "cashed_out"
                                    ? `Cashed at ${formatMultiplier(game.cashoutMultiplier ?? shownMultiplier)}`
                                    : game?.status === "crashed"
                                        ? "Crashed"
                                        : "Waiting"}
                        </div>
                    </div>

                    <div className="grid gap-3 px-5 pb-5 md:grid-cols-3">
                        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Wager</p>
                            <p className="mt-2 font-display text-2xl text-white">₵ {formatCredits(activeGame?.betAmount ?? bet)}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Return</p>
                            <p className="mt-2 font-display text-2xl text-lime-200">₵ {formatCredits(potentialReturn)}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">
                                {lastResult ? "Last Result" : "Crash"}
                            </p>
                            <p className="mt-2 font-display text-2xl text-white">
                                {lastResult
                                    ? lastResult.bet.outcome === "win"
                                        ? formatMultiplier(lastResult.crash.cashoutMultiplier ?? 1)
                                        : formatMultiplier(lastResult.crash.crashMultiplier)
                                    : game && game.status !== "active"
                                        ? formatMultiplier(game.crashMultiplier)
                                        : "Hidden"}
                            </p>
                            {lastResult && (
                                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-300/70">
                                    {lastResult.bet.outcome === "win"
                                        ? `+₵ ${formatCredits((lastResult.crash.payout ?? 0) - lastResult.bet.amount)}`
                                        : "No return"}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
