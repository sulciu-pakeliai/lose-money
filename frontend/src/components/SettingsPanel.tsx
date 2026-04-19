import { useEffect, useState } from "react";
import {
    fetchSettings,
    setSelfExclusion,
    removeSelfExclusion,
    setBetLimit,
    removeBetLimit,
    setTheme,
    removeTheme,
    type SettingsDTO,
} from "../lib/session";
import { useTheme } from "../lib/theme";

const EXCLUSION_OPTIONS = [
    { label: "24 hours",  hours: 24 },
    { label: "3 days",    hours: 72 },
    { label: "1 week",    hours: 168 },
    { label: "1 month",   hours: 720 },
    { label: "6 months",  hours: 4320 },
];

export function SettingsPanel({ isLoggedIn }: { isLoggedIn: boolean }) {
    const [settings, setSettings] = useState<SettingsDTO | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [betLimitInput, setBetLimitInput] = useState("");
    const [confirmExclusion, setConfirmExclusion] = useState<number | null>(null);
    const { theme, setTheme: setAppTheme } = useTheme();

    useEffect(() => {
        fetchSettings()
            .then(setSettings)
            .catch(() => setSettings({}));
    }, []);

    useEffect(() => {
        if (settings?.theme && (settings.theme === "light" || settings.theme === "dark")) {
            setAppTheme(settings.theme);
        }
    }, [settings?.theme, setAppTheme]);

    const handleSetExclusion = async (hours: number) => {
        if (confirmExclusion !== hours) {
            setConfirmExclusion(hours);
            return;
        }
        setSaving(true);
        setError(null);
        try {
            setSettings(await setSelfExclusion(hours));
            setConfirmExclusion(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to set self-exclusion");
        } finally {
            setSaving(false);
        }
    };

    const handleRemoveExclusion = async () => {
        setSaving(true);
        setError(null);
        try {
            setSettings(await removeSelfExclusion());
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to remove self-exclusion");
        } finally {
            setSaving(false);
        }
    };

    const handleSetBetLimit = async () => {
        const parsed = Number(betLimitInput);
        if (!Number.isFinite(parsed) || parsed < 1) return;
        setSaving(true);
        setError(null);
        try {
            setSettings(await setBetLimit(parsed));
            setBetLimitInput("");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to set bet limit");
        } finally {
            setSaving(false);
        }
    };

    const handleRemoveBetLimit = async () => {
        setSaving(true);
        setError(null);
        try {
            setSettings(await removeBetLimit());
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to remove bet limit");
        } finally {
            setSaving(false);
        }
    };

    const handleSetTheme = async (newTheme: string) => {
        setSaving(true);
        setError(null);
        try {
            setSettings(await setTheme(newTheme));
            setAppTheme(newTheme as "light" | "dark");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to set theme");
        } finally {
            setSaving(false);
        }
    };

    const handleRemoveTheme = async () => {
        setSaving(true);
        setError(null);
        try {
            setSettings(await removeTheme());
            setAppTheme("dark"); // Default to dark
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to remove theme");
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="w-full max-w-2xl space-y-4">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Responsible Gambling</p>

            {error && (
                <p className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-xs uppercase tracking-[0.2em] text-rose-300">
                    {error}
                </p>
            )}

            {!isLoggedIn && (
                <div className="rounded-3xl border border-amber-300/20 bg-amber-300/5 p-6">
                    <p className="text-xs uppercase tracking-[0.3em] text-amber-200/70">Sign in required</p>
                    <p className="mt-2 text-sm text-slate-300/70">Self-exclusion and betting limits require a signed-in account.</p>
                </div>
            )}

            {/* Self Exclusion */}
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Self-Exclusion</p>
                <p className="mt-2 text-sm text-slate-300/70">
                    Temporarily block your access to the platform. While excluded you cannot place bets.
                </p>

                {settings?.selfExclusion ? (
                    <div className="mt-4 space-y-3">
                        <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.2em] text-rose-200">Self-exclusion active</p>
                            <p className="mt-1 text-sm text-slate-200/80">
                                Active until {new Date(settings.selfExclusion.excludedUntil).toLocaleString()}
                            </p>
                        </div>
                        <button
                            onClick={() => void handleRemoveExclusion()}
                            disabled={saving || !isLoggedIn}
                            className="rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-400 transition hover:text-white disabled:opacity-50"
                            type="button"
                        >
                            Remove exclusion
                        </button>
                    </div>
                ) : (
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {EXCLUSION_OPTIONS.map(opt => (
                            <button
                                key={opt.hours}
                                onClick={() => void handleSetExclusion(opt.hours)}
                                disabled={saving || !isLoggedIn}
                                className={`rounded-2xl border px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                    confirmExclusion === opt.hours
                                        ? "border-rose-400/60 bg-rose-400/20 text-rose-200"
                                        : "border-white/10 bg-white/5 text-slate-200/70 hover:border-white/20"
                                }`}
                                type="button"
                            >
                                {confirmExclusion === opt.hours ? `Confirm ${opt.label}` : opt.label}
                            </button>
                        ))}
                    </div>
                )}
                {confirmExclusion !== null && !settings?.selfExclusion && (
                    <p className="mt-3 text-xs text-rose-300/80">Click again to confirm. This will block your account from placing bets.</p>
                )}
            </div>

            {/* Bet Limit */}
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Betting Limit</p>
                <p className="mt-2 text-sm text-slate-300/70">
                    Set a maximum bet amount per wager for this session.
                </p>

                {settings?.betLimit ? (
                    <div className="mt-4 space-y-3">
                        <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Limit active</p>
                            <p className="mt-1 text-sm text-slate-200/80">
                                Max bet: ₵ {settings.betLimit.maxBetAmount.toLocaleString()}
                            </p>
                        </div>
                        <button
                            onClick={() => void handleRemoveBetLimit()}
                            disabled={saving || !isLoggedIn}
                            className="rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-400 transition hover:text-white disabled:opacity-50"
                            type="button"
                        >
                            Remove limit
                        </button>
                    </div>
                ) : (
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <input
                            type="number"
                            min={1}
                            max={10000}
                            value={betLimitInput}
                            onChange={e => setBetLimitInput(e.target.value)}
                            placeholder="Max bet amount"
                            disabled={!isLoggedIn}
                            className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60 disabled:opacity-50"
                        />
                        <button
                            onClick={() => void handleSetBetLimit()}
                            disabled={saving || !isLoggedIn || !betLimitInput}
                            className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50 set-limit-button"
                            type="button"
                        >
                            Set limit
                        </button>
                    </div>
                )}
            </div>

            {/* Theme */}
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Theme</p>
                <p className="mt-2 text-sm text-slate-300/70">
                    Choose your preferred UI theme.
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3">
                    <button
                        onClick={() => void handleSetTheme("light")}
                        disabled={saving}
                        className={`rounded-2xl border px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            theme === "light"
                                ? "selected-theme-light"
                                : "border-white/10 bg-white/5 text-slate-200/70 hover:border-white/20"
                        }`}
                        type="button"
                    >
                        Light
                    </button>
                    <button
                        onClick={() => void handleSetTheme("dark")}
                        disabled={saving}
                        className={`rounded-2xl border px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            theme === "dark"
                                ? "selected-theme-dark"
                                : "border-white/10 bg-white/5 text-slate-200/70 hover:border-white/20"
                        }`}
                        type="button"
                    >
                        Dark
                    </button>
                </div>

                {settings?.theme && (
                    <button
                        onClick={() => void handleRemoveTheme()}
                        disabled={saving}
                        className="mt-4 rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-400 transition hover:text-white disabled:opacity-50"
                        type="button"
                    >
                        Reset to default
                    </button>
                )}
            </div>
        </section>
    );
}