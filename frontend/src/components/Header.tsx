import type { Session } from "../lib/session";
import { SessionTimer } from "./SessionTimer";
import lmLogo from "../logo.svg";

type HeaderProps = {
    session: Session | null;
    showAuthActions: boolean;
    isLobby: boolean;
    isMissions: boolean;
    isAchievements: boolean;
    isHistory: boolean;
    isNotifications: boolean;
    claimableMissionCount: number;
    unreadNotificationCount: number;
    unlockedAchievementCount: number;
    isProfile: boolean;
    isSettings: boolean;
    onLobbyClick: () => void;
    onMissionsClick: () => void;
    onAchievementsClick: () => void;
    onHistoryClick: () => void;
    onNotificationsClick: () => void;
    onTopUpClick: () => void;
    onSignInClick: () => void;
    onLogoutClick: () => void;
    onProfileClick: () => void;
    onSettingsClick: () => void;
};

const formatNumber = (value: number) =>
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);

export function Header({
    session,
    showAuthActions,
    isLobby,
    isMissions,
    isAchievements,
    isHistory,
    isNotifications,
    claimableMissionCount,
    unreadNotificationCount,
    unlockedAchievementCount,
    isProfile,
    isSettings,
    onLobbyClick,
    onMissionsClick,
    onAchievementsClick,
    onHistoryClick,
    onNotificationsClick,
    onTopUpClick,
    onSignInClick,
    onLogoutClick,
    onProfileClick,
    onSettingsClick,
}: HeaderProps) {
    const balance = session?.balance ?? 0;
    const level = session?.level ?? 1;
    const xp = session?.xp ?? 0;
    const xpIntoLevel = session?.xpIntoLevel ?? 0;
    const xpForNextLevel = session?.xpForNextLevel ?? 1;
    const gamesPlayed = session?.gamesPlayed ?? 0;
    const progress = Math.min(100, Math.max(0, (xpIntoLevel / xpForNextLevel) * 100));
    const accountName = session?.userEmail ? session.userEmail.split("@")[0] : null;

    return (
        <header className="flex flex-col gap-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_13.5rem]">
                <div className="flex min-w-0 flex-col gap-4 rounded-4xl border border-white/10 bg-white/5 p-5">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex min-w-0 shrink-0 items-center gap-3">
                            <div className="h-12 w-12 rounded-2xl logo-badge p-0.5">
                                <div className="grid h-full w-full place-items-center rounded-[14px] logo-badge-inner bg-slate-950/80 font-display text-lg tracking-wide">
                                    <img src={lmLogo} alt="LoseMoney logo" className="h-full w-full rounded-[14px]" />
                                </div>
                            </div>
                            <div>
                                <p className="font-display text-xl tracking-wide">LoseMoney</p>
                            </div>
                        </div>
                        {session && (
                            <div className="shrink-0">
                                <div className="flex items-center gap-3 rounded-full border border-cyan-300/15 bg-cyan-400/8 px-4 py-2 text-left">
                                    <SessionTimer
                                        containerClassName="flex items-baseline gap-3"
                                        labelClassName="text-[9px] uppercase tracking-[0.2em] text-cyan-100/65"
                                        valueClassName="font-display text-base leading-none text-cyan-50"
                                    />
                                </div>
                            </div>
                        )}
                        <div className="ml-auto flex flex-wrap items-center gap-3">
                            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-300/80 balance-field">
                                Balance
                                <span className="ml-3 font-display text-base text-white">₵ {formatNumber(balance)}</span>
                            </div>
                            <button
                                onClick={onTopUpClick}
                                className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200 transition hover:bg-cyan-400/20 topup-button"
                                type="button"
                            >
                                +
                            </button>
                        </div>
                    </div>

                    <nav
                        className="mt-auto flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2"
                        aria-label="Primary"
                    >
                        <button
                            onClick={onLobbyClick}
                            aria-current={isLobby ? "page" : undefined}
                            className={`shrink-0 rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition duration-200 hover:bg-white/20 ${isLobby
                                    ? "bg-white/15 text-white shadow-[0_0_30px_rgba(56,189,248,0.25)]"
                                    : "text-slate-200/70 hover:text-white"
                                }`}
                            type="button"
                        >
                            Lobby
                        </button>

                        <button
                            onClick={onMissionsClick}
                            aria-current={isMissions ? "page" : undefined}
                            className={`shrink-0 rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition duration-200 hover:bg-white/20 ${isMissions
                                    ? "bg-white/15 text-white shadow-[0_0_30px_rgba(56,189,248,0.25)]"
                                    : "text-slate-200/70 hover:text-white"
                                }`}
                            type="button"
                        >
                            Missions
                            {claimableMissionCount > 0 && (
                                <span className="ml-2 rounded-full bg-amber-300 px-2 py-0.5 text-[10px] tracking-[0.12em] text-slate-950">
                                    {claimableMissionCount}
                                </span>
                            )}
                        </button>

                        <button
                            onClick={onAchievementsClick}
                            aria-current={isAchievements ? "page" : undefined}
                            className={`shrink-0 rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition duration-200 hover:bg-white/20 ${isAchievements
                                    ? "bg-white/15 text-white shadow-[0_0_30px_rgba(56,189,248,0.25)]"
                                    : "text-slate-200/70 hover:text-white"
                                }`}
                            type="button"
                        >
                            Badges
                            {unlockedAchievementCount > 0 && (
                                <span className="ml-2 rounded-full bg-emerald-300 px-2 py-0.5 text-[10px] tracking-[0.12em] text-slate-950">
                                    {unlockedAchievementCount}
                                </span>
                            )}
                        </button>

                        <button
                            onClick={onHistoryClick}
                            aria-current={isHistory ? "page" : undefined}
                            className={`shrink-0 rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition duration-200 hover:bg-white/20 ${isHistory
                                    ? "bg-white/15 text-white shadow-[0_0_30px_rgba(56,189,248,0.25)]"
                                    : "text-slate-200/70 hover:text-white"
                                }`}
                            type="button"
                        >
                            History
                        </button>

                        <button
                            onClick={onNotificationsClick}
                            aria-current={isNotifications ? "page" : undefined}
                            className={`shrink-0 rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition duration-200 hover:bg-white/20 ${isNotifications
                                    ? "bg-white/15 text-white shadow-[0_0_30px_rgba(56,189,248,0.25)]"
                                    : "text-slate-200/70 hover:text-white"
                                }`}
                            type="button"
                        >
                            Alerts
                            {unreadNotificationCount > 0 && (
                                <span className="ml-2 rounded-full bg-cyan-300 px-2 py-0.5 text-[10px] tracking-[0.12em] text-slate-950">
                                    {unreadNotificationCount}
                                </span>
                            )}
                        </button>

                        <button
                            onClick={onSettingsClick}
                            aria-current={isSettings ? "page" : undefined}
                            className={`shrink-0 rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition duration-200 hover:bg-white/20 ${isSettings
                                ? "bg-white/15 text-white shadow-[0_0_30px_rgba(56,189,248,0.25)]"
                                : "text-slate-200/70 hover:text-white"
                            }`}
                            type="button"
                        >
                            Settings
                        </button>
                    </nav>
                </div>

                <section className="level-panel overflow-hidden rounded-4xl border border-amber-300/20 p-3">
                    <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-center">
                            <p className="text-[9px] uppercase tracking-[0.22em] text-amber-100/65">Level</p>
                            <p className="mt-1 font-display text-3xl leading-none text-white">{level}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-center">
                            <p className="text-[9px] uppercase tracking-[0.22em] text-amber-100/65">Games</p>
                            <p className="mt-1 font-display text-3xl leading-none text-white">{formatNumber(gamesPlayed)}</p>
                        </div>
                    </div>

                    <div className="mt-3 rounded-2xl border border-white/10 bg-black/15 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-[9px] uppercase tracking-[0.18em] text-amber-100/65">{formatNumber(xp)} XP</p>
                            {!showAuthActions ? (
                                <div className="h-6" />
                            ) : session?.userId ? (
                                <div className="flex min-w-0 items-center gap-1.5">
                                    <p className="max-w-16 truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-100/75">
                                        {accountName ?? "Account"}
                                    </p>
                                    <button
                                        onClick={onProfileClick}
                                        className="rounded-full border border-amber-300/30 bg-amber-300/8 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-amber-200 transition hover:bg-amber-300/12"
                                        type="button"
                                    >
                                        Profile
                                    </button>
                                    <button
                                        onClick={onLogoutClick}
                                        className="rounded-full border border-rose-400/50 bg-rose-500/20 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-rose-200 transition hover:bg-rose-500/30"
                                        type="button"
                                    >
                                        Out
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={onSignInClick}
                                    className="rounded-full border border-cyan-400/30 bg-cyan-400/8 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-cyan-200 transition hover:bg-cyan-400/12"
                                    type="button"
                                >
                                    Sign in
                                </button>
                            )}
                        </div>

                        <div className="mt-2 flex items-center justify-between text-[9px] uppercase tracking-[0.14em] text-amber-50/70">
                            <span>{formatNumber(xpIntoLevel)} XP</span>
                            <span>{formatNumber(xpForNextLevel)} to next</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/25">
                            <div className="level-panel-fill h-full rounded-full" style={{ width: `${progress}%` }} />
                        </div>
                    </div>
                </section>
            </div>
        </header>
    );
}
