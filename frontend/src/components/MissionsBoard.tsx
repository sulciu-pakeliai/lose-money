import { useEffect, useMemo, useState } from "react";
import type { Mission, MissionClaimResult } from "../lib/session";

type MissionsBoardProps = {
    missions: Mission[];
    onClaim: (missionId: string) => Promise<MissionClaimResult>;
};

function formatReward(value: number) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatResetDistance(resetsAt: string, now: number) {
    const remainingMs = new Date(resetsAt).getTime() - now;
    if (remainingMs <= 0) {
        return "Resetting soon";
    }

    const totalMinutes = Math.floor(remainingMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours <= 0) {
        return `${minutes}m left`;
    }

    return `${hours}h ${minutes}m left`;
}

export function MissionsBoard({ missions, onClaim }: MissionsBoardProps) {
    const [claimingId, setClaimingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const interval = window.setInterval(() => {
            setNow(Date.now());
        }, 60000);

        return () => window.clearInterval(interval);
    }, []);

    const sortedMissions = useMemo(() => {
        const statusWeight: Record<Mission["status"], number> = {
            claimable: 0,
            in_progress: 1,
            claimed: 2,
        };

        return [...missions].sort((left, right) => {
            const byStatus = statusWeight[left.status] - statusWeight[right.status];
            if (byStatus !== 0) {
                return byStatus;
            }
            return left.groupName.localeCompare(right.groupName);
        });
    }, [missions]);

    const claimableCount = missions.filter(mission => mission.status === "claimable").length;
    const resetsAt = missions[0]?.resetsAt;

    const handleClaim = async (missionId: string) => {
        setError(null);
        setClaimingId(missionId);
        try {
            await onClaim(missionId);
        } catch (claimError) {
            setError(claimError instanceof Error ? claimError.message : "Failed to claim mission reward");
        } finally {
            setClaimingId(null);
        }
    };

    return (
        <section className="page-swap page-from-right w-full max-w-5xl rounded-[2rem] border border-white/10 bg-white/5 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Mission control</p>
                    <h2 className="mt-2 font-display text-4xl text-white">Daily missions</h2>
                    <p className="mt-2 max-w-2xl text-sm text-slate-300/75">
                        Every day assigns one casino-wide objective plus one mission for each game. Claim rewards straight into your balance.
                    </p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-right">
                        <p className="text-[10px] uppercase tracking-[0.3em] text-amber-100/65">Claimable</p>
                        <p className="mt-2 font-display text-3xl text-white">{claimableCount}</p>
                    </div>
                    {resetsAt && (
                        <div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 py-3 text-right">
                            <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-100/65">Reset</p>
                            <p className="mt-2 font-display text-2xl text-white">{formatResetDistance(resetsAt, now)}</p>
                        </div>
                    )}
                </div>
            </div>

            {error && (
                <div className="mt-5 rounded-2xl border border-rose-400/35 bg-rose-400/10 px-4 py-3 text-xs uppercase tracking-[0.24em] text-rose-100">
                    {error}
                </div>
            )}

            <div className="mt-6 grid gap-4 lg:grid-cols-3">
                {sortedMissions.map(mission => {
                    const progress = Math.min(100, (mission.progress / mission.target) * 100);
                    const isClaiming = claimingId === mission.id;
                    const canClaim = mission.status === "claimable" && !isClaiming;
                    const tone =
                        mission.status === "claimable"
                            ? "border-emerald-400/35 bg-emerald-400/10"
                            : mission.status === "claimed"
                                ? "border-slate-400/25 bg-slate-400/8"
                                : "border-white/10 bg-black/20";

                    return (
                        <article key={mission.id} className={`rounded-3xl border p-5 ${tone}`}>
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.3em] text-slate-300/65">{mission.groupName}</p>
                                    <h3 className="mt-2 font-display text-3xl text-white">{mission.title}</h3>
                                </div>
                                <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-slate-200/75">
                                    {mission.status === "claimable" ? "Ready" : mission.status === "claimed" ? "Claimed" : "Active"}
                                </div>
                            </div>

                            <p className="mt-3 text-sm text-slate-200/75">{mission.description}</p>

                            <div className="mt-5 flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-slate-300/75">
                                <span>
                                    {mission.progress}/{mission.target}
                                </span>
                                <span>{Math.round(progress)}%</span>
                            </div>
                            <div className="mt-3 h-3 rounded-full bg-white/10">
                                <div className="level-panel-fill h-full rounded-full" style={{ width: `${progress}%` }} />
                            </div>

                            <div className="mt-5 flex flex-wrap gap-2">
                                <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-[11px] uppercase tracking-[0.22em] text-cyan-100">
                                    +₵ {formatReward(mission.rewardBalance)}
                                </span>
                                <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[11px] uppercase tracking-[0.22em] text-amber-100">
                                    +{formatReward(mission.rewardXp)} XP
                                </span>
                            </div>

                            <button
                                onClick={() => void handleClaim(mission.id)}
                                disabled={!canClaim}
                                className={`arcade-button mt-5 w-full rounded-2xl px-4 py-3 text-xs font-semibold uppercase tracking-[0.22em] transition disabled:cursor-not-allowed disabled:opacity-55 ${mission.status === "claimed"
                                        ? "border border-white/10 bg-white/5 text-slate-300"
                                        : mission.status === "claimable"
                                            ? "bg-emerald-300 text-slate-950 hover:bg-emerald-200"
                                            : "border border-white/10 bg-white/5 text-slate-300"
                                    }`}
                                type="button"
                            >
                                {isClaiming ? "Claiming..." : mission.status === "claimable" ? "Claim reward" : mission.status === "claimed" ? "Reward claimed" : "In progress"}
                            </button>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}
