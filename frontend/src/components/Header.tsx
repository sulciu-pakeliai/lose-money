type HeaderProps = {
  balance: number;
  isLobby: boolean;
  isHistory: boolean;
  onLobbyClick: () => void;
  onHistoryClick: () => void;
  onTopUpClick: () => void;
};

const formatBalance = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);

export function Header({ balance, isLobby, isHistory, onLobbyClick, onHistoryClick, onTopUpClick }: HeaderProps) {
  return (
    <header className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600 p-[2px]">
            <div className="grid h-full w-full place-items-center rounded-[14px] bg-slate-950/80 font-display text-lg tracking-wide">
              LM
            </div>
          </div>
          <div>
            <p className="font-display text-xl tracking-wide">LoseMoney</p>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-300/70">Game lobby preview</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-300/80">
            Balance
            <span className="ml-3 font-display text-base text-white">₵ {formatBalance(balance)}</span>
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
        className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-white/5 px-3 py-2"
        aria-label="Primary"
      >
        <button
          onClick={onLobbyClick}
          aria-current={isLobby ? "page" : undefined}
          className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition duration-200 hover:scale-[1.03] hover:bg-white/20 active:scale-95 ${
            isLobby
              ? "bg-white/15 text-white shadow-[0_0_30px_rgba(56,189,248,0.25)]"
              : "text-slate-200/70 hover:text-white"
          }`}
          type="button"
        >
          Lobby
        </button>

        <button
          onClick={onHistoryClick}
          aria-current={isHistory ? "page" : undefined}
          className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition duration-200 hover:scale-[1.03] hover:bg-white/20 active:scale-95 ${
            isHistory
              ? "bg-white/15 text-white shadow-[0_0_30px_rgba(56,189,248,0.25)]"
              : "text-slate-200/70 hover:text-white"
          }`}
          type="button"
        >
          History
        </button>

      </nav>
    </header>
  );
}
