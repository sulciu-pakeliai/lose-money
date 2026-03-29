import { useEffect } from "react";
import type { Achievement } from "../lib/session";

type AchievementUnlockToastsProps = {
    achievements: Achievement[];
    onDismiss: (templateKey: string) => void;
};

export function AchievementUnlockToasts({ achievements, onDismiss }: AchievementUnlockToastsProps) {
    if (achievements.length === 0) {
        return null;
    }

    return (
        <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-3">
            {achievements.map(achievement => (
                <AchievementUnlockToast
                    key={achievement.templateKey}
                    achievement={achievement}
                    onDismiss={() => onDismiss(achievement.templateKey)}
                />
            ))}
        </div>
    );
}

function AchievementUnlockToast({
    achievement,
    onDismiss,
}: {
    achievement: Achievement;
    onDismiss: () => void;
}) {
    useEffect(() => {
        const timeout = window.setTimeout(() => {
            onDismiss();
        }, 4600);

        return () => window.clearTimeout(timeout);
    }, [onDismiss]);

    return (
        <article className={`achievement-toast achievement-toast-${achievement.accent} pointer-events-auto rounded-3xl border p-4`}>
            <div className="flex items-start gap-4">
                <div className={`achievement-medal achievement-medal-${achievement.accent} h-14 w-14 text-sm`}>
                    {achievement.iconLabel}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-slate-300/70">Achievement unlocked</p>
                    <h3 className="mt-2 font-display text-2xl text-white">{achievement.title}</h3>
                    <p className="mt-2 text-sm text-slate-200/80">{achievement.description}</p>
                </div>
                <button
                    onClick={onDismiss}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-200 transition hover:bg-white/10"
                    type="button"
                >
                    Close
                </button>
            </div>
        </article>
    );
}
