import { useMemo } from "react";
import type { Achievement } from "../lib/session";

type AchievementsBoardProps = {
    achievements: Achievement[];
};

function formatNumber(value: number) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function achievementScopeLabel(scope: Achievement["gameScope"]) {
    switch (scope) {
        case "coinflip":
            return "Flipzilla";
        case "dice":
            return "Lucky 7";
        case "blackjack":
            return "High Table 21";
        default:
            return "Casino-wide";
    }
}

function achievementRarityLabel(rarity: Achievement["rarity"]) {
    switch (rarity) {
        case "epic":
            return "Epic";
        case "rare":
            return "Rare";
        case "uncommon":
            return "Uncommon";
        default:
            return "Common";
    }
}

export function AchievementsBoard({ achievements }: AchievementsBoardProps) {
    const unlockedCount = achievements.filter(achievement => achievement.status === "unlocked").length;
    const completion = achievements.length === 0 ? 0 : Math.round((unlockedCount / achievements.length) * 100);

    const nextAchievement = useMemo(
        () =>
            [...achievements]
                .filter(achievement => achievement.status === "locked")
                .sort((left, right) => {
                    const leftRatio = left.target === 0 ? 0 : left.progress / left.target;
                    const rightRatio = right.target === 0 ? 0 : right.progress / right.target;
                    if (rightRatio !== leftRatio) {
                        return rightRatio - leftRatio;
                    }
                    return left.target - right.target;
                })[0] ?? null,
        [achievements],
    );

    const orderedAchievements = useMemo(
        () =>
            [...achievements].sort((left, right) => {
                if (left.status !== right.status) {
                    return left.status === "unlocked" ? -1 : 1;
                }
                return left.groupName.localeCompare(right.groupName) || left.title.localeCompare(right.title);
            }),
        [achievements],
    );

    return (
        <section className="page-swap page-from-right w-full max-w-5xl rounded-4xl border border-white/10 bg-white/5 p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h2 className="mt-2 font-display text-4xl text-white">Badge cabinet</h2>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <StatCard label="Unlocked" value={`${unlockedCount}`} accent="text-amber-100" />
                    <StatCard label="Locked" value={`${Math.max(achievements.length - unlockedCount, 0)}`} accent="text-cyan-100" />
                    <StatCard label="Complete" value={`${completion}%`} accent="text-emerald-100" />
                </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.84),rgba(8,47,73,0.78))] p-5 lg:col-span-2">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-slate-300/65">Next</p>
                    {nextAchievement ? (
                        <>
                            <div className="mt-4 flex items-start gap-4">
                                <div className={`achievement-medal achievement-medal-${nextAchievement.accent}`}>
                                    {nextAchievement.iconLabel}
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.28em] text-slate-400/70">
                                        {achievementScopeLabel(nextAchievement.gameScope)}
                                    </p>
                                    <h3 className="mt-2 font-display text-3xl text-white">{nextAchievement.title}</h3>
                                    <p className="mt-2 text-sm text-slate-300/75">{nextAchievement.description}</p>
                                </div>
                            </div>

                            <div className="mt-5 flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-slate-300/75">
                                <span>
                                    {formatNumber(nextAchievement.progress)}/{formatNumber(nextAchievement.target)}
                                </span>
                                <span>{Math.round((nextAchievement.progress / nextAchievement.target) * 100)}%</span>
                            </div>
                            <div className="mt-3 h-3 rounded-full bg-white/10">
                                <div
                                    className="achievement-progress h-full rounded-full"
                                    style={{ width: `${Math.min(100, (nextAchievement.progress / nextAchievement.target) * 100)}%` }}
                                />
                            </div>
                        </>
                    ) : (
                        <div className="mt-4 rounded-3xl border border-emerald-300/25 bg-emerald-400/10 px-5 py-6">
                            <h3 className="font-display text-3xl text-white">Cabinet complete</h3>
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {orderedAchievements.map(achievement => {
                    const progress = achievement.target === 0 ? 0 : Math.min(100, (achievement.progress / achievement.target) * 100);

                    return (
                        <article
                            key={achievement.id}
                            className={`achievement-card achievement-card-${achievement.accent} flex h-full flex-col rounded-3xl border p-5 ${
                                achievement.status === "unlocked" ? "shadow-[0_18px_45px_rgba(8,15,35,0.26)]" : "opacity-92"
                            }`}
                        >
                            <div className="flex items-start gap-4">
                                <div className={`achievement-medal achievement-medal-${achievement.accent}`}>{achievement.iconLabel}</div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-slate-200/75">
                                            {achievementScopeLabel(achievement.gameScope)}
                                        </span>
                                        <span className={`achievement-rarity achievement-rarity-${achievement.rarity}`}>
                                            {achievementRarityLabel(achievement.rarity)}
                                        </span>
                                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-slate-300/65">
                                            {achievement.status === "unlocked" ? "Unlocked" : "Locked"}
                                        </span>
                                    </div>
                                    <h3 className="mt-3 font-display text-3xl text-white">{achievement.title}</h3>
                                    <p className="mt-2 text-sm leading-6 text-slate-200/80">{achievement.description}</p>
                                    <p className="mt-3 text-[11px] uppercase tracking-[0.24em] text-slate-400/70">{achievement.groupName}</p>
                                </div>
                            </div>

                            <div className="mt-5 flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-slate-300/75">
                                <span>
                                    {formatNumber(achievement.progress)}/{formatNumber(achievement.target)}
                                </span>
                                <span>{Math.round(progress)}%</span>
                            </div>
                            <div className="mt-3 h-3 rounded-full bg-white/10">
                                <div className="achievement-progress h-full rounded-full" style={{ width: `${progress}%` }} />
                            </div>

                            <p className="mt-auto pt-4 text-xs uppercase tracking-[0.22em] text-slate-400/65">
                                {achievement.unlockedAt
                                    ? `Unlocked ${new Intl.DateTimeFormat("en-US", {
                                          month: "short",
                                          day: "numeric",
                                          hour: "numeric",
                                          minute: "2-digit",
                                      }).format(new Date(achievement.unlockedAt))}`
                                    : "Still in progress"}
                            </p>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400/70">{label}</p>
            <p className={`mt-1 font-display text-3xl ${accent}`}>{value}</p>
        </div>
    );
}
