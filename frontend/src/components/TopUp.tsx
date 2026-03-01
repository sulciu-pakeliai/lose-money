import { useState } from "react";

type TopUpProps = {
  onConfirm: (amount: number) => void;
  onCancel: () => void;
};

const formatBalance = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);

export function TopUp({ onConfirm, onCancel }: TopUpProps) {
  const [amount, setAmount] = useState("");

  const parsed = Number(amount);
  const isValid = Number.isFinite(parsed) && parsed > 0;

  return (
    <section className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 p-8">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Top Up Balance</p>
      <p className="mt-1 text-xs text-slate-500">Entered amount will be added to your current balance</p>

      <input
        type="number"
        min={1}
        value={amount}
        onChange={e => setAmount(e.target.value)}
        onKeyDown={e => e.key === "Enter" && isValid && onConfirm(parsed)}
        placeholder="Enter amount"
        className="mt-6 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
        autoFocus
      />

      <button
        onClick={() => onConfirm(parsed)}
        disabled={!isValid}
        className="mt-3 w-full rounded-2xl border border-cyan-400/40 bg-cyan-400/10 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
        type="button"
      >
        Add ₵ {isValid ? formatBalance(parsed) : "0"}
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