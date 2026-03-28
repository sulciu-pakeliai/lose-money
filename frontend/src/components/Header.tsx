import type { Session } from "../lib/session";

type HeaderProps = {
    session: Session | null;
    showAuthActions: boolean;
    isLobby: boolean;
    isMissions: boolean;
    isHistory: boolean;
    claimableMissionCount: number;
    isProfile: boolean;
    onLobbyClick: () => void;
    onMissionsClick: () => void;
    onHistoryClick: () => void;
    onTopUpClick: () => void;
    onSignInClick: () => void;
    onSignUpClick: () => void;
    onLogoutClick: () => void;
    onProfileClick: () => void;
};

const formatNumber = (value: number) =>
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);

export function Header({
    session,
    showAuthActions,
    isLobby,
    isMissions,
    isHistory,
    claimableMissionCount,
    isProfile,
    onLobbyClick,
    onMissionsClick,
    onHistoryClick,
    onTopUpClick,
    onSignInClick,
    onSignUpClick,
    onLogoutClick,
    onProfileClick,
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
        <header className="flex flex-col gap-6">
            <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/5 p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600 p-[2px]">
                                <div className="grid h-full w-full place-items-center rounded-[14px] bg-slate-950/80 font-display text-lg tracking-wide">
                                    LM
                                </div>
                            </div>
                            <div>
                                <p className="font-display text-xl tracking-wide">LoseMoney</p>
                                <p className="text-xs uppercase tracking-[0.24em] text-slate-300/70">Casino rank ladder online</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-300/80">
                                Balance
                                <span className="ml-3 font-display text-base text-white">₵ {formatNumber(balance)}</span>
                            </div>
                            <button
                                onClick={onTopUpClick}
                                className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200 transition hover:bg-cyan-400/20"
                                type="button"
                            >
                                +
                            </button>
                        </div>
                    </div>

                    <nav
                        className="mt-auto flex items-center gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-white/5 px-3 py-2"
                        aria-label="Primary"
                    >
                        <button
                            onClick={onLobbyClick}
                            aria-current={isLobby ? "page" : undefined}
                            className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition duration-200 hover:scale-[1.03] hover:bg-white/20 active:scale-95 ${isLobby
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
                            className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition duration-200 hover:scale-[1.03] hover:bg-white/20 active:scale-95 ${isMissions
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
                            onClick={onHistoryClick}
                            aria-current={isHistory ? "page" : undefined}
                            className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition duration-200 hover:scale-[1.03] hover:bg-white/20 active:scale-95 ${isHistory
                                    ? "bg-white/15 text-white shadow-[0_0_30px_rgba(56,189,248,0.25)]"
                                    : "text-slate-200/70 hover:text-white"
                                }`}
                            type="button"
                        >
                            History
                        </button>
                    </nav>
                </div>

                <section className="level-panel overflow-hidden rounded-[2rem] border border-amber-300/20 p-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-xs uppercase tracking-[0.32em] text-amber-100/70">Player Level</p>
                            <h2 className="mt-2 font-display text-4xl text-white">Level {level}</h2>
                            <p className="mt-2 text-sm text-amber-50/75">{formatNumber(xp)} total XP earned at the tables.</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-right">
                            <p className="text-[10px] uppercase tracking-[0.3em] text-amber-100/60">Sessions</p>
                            <p className="mt-2 font-display text-2xl text-white">{formatNumber(gamesPlayed)}</p>
                        </div>
                    </div>

                    <div className="mt-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            {!showAuthActions ? (
                                <div className="h-8" />
                            ) : session?.userId ? (
                                <>
                                    <p className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-amber-100/75">
                                        {accountName ?? "Account"}
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={onProfileClick}
                                            className="rounded-full border border-amber-300/30 bg-amber-300/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200 transition hover:bg-amber-300/12"
                                            type="button"
                                        >
                                            Profile
                                        </button>
                                        <button
                                            onClick={onLogoutClick}
                                            className="rounded-full border border-rose-400/50 bg-rose-500/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-rose-200 transition hover:bg-rose-500/30"
                                            type="button"
                                        >
                                            Logout
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="ml-auto flex gap-2">
                                    <button
                                        onClick={onSignUpClick}
                                        className="rounded-full border border-amber-300/30 bg-amber-300/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200 transition hover:bg-amber-300/12"
                                        type="button"
                                    >
                                        Sign up
                                    </button>
                                    <button
                                        onClick={onSignInClick}
                                        className="rounded-full border border-cyan-400/30 bg-cyan-400/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200 transition hover:bg-cyan-400/12"
                                        type="button"
                                    >
                                        Sign in
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-amber-50/70">
                            <span>{formatNumber(xpIntoLevel)} XP</span>
                            <span>{formatNumber(xpForNextLevel)} XP to next level</span>
                        </div>
                        <div className="mt-3 h-3 overflow-hidden rounded-full bg-black/25">
                            <div className="level-panel-fill h-full rounded-full" style={{ width: `${progress}%` }} />
                        </div>
                    </div>
                </section>
            </div>
        </header>
    );
}
