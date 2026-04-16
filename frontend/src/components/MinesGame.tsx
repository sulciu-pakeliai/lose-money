import { useMemo, useState } from "react";
import type { BetRecord, MinesActionResult, MinesGameState } from "../lib/session";

type MinesGameProps = {
    balance: number;
    game: MinesGameState | null;
    onStart: (amount: number, mineCount: number) => Promise<MinesActionResult>;
    onReveal: (cell: number) => Promise<MinesActionResult>;
    onCashout: () => Promise<MinesActionResult>;
    onOpenRules: () => void;
    onOutcomeReveal: (bet: BetRecord) => void;
};

const betOptions = [10, 25, 50, 100, 250, 500];
const mineOptions = [3, 5, 7, 10, 15, 20];
const minBet = 1;
const maxBet = 10000;

function formatCredits(value: number) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatMultiplier(value: number) {
    return `${value.toFixed(2)}x`;
}

function getCellTone(params: {
    index: number;
    activeGame: MinesGameState | null;
    selectedCell: number | null;
    pendingCell: number | null;
}) {
    const { index, activeGame, selectedCell, pendingCell } = params;

    if (!activeGame) {
        return "border-white/10 bg-white/5 text-slate-400";
    }

    const isMine = Boolean(activeGame.minePositions?.includes(index));
    const isRevealed = activeGame.revealedCells.includes(index);
    const isPending = pendingCell === index;

    if (isPending) {
        return "border-cyan-300/60 bg-cyan-300/20 text-cyan-100";
    }

    if (isRevealed && isMine) {
        return "border-rose-400/70 bg-rose-400/25 text-rose-100";
    }

    if (isRevealed && !isMine) {
        return "border-emerald-300/60 bg-emerald-300/20 text-emerald-100";
    }

    if (selectedCell === index) {
        return "border-cyan-300/60 bg-cyan-300/16 text-cyan-100";
    }

    return "border-white/10 bg-white/5 text-slate-300 hover:border-white/20";
}

export function MinesGame({ balance, game, onStart, onReveal, onCashout, onOpenRules, onOutcomeReveal }: MinesGameProps) {
    const [bet, setBet] = useState(25);
    const [customBet, setCustomBet] = useState("25");
    const [mineCount, setMineCount] = useState(5);
    const [isRequesting, setIsRequesting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedCell, setSelectedCell] = useState<number | null>(null);
    const [pendingCell, setPendingCell] = useState<number | null>(null);

    const activeGame = game?.status === "active" ? game : null;
    const shownBalance = activeGame ? balance + activeGame.betAmount : balance;
    const parsedCustomBet = Number(customBet);
    const isCustomBetValid = Number.isFinite(parsedCustomBet) && parsedCustomBet >= minBet && parsedCustomBet <= maxBet;
    const canAfford = bet <= balance;
    const canStart = !activeGame && !isRequesting && canAfford && bet > 0;
    const canReveal = Boolean(activeGame) && !isRequesting;
    const canCashout = Boolean(activeGame) && !isRequesting;

    const currentMultiplier = activeGame?.currentMultiplier ?? game?.currentMultiplier ?? 1;
    const potentialPayout = activeGame?.potentialPayout ?? Math.floor(bet * currentMultiplier);

    const boardSize = activeGame?.gridSize ?? 25;
    const cells = useMemo(() => Array.from({ length: boardSize }, (_, idx) => idx), [boardSize]);

    const startRound = async () => {
        if (!canStart) {
            return;
        }

        setIsRequesting(true);
        setError(null);
        setSelectedCell(null);
        setPendingCell(null);

        try {
            await onStart(bet, mineCount);
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Unable to start Mines round");
        } finally {
            setIsRequesting(false);
        }
    };

    const revealCell = async (cell: number) => {
        if (!canReveal || !activeGame || activeGame.revealedCells.includes(cell)) {
            return;
        }

        setIsRequesting(true);
        setError(null);
        setPendingCell(cell);

        try {
            const result = await onReveal(cell);
            if (result.bet) {
                onOutcomeReveal(result.bet);
            }
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Unable to reveal tile");
        } finally {
            setPendingCell(null);
            setIsRequesting(false);
        }
    };

    const cashout = async () => {
        if (!canCashout) {
            return;
        }

        setIsRequesting(true);
        setError(null);

        try {
            const result = await onCashout();
            if (result.bet) {
                onOutcomeReveal(result.bet);
            }
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Unable to cash out");
        } finally {
            setIsRequesting(false);
        }
    };

    return (
        <section className="page-swap page-from-right w-full max-w-5xl overflow-hidden rounded-3xl border border-cyan-300/20 bg-[linear-gradient(145deg,rgba(3,7,18,0.97),rgba(8,47,73,0.5)_48%,rgba(8,13,28,0.98))] p-6 shadow-[0_40px_120px_rgba(2,6,23,0.5)]">
            <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
                <aside className="rounded-3xl border border-white/10 bg-black/25 p-4">
                    <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-cyan-100/70">Mines</p>
                        <h2 className="mt-2 font-display text-4xl text-white">Minefield</h2>
                    </div>

                    <button
                        onClick={onOpenRules}
                        className="arcade-button mt-4 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-100 transition hover:border-white/20 hover:bg-white/10"
                        type="button"
                    >
                        Rules
                    </button>

                    <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-300/70">Available Balance</p>
                        <p className="mt-2 font-display text-3xl text-white">{formatCredits(shownBalance)}</p>
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

                        <div className="mt-3 grid grid-cols-3 gap-2">
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

                    <div className="mt-4">
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-300/70">Mines</p>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                            {mineOptions.map(option => (
                                <button
                                    key={option}
                                    onClick={() => setMineCount(option)}
                                    disabled={Boolean(activeGame) || isRequesting}
                                    className={`arcade-button rounded-lg border px-2 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
                                        mineCount === option
                                            ? "border-amber-300/60 bg-amber-300/14 text-amber-100"
                                            : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20"
                                    }`}
                                    type="button"
                                >
                                    {option}
                                </button>
                            ))}
                        </div>
                    </div>

                    {!canAfford && <p className="mt-4 text-xs uppercase tracking-[0.24em] text-rose-200">Not enough balance</p>}
                    {!isCustomBetValid && !activeGame && <p className="mt-2 text-xs uppercase tracking-[0.24em] text-rose-200">Enter a valid bet</p>}
                    {error && <p className="mt-2 text-xs uppercase tracking-[0.24em] text-rose-200">{error}</p>}

                    <button
                        onClick={() => void startRound()}
                        disabled={!canStart || !isCustomBetValid}
                        className="arcade-button mt-5 w-full rounded-2xl bg-cyan-300 px-6 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                    >
                        {isRequesting && !activeGame ? "Planting mines..." : "Start Round"}
                    </button>

                    <button
                        onClick={() => void cashout()}
                        disabled={!canCashout}
                        className="arcade-button mt-3 w-full rounded-2xl border border-emerald-300/40 bg-emerald-300/14 px-6 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100 transition hover:bg-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-50"
                        type="button"
                    >
                        {isRequesting && activeGame ? "Settling..." : `Cash out ${formatMultiplier(currentMultiplier)}`}
                    </button>
                </aside>

                <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <p className="text-xs uppercase tracking-[0.25em] text-slate-300/70">Safe Picks</p>
                            <p className="mt-2 font-display text-3xl text-white">{activeGame?.safeReveals ?? game?.safeReveals ?? 0}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <p className="text-xs uppercase tracking-[0.25em] text-slate-300/70">Multiplier</p>
                            <p className="mt-2 font-display text-3xl text-white">{formatMultiplier(currentMultiplier)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <p className="text-xs uppercase tracking-[0.25em] text-slate-300/70">Potential</p>
                            <p className="mt-2 font-display text-3xl text-white">{formatCredits(potentialPayout)}</p>
                        </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-200/80">
                        {game?.message ?? "Start a round to open the board."}
                    </div>

                    <div className="mt-5 grid grid-cols-5 gap-2 sm:gap-3">
                        {cells.map(index => {
                            const isLocked = !activeGame || isRequesting || activeGame.revealedCells.includes(index);
                            const isMine = Boolean(game?.minePositions?.includes(index));
                            const isRevealed = Boolean(game?.revealedCells.includes(index));
                            const label = isRevealed ? (isMine ? "💣" : "💎") : index + 1;
                            return (
                                <button
                                    key={index}
                                    onMouseEnter={() => setSelectedCell(index)}
                                    onFocus={() => setSelectedCell(index)}
                                    onMouseLeave={() => setSelectedCell(current => (current === index ? null : current))}
                                    onClick={() => void revealCell(index)}
                                    disabled={isLocked}
                                    className={`aspect-square rounded-xl border text-xs font-semibold transition ${getCellTone({
                                        index,
                                        activeGame,
                                        selectedCell,
                                        pendingCell,
                                    })} disabled:cursor-not-allowed disabled:opacity-90`}
                                    type="button"
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </section>
    );
}
