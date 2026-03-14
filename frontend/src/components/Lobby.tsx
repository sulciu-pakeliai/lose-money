type LobbyProps = {
  onSelectCoinFlip: () => void;
  onSelectBlackjack: () => void;
};

const gameTiles = [
  {
    title: "Flipzilla",
    subtitle: "Coin Flip Game",
    description: "Fast 50/50 showdowns with a single click.",
    accent: "from-amber-400 via-pink-500 to-purple-500",
    icon: "🪙",
    onSelect: "coinflip",
  },
  {
    title: "High Table 21",
    subtitle: "Blackjack",
    description: "Take cards, read the dealer, and play a real hand with hit and stand.",
    accent: "from-emerald-300 via-cyan-400 to-blue-500",
    icon: "🂡",
    onSelect: "blackjack",
  },
] as const;

export function Lobby({ onSelectCoinFlip, onSelectBlackjack }: LobbyProps) {
  return (
    <section className="page-swap page-from-left w-full max-w-4xl rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Game lobby</p>
        <h2 className="mt-2 font-display text-3xl text-white">Choose what to play</h2>
      </div>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {gameTiles.map(tile => (
          <button
            key={tile.title}
            onClick={tile.onSelect === "coinflip" ? onSelectCoinFlip : onSelectBlackjack}
            className="group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/70 via-slate-900/70 to-slate-950/80 p-6 text-left transition hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_25px_60px_rgba(14,116,144,0.35)]"
            type="button"
          >
            <div className="absolute inset-0 opacity-0 transition group-hover:opacity-100">
              <div className="absolute -left-10 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-cyan-500/20 blur-3xl" />
            </div>
            <div className="relative">
              <div className="flex items-center gap-4">
                <div
                  className={`grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br ${tile.accent} text-2xl shadow-[0_12px_30px_rgba(248,113,113,0.35)]`}
                >
                  {tile.icon}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{tile.subtitle}</p>
                  <h3 className="mt-2 font-display text-3xl text-white">{tile.title}</h3>
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-300/70">{tile.description}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
