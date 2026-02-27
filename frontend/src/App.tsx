import "./index.css";

const navLinks = [{ label: "Lobby", active: true }];

const gameTiles = [
  {
    title: "Flipzilla",
    subtitle: "Coin Flip Game",
    accent: "from-amber-400 via-pink-500 to-purple-500",
  },
];

export function App() {
  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 pb-14 pt-10">
        <header className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600 p-[2px]">
                <div className="h-full w-full rounded-[14px] bg-slate-950/80 grid place-items-center font-display text-lg tracking-wide">
                  LM
                </div>
              </div>
              <div>
                <p className="font-display text-xl tracking-wide">LoseMoney</p>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-300/70">Game lobby preview</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2">
            {navLinks.map(link => (
              <button
                key={link.label}
                className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                  link.active
                    ? "bg-white/15 text-white shadow-[0_0_30px_rgba(56,189,248,0.25)]"
                    : "text-slate-200/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                {link.label}
              </button>
            ))}
          </nav>
        </header>

        <main className="flex flex-1 items-center justify-center py-12">
          <section className="w-full max-w-4xl rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Game shelves</p>
              <h2 className="mt-2 font-display text-3xl text-white">Preview placeholders</h2>
            </div>
            <div className="mt-8 flex justify-center">
              {gameTiles.map(tile => (
                <div
                  key={tile.title}
                  className="group relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/70 via-slate-900/70 to-slate-950/80 p-6 text-left"
                >
                  <div className="absolute inset-0 opacity-0 transition group-hover:opacity-100">
                    <div className="absolute -left-10 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-cyan-500/20 blur-3xl" />
                  </div>
                  <div className="relative">
                    <div className="flex items-center gap-4">
                      <div
                        className={`grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br ${tile.accent} text-2xl shadow-[0_12px_30px_rgba(248,113,113,0.35)]`}
                      >
                        🪙
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{tile.subtitle}</p>
                        <h3 className="mt-2 font-display text-3xl text-white">{tile.title}</h3>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
