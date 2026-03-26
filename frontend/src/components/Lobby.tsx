import type { Mission } from "../lib/session";

type LobbyProps = {
    onSelectCoinFlip: () => void;
    onSelectBlackjack: () => void;
    onOpenMissions: () => void;
    missions: Mission[];
};

const gameTiles = [
    {
        title: "Flipzilla",
        subtitle: "Coin Flip Game",
        description: "Fast 50/50 showdowns with a single click.",
        accent: "from-amber-400 via-pink-500 to-purple-500",
        icon: "🪙",
        onSelect: "coinflip",
    },
    {
        title: "High Table 21",
        subtitle: "Blackjack",
        description: "Take cards, read the dealer, and play a real hand with hit and stand.",
        accent: "from-emerald-300 via-cyan-400 to-blue-500",
        icon: "🂡",
        onSelect: "blackjack",
    },
] as const;

export function Lobby({ onSelectCoinFlip, onSelectBlackjack, onOpenMissions, missions }: LobbyProps) {
    const claimableCount = missions.filter(mission => mission.status === "claimable").length;

    return (
        <section className="page-swap page-from-left w-full max-w-4xl rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="text-center">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Game lobby</p>
                <h2 className="mt-2 font-display text-3xl text-white">Choose what to play</h2>
            </div>
            <div className="mt-8 grid gap-6 md:grid-cols-2">
                {gameTiles.map(tile => (
                    <button
                        key={tile.title}
                        onClick={tile.onSelect === "coinflip" ? onSelectCoinFlip : onSelectBlackjack}
                        className="group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/70 via-slate-900/70 to-slate-950/80 p-6 text-left transition hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_25px_60px_rgba(14,116,144,0.35)]"
                        type="button"
                    >
                        <div className="absolute inset-0 opacity-0 transition group-hover:opacity-100">
                            <div className="absolute -left-10 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-cyan-500/20 blur-3xl" />
                        </div>
                        <div className="relative">
                            <div className="flex items-center gap-4">
                                <div
                                    className={`grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br ${tile.accent} text-2xl shadow-[0_12px_30px_rgba(248,113,113,0.35)]`}
                                >
                                    {tile.icon}
                                </div>
                                <div>
                                    <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{tile.subtitle}</p>
                                    <h3 className="mt-2 font-display text-3xl text-white">{tile.title}</h3>
                                </div>
                            </div>
                            <p className="mt-4 text-sm text-slate-300/70">{tile.description}</p>
                        </div>
                    </button>
                ))}
            </div>
            <div className="mt-6 rounded-3xl border border-amber-300/20 bg-[linear-gradient(135deg,rgba(120,53,15,0.28),rgba(15,23,42,0.82))] p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-amber-100/70">Daily missions</p>
                        <h3 className="mt-2 font-display text-3xl text-white">Three payouts waiting every day</h3>
                        <p className="mt-2 max-w-2xl text-sm text-amber-50/75">
                            One mission spans the whole casino, one targets Flipzilla, and one targets blackjack.
                        </p>
                    </div>
                    <button
                        onClick={onOpenMissions}
                        className="arcade-button rounded-full border border-amber-300/40 bg-amber-300/12 px-5 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-amber-100 transition hover:bg-amber-300/18"
                        type="button"
                    >
                        Open missions
                    </button>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                    {missions.map(mission => (
                        <button
                            key={mission.id}
                            onClick={onOpenMissions}
                            className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-white/20 hover:bg-black/25"
                            type="button"
                        >
                            <p className="text-[10px] uppercase tracking-[0.28em] text-amber-100/60">{mission.groupName}</p>
                            <h4 className="mt-2 font-display text-2xl text-white">{mission.title}</h4>
                            <p className="mt-2 text-sm text-slate-200/75">{mission.description}</p>
                            <div className="mt-4 flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-slate-300/75">
                                <span>
                                    {mission.progress}/{mission.target}
                                </span>
                                <span>{mission.status === "claimable" ? "Ready" : mission.status === "claimed" ? "Claimed" : "Live"}</span>
                            </div>
                            <div className="mt-3 h-2 rounded-full bg-white/10">
                                <div
                                    className="level-panel-fill h-full rounded-full"
                                    style={{ width: `${Math.min(100, (mission.progress / mission.target) * 100)}%` }}
                                />
                            </div>
                        </button>
                    ))}
                </div>

                <div className="mt-4 text-xs uppercase tracking-[0.24em] text-amber-100/70">
                    {claimableCount > 0 ? `${claimableCount} mission reward ready to claim` : "No rewards ready yet"}
                </div>
            </div>
        </section>
    );
}
