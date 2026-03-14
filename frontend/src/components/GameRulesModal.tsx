import { GAME_RULES, type GameRuleKey } from "../lib/gameRules";

type GameRulesModalProps = {
  game: GameRuleKey;
  onClose: () => void;
};

export function GameRulesModal({ game, onClose }: GameRulesModalProps) {
  const rules = GAME_RULES[game];

  return (
    <div className="rules-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-8 backdrop-blur-sm">
      <div className="rules-modal w-full max-w-3xl overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.96))] shadow-[0_40px_120px_rgba(2,6,23,0.6)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-cyan-200/70">{rules.eyebrow}</p>
            <h2 className="mt-2 font-display text-3xl text-white">{rules.title}</h2>
            <p className="mt-3 max-w-2xl text-sm text-slate-300/75">{rules.summary}</p>
          </div>
          <button
            onClick={onClose}
            className="arcade-button rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-200 transition hover:border-white/20 hover:bg-white/10"
            type="button"
          >
            Close
          </button>
        </div>

        <div className="grid gap-4 px-6 py-6 md:grid-cols-2">
          {rules.steps.map((step, index) => (
            <article key={step.title} className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/60">Step {index + 1}</p>
              <h3 className="mt-3 font-display text-2xl text-white">{step.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300/75">{step.body}</p>
            </article>
          ))}
        </div>

        <div className="border-t border-white/10 bg-white/5 px-6 py-4 text-sm text-slate-300/70">
          {rules.footer}
        </div>
      </div>
    </div>
  );
}
