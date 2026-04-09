import type { Achievement, Mission } from "../lib/session";

type LobbyProps = {
    onSelectCoinFlip: () => void;
    onSelectDice: () => void;
    onSelectBlackjack: () => void;
    onSelectSlots: () => void;   
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
    title: "Lucky Reels",
    subtitle: "Slot Machine",
    accent: "from-rose-400 via-fuchsia-500 to-violet-500",
    icon: "🎰",
    onSelect: "slots",
    },
] as const;

export function Lobby({
    onSelectCoinFlip,
    onSelectDice,
    onSelectBlackjack,
    onSelectSlots,
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

    return (
        <section className="page-swap page-from-left w-full max-w-4xl rounded-3xl border border-white/10 bg-white/5 p-6">
            <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Games</p>
                <h2 className="mt-2 font-display text-3xl text-white">Lobby</h2>
            </div>
            <div className="mt-8 grid gap-6 md:grid-cols-2">
                {gameTiles.map(tile => (
                    <button
                        key={tile.title}
                        onClick={tile.onSelect === "coinflip" ? onSelectCoinFlip : 
                            tile.onSelect === "dice" ? onSelectDice : 
                            tile.onSelect === "blackjack" ? onSelectBlackjack : 
                            onSelectSlots}
                        className="group relative overflow-hidden rounded-3xl border border-white/10 bg-linear-to-br from-slate-950/70 via-slate-900/70 to-slate-950/80 p-6 text-left transition hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_25px_60px_rgba(14,116,144,0.35)]"
                        type="button"
                    >
                        <div className="absolute inset-0 opacity-0 transition group-hover:opacity-100">
                            <div className="absolute -left-10 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-cyan-500/20 blur-3xl" />
                        </div>
                        <div className="relative">
                            <div className="flex items-center gap-4">
                                <div
                                    className={`grid h-16 w-16 place-items-center rounded-2xl bg-linear-to-br ${tile.accent} text-2xl shadow-[0_12px_30px_rgba(248,113,113,0.35)]`}
                                >
                                    {tile.icon}
                                </div>
                                <div>
                                    <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{tile.subtitle}</p>
                                    <h3 className="mt-2 font-display text-3xl text-white">{tile.title}</h3>
                                </div>
                            </div>
                        </div>
                    </button>
                ))}
            </div>
            <div className="mt-10">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Progress</p>
                <div className="mt-4 grid gap-6 xl:grid-cols-2">
                    <div className="rounded-3xl border border-amber-300/20 bg-[linear-gradient(135deg,rgba(120,53,15,0.28),rgba(15,23,42,0.82))] p-5">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div>
                                <p className="text-xs uppercase tracking-[0.3em] text-amber-100/70">Missions</p>
                                <h3 className="mt-2 font-display text-3xl text-white">Daily missions</h3>
                            </div>
                            <button
                                onClick={onOpenMissions}
                                className="arcade-button rounded-full border border-amber-300/40 bg-amber-300/12 px-5 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-amber-100 transition hover:bg-amber-300/18"
                                type="button"
                            >
                                Open missions
                            </button>
                        </div>

                        <div className="mt-5 grid gap-3">
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
                            {claimableCount > 0 ? `${claimableCount} mission reward ready` : "No rewards ready"}
                        </div>
                    </div>

                    <div className="rounded-3xl border border-cyan-300/20 bg-[linear-gradient(135deg,rgba(8,47,73,0.34),rgba(15,23,42,0.84))] p-5">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div>
                                <p className="text-xs uppercase tracking-[0.3em] text-cyan-100/70">Badges</p>
                                <h3 className="mt-2 font-display text-3xl text-white">Achievements</h3>
                            </div>
                            <button
                                onClick={onOpenAchievements}
                                className="arcade-button rounded-full border border-cyan-300/35 bg-cyan-300/10 px-5 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-300/16"
                                type="button"
                            >
                                Open achievements
                            </button>
                        </div>

                        <div className="mt-5 grid gap-3">
                            {previewAchievements.map(achievement => (
                                <button
                                    key={achievement.id}
                                    onClick={onOpenAchievements}
                                    className="achievement-card achievement-card-cyan rounded-2xl border p-4 text-left transition hover:border-white/20"
                                    type="button"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`achievement-medal achievement-medal-${achievement.accent}`}>
                                            {achievement.iconLabel}
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-100/60">{achievement.groupName}</p>
                                            <h4 className="mt-1 font-display text-2xl text-white">{achievement.title}</h4>
                                        </div>
                                    </div>
                                    <p className="mt-3 text-sm text-slate-200/75">{achievement.description}</p>
                                    <div className="mt-4 flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-slate-300/75">
                                        <span>
                                            {achievement.progress}/{achievement.target}
                                        </span>
                                        <span>{achievement.status === "unlocked" ? "Unlocked" : "Live"}</span>
                                    </div>
                                    <div className="mt-3 h-2 rounded-full bg-white/10">
                                        <div
                                            className="achievement-progress h-full rounded-full"
                                            style={{ width: `${Math.min(100, (achievement.progress / achievement.target) * 100)}%` }}
                                        />
                                    </div>
                                </button>
                            ))}
                        </div>

                        <div className="mt-4 text-xs uppercase tracking-[0.24em] text-cyan-100/70">
                            {`${unlockedAchievements.length} of ${achievements.length} unlocked`}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
