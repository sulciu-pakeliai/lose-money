import { useEffect, useState } from "react";

type SessionTimerProps = {
    createdAt: string;
    label?: string;
    valueClassName?: string;
    labelClassName?: string;
};

function formatSessionElapsed(createdAt: string, nowMs: number): string {
    const startedAtMs = Date.parse(createdAt);
    if (Number.isNaN(startedAtMs)) {
        return "--:--:--";
    }

    const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
    const days = Math.floor(elapsedSeconds / 86400);
    const hours = Math.floor((elapsedSeconds % 86400) / 3600);
    const minutes = Math.floor((elapsedSeconds % 3600) / 60);
    const seconds = elapsedSeconds % 60;

    const clock = [hours, minutes, seconds].map(value => value.toString().padStart(2, "0")).join(":");
    return days > 0 ? `${days}d ${clock}` : clock;
}

export function SessionTimer({
    createdAt,
    label = "Session time",
    valueClassName,
    labelClassName,
}: SessionTimerProps) {
    const [elapsed, setElapsed] = useState(() => formatSessionElapsed(createdAt, Date.now()));

    useEffect(() => {
        const updateElapsed = () => {
            setElapsed(formatSessionElapsed(createdAt, Date.now()));
        };

        updateElapsed();
        const intervalId = window.setInterval(updateElapsed, 1000);
        return () => window.clearInterval(intervalId);
    }, [createdAt]);

    return (
        <div>
            <p className={labelClassName ?? "text-[10px] uppercase tracking-[0.24em] text-slate-400/70"}>{label}</p>
            <p className={valueClassName ?? "mt-1 font-display text-2xl text-white"}>{elapsed}</p>
        </div>
    );
}
