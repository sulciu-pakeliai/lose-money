import { useEffect, useState } from "react";
import type { TopUpPolicy } from "../lib/session";

type TopUpProps = {
  policy: TopUpPolicy;
  onConfirm: (amount: number) => Promise<void>;
  onCancel: () => void;
};

const formatBalance = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);

export function TopUp({ policy, onConfirm, onCancel }: TopUpProps) {
  const [selectedAmount, setSelectedAmount] = useState<number>(policy.allowedAmounts[0] ?? 0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setSelectedAmount(policy.allowedAmounts[0] ?? 0);
  }, [policy.allowedAmounts]);

  const availableAtMs = policy.availableAt ? new Date(policy.availableAt).getTime() : 0;
  const cooldownRemainingMs = Math.max(0, availableAtMs - now);
  const cooldownRemainingSeconds = Math.ceil(cooldownRemainingMs / 1000);
  const canClaim = selectedAmount > 0 && cooldownRemainingMs === 0 && !isSubmitting;

  const handleSubmit = async () => {
    if (!canClaim) return;

    setError(null);
    setIsSubmitting(true);
    try {
      await onConfirm(selectedAmount);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to claim credits");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 p-8">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Practice Credit Faucet</p>
      <p className="mt-1 text-xs text-slate-500">
        Credits are issued by the server in fixed amounts to prevent client-side balance edits.
      </p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {policy.allowedAmounts.map(amount => (
          <button
            key={amount}
            onClick={() => setSelectedAmount(amount)}
            className={`rounded-2xl border px-3 py-3 text-xs font-semibold uppercase tracking-[0.2em] transition ${
              selectedAmount === amount
                ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-200"
                : "border-white/10 bg-white/5 text-slate-200/70 hover:border-white/20"
            }`}
            type="button"
          >
            ₵ {formatBalance(amount)}
          </button>
        ))}
      </div>

      <p className="mt-5 text-xs uppercase tracking-[0.24em] text-slate-400">
        Cooldown: {policy.cooldownSeconds}s
      </p>

      {cooldownRemainingMs > 0 && (
        <p className="mt-2 text-xs uppercase tracking-[0.24em] text-amber-200">
          Faucet locked for {cooldownRemainingSeconds}s
        </p>
      )}

      {error && <p className="mt-2 text-xs uppercase tracking-[0.24em] text-rose-200">{error}</p>}

      <button
        onClick={() => void handleSubmit()}
        disabled={!canClaim}
        className="mt-3 w-full rounded-2xl border border-cyan-400/40 bg-cyan-400/10 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
        type="button"
      >
        {isSubmitting ? "Claiming..." : `Claim ₵ ${formatBalance(selectedAmount)}`}
      </button>

      <button
        onClick={onCancel}
        className="mt-3 w-full rounded-2xl border border-white/10 py-2 text-xs uppercase tracking-[0.2em] text-slate-400 transition hover:text-white"
        type="button"
      >
        Cancel
      </button>
    </section>
  );
}
