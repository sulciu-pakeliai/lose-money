import type { Session } from "../lib/session";
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

function NavItem({
    isActive,
    label,
    badge,
    badgeTone = "bg-cyan-300 text-slate-950",
    onClick,
}: {
    isActive: boolean;
    label: string;
    badge?: number;
    badgeTone?: string;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            aria-current={isActive ? "page" : undefined}
            className={`group relative shrink-0 rounded-2xl px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition duration-200 ${
                isActive
                    ? "bg-white text-slate-950 shadow-[0_14px_34px_rgba(15,23,42,0.24)]"
                    : "text-slate-200/75 hover:bg-white/10 hover:text-white"
            }`}
            type="button"
        >
            <span>{label}</span>
            {badge !== undefined && badge > 0 && (
                <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] tracking-[0.12em] ${badgeTone}`}>
                    {badge}
                </span>
            )}
        </button>
    );
}

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
        <header className="casino-header overflow-hidden border border-white/10 bg-slate-950/72 shadow-[0_30px_90px_rgba(2,6,23,0.32)] backdrop-blur">
            <div className="flex flex-wrap items-center justify-center gap-10 px-8 py-2">
                <div className="flex min-w-0 items-center gap-2.5">
                    <div className="h-12 w-12 shrink-0 rounded-2xl logo-badge p-0.5">
                        <div className="grid h-full w-full place-items-center rounded-[14px] logo-badge-inner bg-slate-950/80">
                            <img src={lmLogo} alt="LoseMoney logo" className="h-full w-full rounded-[14px]" />
                        </div>
                    </div>
                    <div className="min-w-0">
                        <p className="font-display text-xl leading-none tracking-wide text-white">LoseMoney</p>
                        <p className="mt-1 text-[9px] uppercase tracking-[0.22em] text-cyan-100/60">Casino console</p>
                    </div>
                </div>

                <div className="w-full max-w-[21rem] rounded-3xl border border-white/10 bg-white/5 px-2.5 py-2 sm:w-[21rem]">
                    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5">
                        <div className="grid h-9 w-9 place-items-center rounded-2xl border border-amber-300/25 bg-amber-300/10">
                            <span className="font-display text-xl leading-none text-white">{level}</span>
                        </div>

                        <div className="min-w-0">
                            <div className="flex items-center justify-between gap-3 text-[9px] uppercase tracking-[0.14em] text-slate-300/70">
                                <span>Level {level}</span>
                                <span>{formatNumber(xpIntoLevel)} / {formatNumber(xpForNextLevel)}</span>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30">
                                <div className="level-panel-fill h-full rounded-full" style={{ width: `${progress}%` }} />
                            </div>
                        </div>

                        <div className="text-right">
                            <p className="text-[9px] uppercase tracking-[0.18em] text-slate-400/70">Games</p>
                            <p className="mt-1 font-display text-xl leading-none text-white">{formatNumber(gamesPlayed)}</p>
                        </div>
                    </div>
                </div>

                <div className="flex overflow-hidden rounded-2xl border border-white/10 bg-white/5 balance-field">
                    <div className="min-w-40 px-3.5 py-2 text-xs uppercase tracking-[0.16em] text-slate-300/80">
                        <div className="flex items-baseline justify-between gap-2.5">
                            <span>Balance</span>
                            <span className="font-display text-base text-white">₵ {formatNumber(balance)}</span>
                        </div>
                    </div>
                    <button
                        onClick={onTopUpClick}
                        aria-label="Top up balance"
                        className="grid h-10 w-10 place-items-center border-l border-white/10 bg-cyan-400/10 font-display text-xl leading-none text-cyan-100 transition hover:bg-cyan-400/20"
                        type="button"
                    >
                        +
                    </button>
                </div>

                {showAuthActions && session?.userId && (
                    <div className="flex min-w-0 gap-2">
                        <button
                            onClick={onProfileClick}
                            aria-current={isProfile ? "page" : undefined}
                            className={`min-w-0 flex-1 truncate rounded-2xl border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                                isProfile
                                    ? "border-amber-300/50 bg-amber-300/20 text-amber-100"
                                    : "border-amber-300/25 bg-amber-300/8 text-amber-100/80 hover:bg-amber-300/12"
                            }`}
                            type="button"
                        >
                            {accountName ?? "Profile"}
                        </button>
                        <button
                            onClick={onLogoutClick}
                            className="rounded-2xl border border-rose-400/50 bg-rose-500/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-rose-200 transition hover:bg-rose-500/30"
                            type="button"
                        >
                            Out
                        </button>
                    </div>
                )}

                {showAuthActions && !session?.userId && (
                    <button
                        onClick={onSignInClick}
                        className="rounded-2xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-100 transition hover:bg-white/10"
                        type="button"
                    >
                        Sign in
                    </button>
                )}
            </div>

            <nav className="flex gap-1.5 overflow-x-auto border-t border-white/10 bg-black/20 px-8 py-2" aria-label="Primary">
                <NavItem isActive={isLobby} label="Lobby" onClick={onLobbyClick} />
                <NavItem
                    isActive={isMissions}
                    label="Missions"
                    badge={claimableMissionCount}
                    badgeTone="bg-amber-300 text-slate-950"
                    onClick={onMissionsClick}
                />
                <NavItem
                    isActive={isAchievements}
                    label="Badges"
                    badge={unlockedAchievementCount}
                    badgeTone="bg-emerald-300 text-slate-950"
                    onClick={onAchievementsClick}
                />
                <NavItem isActive={isHistory} label="History" onClick={onHistoryClick} />
                <NavItem
                    isActive={isNotifications}
                    label="Alerts"
                    badge={unreadNotificationCount}
                    onClick={onNotificationsClick}
                />
                <NavItem isActive={isSettings} label="Settings" onClick={onSettingsClick} />
            </nav>
        </header>
    );
}
