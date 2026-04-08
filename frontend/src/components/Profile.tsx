import { useEffect, useState } from "react";
import { fetchProfile, type ProfileStats, type Session } from "../lib/session";
import { SessionTimer } from "./SessionTimer";

type ProfileProps = {
  session: Session;
  onDeleteAccount: () => Promise<void>;
};

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);

export function Profile({ session, onDeleteAccount }: ProfileProps) {
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchProfile()
      .then(setStats)
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load profile"));
  }, []);

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "Delete this account permanently? This removes your saved data and you will not be able to log in with this account again.",
    );
    if (!confirmed) {
      return;
    }

    setDeleteError(null);
    setIsDeleting(true);
    try {
      await onDeleteAccount();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete account");
      setIsDeleting(false);
    }
  };

  const winRate =
    stats && stats.totalBets > 0
      ? Math.round((stats.totalWins / stats.totalBets) * 100)
      : 0;

  return (
    <section className="w-full max-w-2xl space-y-4">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Profile</p>

      {/* Session info */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Level" value={`${session.level}`} />
          <Stat label="Total XP" value={formatNumber(session.xp)} />
          <Stat label="Games Played" value={formatNumber(session.gamesPlayed)} />
          <Stat label="Balance" value={`₵ ${formatNumber(session.balance)}`} />
        </div>

        <div className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-400/8 px-4 py-3">
          <SessionTimer
            createdAt={session.createdAt}
            labelClassName="text-[10px] uppercase tracking-[0.25em] text-cyan-100/65"
            valueClassName="mt-1 font-display text-2xl text-cyan-50"
          />
        </div>

        {/* XP progress bar */}
        <div className="mt-6">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-slate-400/70">
            <span>{formatNumber(session.xpIntoLevel)} XP</span>
            <span>{formatNumber(session.xpForNextLevel)} XP to level {session.level + 1}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all"
              style={{ width: `${Math.min(100, (session.xpIntoLevel / session.xpForNextLevel) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Bet stats */}
      {error && (
        <p className="text-center text-xs uppercase tracking-[0.3em] text-rose-300">{error}</p>
      )}

      {!stats && !error && (
        <p className="text-center text-xs uppercase tracking-[0.3em] text-slate-500">Loading stats...</p>
      )}

      {stats && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Stats</p>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat label="Total Bets" value={formatNumber(stats.totalBets)} />
            <Stat label="Wins" value={formatNumber(stats.totalWins)} accent="text-emerald-300" />
            <Stat label="Losses" value={formatNumber(stats.totalLoss)} accent="text-rose-300" />
            <Stat label="Win Rate" value={`${winRate}%`} />
            <Stat label="Total Wagered" value={`₵ ${formatNumber(stats.totalWagered)}`} />
            <Stat label="Biggest Win" value={`₵ ${formatNumber(stats.biggestWin)}`} accent="text-amber-300" />
          </div>
        </div>
      )}

      <div className="rounded-3xl border border-rose-400/30 bg-rose-500/10 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-rose-200/85">Account Settings</p>
            <p className="text-sm text-rose-100/80">
              Permanently delete {session.userEmail ?? "this account"} and remove its saved profile, session data, and login access.
            </p>
            <p className="text-xs uppercase tracking-[0.22em] text-rose-200/70">
              This action cannot be undone.
            </p>
          </div>

          <button
            onClick={() => {
              void handleDeleteAccount();
            }}
            className="rounded-full border border-rose-300/60 bg-rose-500/20 px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-rose-100 transition hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete Account"}
          </button>
        </div>

        {deleteError && (
          <p className="mt-4 text-xs uppercase tracking-[0.24em] text-rose-200">{deleteError}</p>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, accent = "text-white" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400/70">{label}</p>
      <p className={`mt-1 font-display text-xl ${accent}`}>{value}</p>
    </div>
  );
}
