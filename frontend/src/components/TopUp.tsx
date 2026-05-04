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
    const [selectedAmount, setSelectedAmount] = useState<number>(policy.allowedAmounts[0] ?? policy.minAmount);
    const [customAmount, setCustomAmount] = useState<string>("");
    const [isUsingCustomAmount, setIsUsingCustomAmount] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setSelectedAmount(policy.allowedAmounts[0] ?? policy.minAmount);
        setCustomAmount("");
        setIsUsingCustomAmount(false);
    }, [policy.allowedAmounts, policy.minAmount]);

    const parsedCustomAmount = Number.parseInt(customAmount, 10);
    const amountToClaim = isUsingCustomAmount
        ? (Number.isFinite(parsedCustomAmount) ? parsedCustomAmount : 0)
        : selectedAmount;
    const hasValidAmount = amountToClaim >= policy.minAmount && amountToClaim <= policy.maxAmount;
    const canClaim = hasValidAmount && !isSubmitting;

    const handleSubmit = async () => {
        if (!canClaim) return;

        setError(null);
        setIsSubmitting(true);
        try {
            await onConfirm(amountToClaim);
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : "Unable to claim credits");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <section className="game-shell page-swap page-from-right w-full max-w-4xl overflow-hidden rounded-4xl border border-cyan-300/20 bg-[radial-gradient(circle_at_top,rgba(6,182,212,0.16),rgba(15,23,42,0.94)_46%,rgba(8,15,33,0.98)_100%)] p-6 shadow-[0_40px_120px_rgba(2,6,23,0.45)]">
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-cyan-100/70">Balance</p>
                        <h2 className="mt-2 font-display text-4xl text-white">Top up</h2>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4">
                        <p className="text-xs uppercase tracking-[0.28em] text-cyan-100/60">Selected</p>
                        <p className="mt-2 font-display text-3xl text-white">₵ {formatBalance(amountToClaim)}</p>
                    </div>
                </div>

                <div className="rounded-3xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-4 text-sm text-cyan-100">
                    Choose a quick amount or enter a custom value, then claim your credits.
                </div>

                <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
                    <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                        <p className="text-xs uppercase tracking-[0.3em] text-cyan-100/60">Quick amounts</p>
                        <div className="mt-4 grid grid-cols-3 gap-3">
                            {policy.allowedAmounts.map(amount => (
                                <button
                                    key={amount}
                                    onClick={() => {
                                        setSelectedAmount(amount);
                                        setIsUsingCustomAmount(false);
                                        setCustomAmount("");
                                        setError(null);
                                    }}
                                    className={`arcade-button rounded-2xl border px-3 py-3 text-xs font-semibold uppercase tracking-[0.2em] transition ${!isUsingCustomAmount && selectedAmount === amount
                                            ? "border-cyan-300/60 bg-cyan-300/12 text-cyan-100"
                                            : "border-white/10 bg-white/5 text-slate-200/75 hover:border-white/20"
                                        }`}
                                    type="button"
                                >
                                    ₵ {formatBalance(amount)}
                                </button>
                            ))}
                        </div>

                        <label className="mt-5 block text-xs uppercase tracking-[0.24em] text-slate-300" htmlFor="topup-custom-amount">
                            Custom amount
                        </label>
                        <input
                            id="topup-custom-amount"
                            type="number"
                            inputMode="numeric"
                            min={policy.minAmount}
                            max={policy.maxAmount}
                            step={1}
                            value={customAmount}
                            onChange={event => {
                                setCustomAmount(event.target.value);
                                setIsUsingCustomAmount(true);
                                setError(null);
                            }}
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60"
                            placeholder={`Enter ${formatBalance(policy.minAmount)}-${formatBalance(policy.maxAmount)}`}
                        />

                        {isUsingCustomAmount && !hasValidAmount && customAmount.trim() !== "" && (
                            <p className="mt-2 text-xs uppercase tracking-[0.24em] text-amber-200">
                                Enter a value between ₵ {formatBalance(policy.minAmount)} and ₵ {formatBalance(policy.maxAmount)}
                            </p>
                        )}
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
                        <p className="text-xs uppercase tracking-[0.3em] text-cyan-100/60">Status</p>

                        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                            <p className="text-[10px] uppercase tracking-[0.26em] text-slate-400">Amount range</p>
                            <p className="mt-2 font-display text-2xl text-white">
                                ₵ {formatBalance(policy.minAmount)} - ₵ {formatBalance(policy.maxAmount)}
                            </p>
                        </div>

                        {error && <p className="mt-3 text-xs uppercase tracking-[0.24em] text-rose-200">{error}</p>}

                        <button
                            onClick={() => void handleSubmit()}
                            disabled={!canClaim}
                            className="arcade-button mt-6 w-full rounded-2xl border border-cyan-300/45 bg-cyan-300/12 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-300/18 disabled:cursor-not-allowed disabled:opacity-50"
                            type="button"
                        >
                            {isSubmitting ? "Claiming..." : `Claim ₵ ${formatBalance(amountToClaim)}`}
                        </button>

                        <button
                            onClick={onCancel}
                            className="arcade-button mt-3 w-full rounded-2xl border border-white/10 bg-white/5 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-300 transition hover:border-white/20 hover:text-white"
                            type="button"
                        >
                            Back to lobby
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
}
