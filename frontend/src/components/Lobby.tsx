import type { Achievement, Mission } from "../lib/session";

type LobbyProps = {
    onSelectCoinFlip: () => void;
    onSelectDice: () => void;
    onSelectBlackjack: () => void;
    onSelectRoulette: () => void;
    onSelectCrash: () => void;
    onSelectMines: () => void;
    onSelectSlots: () => void;
    onSelectPlinko: () => void;
    onSelectTopUp: () => void;
    onOpenMissions: () => void;
    onOpenAchievements: () => void;
    missions: Mission[];
    achievements: Achievement[];
};

const gameTiles = [
    {
        title: "Flipzilla",
        subtitle: "Coin Flip Game",
        accent: "from-amber-400 via-pink-500 to-purple-500",
        icon: "🪙",
        onSelect: "coinflip",
    },
    {
        title: "Lucky 7",
        subtitle: "Dice Game",
        accent: "from-rose-300 via-orange-400 to-amber-400",
        icon: "⚄",
        onSelect: "dice",
    },
    {
        title: "High Table 21",
        subtitle: "Blackjack",
        accent: "from-emerald-300 via-cyan-400 to-blue-500",
        icon: "🂡",
        onSelect: "blackjack",
    },
    {
        title: "Roulette Royale",
        subtitle: "Number and Color Bets",
        accent: "from-rose-400 via-amber-400 to-yellow-300",
        icon: "🎡",
        onSelect: "roulette",
    },
    {
        title: "Crash",
        subtitle: "Multiplier Game",
        accent: "from-lime-300 via-emerald-400 to-cyan-500",
        icon: "🚀",
        onSelect: "crash",
    },
    {
        title: "Minefield",
        subtitle: "Mines Game",
        accent: "from-cyan-300 via-sky-400 to-blue-500",
        icon: "💣",
        onSelect: "mines",
    },
    {
        title: "Lucky Reels",
        subtitle: "Slot Machine",
        accent: "from-rose-400 via-fuchsia-500 to-violet-500",
        icon: "🎰",
        onSelect: "slots",
    },
    {
        title: "Plinko",
        subtitle: "Drop Board",
        accent: "from-cyan-300 via-emerald-400 to-lime-300",
        icon: "🔵",
        onSelect: "plinko",
    },
] as const;

export function Lobby({
    onSelectCoinFlip,
    onSelectDice,
    onSelectBlackjack,
    onSelectRoulette,
    onSelectCrash,
    onSelectMines,
    onSelectSlots,
    onSelectPlinko,
    onSelectTopUp: _onSelectTopUp,
    onOpenMissions,
    onOpenAchievements,
    missions,
    achievements,
}: LobbyProps) {
    const claimableCount = missions.filter(mission => mission.status === "claimable").length;
    const unlockedAchievements = achievements.filter(achievement => achievement.status === "unlocked");
    const previewAchievements = [...achievements]
        .sort((left, right) => {
            if (left.status !== right.status) {
                return left.status === "unlocked" ? -1 : 1;
            }
            return (right.progress / right.target) - (left.progress / left.target);
        })
        .slice(0, 3);
    const previewMissions = missions.slice(0, 3);

    return (
        <section className="page-swap page-from-left w-full max-w-6xl">
            <div className="grid gap-5 xl:grid-cols-[15rem_minmax(0,1fr)_15rem] xl:items-start">
                <aside className="lobby-progress-card lobby-progress-missions order-2 rounded-3xl border border-amber-300/20 bg-[linear-gradient(135deg,rgba(120,53,15,0.28),rgba(15,23,42,0.82))] p-4 xl:order-1">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.28em] text-amber-100/70">Missions</p>
                            <h3 className="mt-1 font-display text-2xl text-white">Today</h3>
                        </div>
                        <button
                            onClick={onOpenMissions}
                            className="arcade-button rounded-full border border-amber-300/40 bg-amber-300/12 px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-100 transition hover:bg-amber-300/18"
                            type="button"
                        >
                            Open
                        </button>
                    </div>

                    <div className="mt-4 grid gap-3">
                        {previewMissions.map(mission => (
                            <button
                                key={mission.id}
                                onClick={onOpenMissions}
                                className="rounded-2xl border border-white/10 bg-black/20 p-3 text-left transition hover:border-white/20 hover:bg-black/25"
                                type="button"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-[9px] uppercase tracking-[0.22em] text-amber-100/60">{mission.groupName}</p>
                                        <h4 className="mt-1 font-display text-xl text-white">{mission.title}</h4>
                                    </div>
                                    <span className="shrink-0 text-[9px] uppercase tracking-[0.16em] text-slate-300/75">
                                        {mission.status === "claimable" ? "Ready" : mission.status === "claimed" ? "Done" : "Live"}
                                    </span>
                                </div>
                                <div className="mt-3 flex items-center justify-between text-[9px] uppercase tracking-[0.16em] text-slate-300/70">
                                    <span>{mission.progress}/{mission.target}</span>
                                    <span>{Math.min(100, Math.round((mission.progress / mission.target) * 100))}%</span>
                                </div>
                                <div className="mt-2 h-1.5 rounded-full bg-white/10">
                                    <div
                                        className="level-panel-fill h-full rounded-full"
                                        style={{ width: `${Math.min(100, (mission.progress / mission.target) * 100)}%` }}
                                    />
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/15 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-amber-100/70">
                        {claimableCount > 0 ? `${claimableCount} ready` : "No rewards"}
                    </div>
                </aside>

                <div className="order-1 rounded-3xl border border-white/10 bg-white/5 p-6 xl:order-2">
                    <div className="text-center">
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Games</p>
                        <h2 className="mt-2 font-display text-4xl text-white">Lobby</h2>
                    </div>
                    <div className="mt-8 grid gap-4 md:grid-cols-2">
                        {gameTiles.map((tile, index) => (
                            <button
                                key={tile.title}
                                onClick={tile.onSelect === "coinflip" ? onSelectCoinFlip :
                                    tile.onSelect === "dice" ? onSelectDice :
                                    tile.onSelect === "blackjack" ? onSelectBlackjack :
                                    tile.onSelect === "roulette" ? onSelectRoulette :
                                    tile.onSelect === "crash" ? onSelectCrash :
                                    tile.onSelect === "mines" ? onSelectMines :
                                    tile.onSelect === "slots" ? onSelectSlots :
                                    onSelectPlinko}
                                className={`lobby-game-tile group relative overflow-hidden rounded-2xl border border-white/10 bg-linear-to-br from-slate-950/70 via-slate-900/70 to-slate-950/80 p-5 text-left transition hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_25px_60px_rgba(14,116,144,0.35)] ${
                                    index === gameTiles.length - 1 && gameTiles.length % 2 === 1 ? "lobby-game-tile-last md:col-span-2 md:justify-self-center" : ""
                                }`}
                                type="button"
                            >
                                <div className="relative flex h-full items-center">
                                    <div className="flex min-w-0 items-center gap-4">
                                        <div
                                            className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-linear-to-br ${tile.accent} text-2xl shadow-[0_12px_30px_rgba(248,113,113,0.35)]`}
                                        >
                                            {tile.icon}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{tile.subtitle}</p>
                                            <h3 className="mt-1 font-display text-2xl leading-tight text-white">{tile.title}</h3>
                                        </div>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                <aside className="lobby-progress-card lobby-progress-achievements order-3 rounded-3xl border border-cyan-300/20 bg-[linear-gradient(135deg,rgba(8,47,73,0.34),rgba(15,23,42,0.84))] p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-100/70">Badges</p>
                            <h3 className="mt-1 font-display text-2xl text-white">Progress</h3>
                        </div>
                        <button
                            onClick={onOpenAchievements}
                            className="arcade-button rounded-full border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-100 transition hover:bg-cyan-300/16"
                            type="button"
                        >
                            Open
                        </button>
                    </div>

                    <div className="mt-4 grid gap-3">
                        {previewAchievements.map(achievement => (
                            <button
                                key={achievement.id}
                                onClick={onOpenAchievements}
                                className="achievement-card achievement-card-cyan rounded-2xl border p-3 text-left transition hover:border-white/20"
                                type="button"
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`achievement-medal achievement-medal-${achievement.accent} h-10! min-h-10! w-10! min-w-10! rounded-xl text-[0.65rem]`}>
                                        {achievement.iconLabel}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate text-[9px] uppercase tracking-[0.22em] text-cyan-100/60">{achievement.groupName}</p>
                                        <h4 className="mt-1 font-display text-xl text-white">{achievement.title}</h4>
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center justify-between text-[9px] uppercase tracking-[0.16em] text-slate-300/70">
                                    <span>{achievement.progress}/{achievement.target}</span>
                                    <span>{achievement.status === "unlocked" ? "Unlocked" : "Live"}</span>
                                </div>
                                <div className="mt-2 h-1.5 rounded-full bg-white/10">
                                    <div
                                        className="achievement-progress h-full rounded-full"
                                        style={{ width: `${Math.min(100, (achievement.progress / achievement.target) * 100)}%` }}
                                    />
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/15 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-cyan-100/70">
                        {`${unlockedAchievements.length} of ${achievements.length} unlocked`}
                    </div>
                </aside>
            </div>
        </section>
    );
}
