import { useEffect, useRef, useState } from "react";

const idleResetMs = 60 * 60 * 1000;
const activityWriteThrottleMs = 1000;
const startedAtStorageKey = "lm_activity_timer_started_at_v1";
const lastActivityStorageKey = "lm_activity_timer_last_activity_at_v1";

type SessionTimerProps = {
    label?: string;
    valueClassName?: string;
    labelClassName?: string;
};

function formatElapsed(elapsedMs: number): string {
    const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
    const days = Math.floor(elapsedSeconds / 86400);
    const hours = Math.floor((elapsedSeconds % 86400) / 3600);
    const minutes = Math.floor((elapsedSeconds % 3600) / 60);
    const seconds = elapsedSeconds % 60;

    const clock = [hours, minutes, seconds].map(value => value.toString().padStart(2, "0")).join(":");
    return days > 0 ? `${days}d ${clock}` : clock;
}

function parseStoredNumber(value: string | null): number | null {
    if (!value) {
        console.log('[SessionTimer] parseStoredNumber called with null/falsy');
        return null;
    }

    const parsed = Number(value);
    const result = Number.isFinite(parsed) ? parsed : null;
    console.log('[SessionTimer] parseStoredNumber:', { input: value, output: result });
    return result;
}

function clearStoredTimer() {
    window.localStorage.removeItem(startedAtStorageKey);
    window.localStorage.removeItem(lastActivityStorageKey);
}

function readTimerSnapshot(nowMs: number): { startedAtMs: number | null; lastActivityAtMs: number | null; elapsedMs: number } {
    const startedAtMs = parseStoredNumber(window.localStorage.getItem(startedAtStorageKey));
    const lastActivityAtMs = parseStoredNumber(window.localStorage.getItem(lastActivityStorageKey));

    console.log('[SessionTimer] readTimerSnapshot:', { startedAtMs, lastActivityAtMs, nowMs });

    if (startedAtMs === null || lastActivityAtMs === null) {
        return { startedAtMs: null, lastActivityAtMs: null, elapsedMs: 0 };
    }

    if (lastActivityAtMs > nowMs || startedAtMs > lastActivityAtMs) {
        clearStoredTimer();
        return { startedAtMs: null, lastActivityAtMs: null, elapsedMs: 0 };
    }

    if (nowMs - lastActivityAtMs >= idleResetMs) {
        clearStoredTimer();
        return { startedAtMs: null, lastActivityAtMs: null, elapsedMs: 0 };
    }

    return {
        startedAtMs,
        lastActivityAtMs,
        elapsedMs: nowMs - startedAtMs,
    };
}

function persistTimer(startedAtMs: number, lastActivityAtMs: number) {
    window.localStorage.setItem(startedAtStorageKey, String(startedAtMs));
    window.localStorage.setItem(lastActivityStorageKey, String(lastActivityAtMs));
    console.log('[SessionTimer] persistTimer:', { startedAtMs, lastActivityAtMs });
}

export function SessionTimer({
    label = "Session time",
    valueClassName,
    labelClassName,
}: SessionTimerProps) {
    const [elapsed, setElapsed] = useState("00:00:00");
    const lastRecordedActivityAtRef = useRef<number | null>(null);

    useEffect(() => {
        const syncFromStorage = () => {
            const snapshot = readTimerSnapshot(Date.now());
            lastRecordedActivityAtRef.current = snapshot.lastActivityAtMs;
            setElapsed(formatElapsed(snapshot.elapsedMs));
            console.log('[SessionTimer] syncFromStorage:', { snapshot, elapsed: formatElapsed(snapshot.elapsedMs) });
        };

        const recordActivity = () => {
            const nowMs = Date.now();
            const snapshot = readTimerSnapshot(nowMs);
            const startedAtMs = snapshot.startedAtMs ?? nowMs;

            if (
                snapshot.startedAtMs !== null &&
                lastRecordedActivityAtRef.current !== null &&
                nowMs - lastRecordedActivityAtRef.current < activityWriteThrottleMs
            ) {
                setElapsed(formatElapsed(nowMs - startedAtMs));
                return;
            }

            persistTimer(startedAtMs, nowMs);
            lastRecordedActivityAtRef.current = nowMs;
            setElapsed(formatElapsed(nowMs - startedAtMs));
            console.log('[SessionTimer] recordActivity fired, persisted:', startedAtMs, nowMs);
        };

        const handleStorage = (event: StorageEvent) => {
            if (event.key && event.key !== startedAtStorageKey && event.key !== lastActivityStorageKey) {
                return;
            }
            syncFromStorage();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                recordActivity();
                return;
            }
            syncFromStorage();
        };

        recordActivity();

        const intervalId = window.setInterval(syncFromStorage, 1000);
        const activityEvents: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "scroll", "focus", "mousemove", "touchstart"];
        for (const eventName of activityEvents) {
            window.addEventListener(eventName, recordActivity, { passive: true });
        }
        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("storage", handleStorage);

        return () => {
            window.clearInterval(intervalId);
            for (const eventName of activityEvents) {
                window.removeEventListener(eventName, recordActivity);
            }
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("storage", handleStorage);
        };
    }, []);

    return (
        <div>
            <p className={labelClassName ?? "text-[10px] uppercase tracking-[0.24em] text-slate-400/70"}>{label}</p>
            <p className={valueClassName ?? "mt-1 font-display text-2xl text-white"}>{elapsed}</p>
        </div>
    );
}
