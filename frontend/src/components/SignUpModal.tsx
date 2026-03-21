import { useState } from "react";
import { authRegister } from "../lib/session";

type SignUpModalProps = {
    onBack: () => void;
    onSuccess: () => void;
};

export function SignUpModal({ onBack, onSuccess }: SignUpModalProps) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setIsSubmitting(true);
        try {
            await authRegister(email, password);
            onSuccess();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to create account");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="rules-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-8 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.96))] shadow-[0_40px_120px_rgba(2,6,23,0.6)]">
                <div className="border-b border-white/10 px-6 py-6">
                    <p className="text-xs uppercase tracking-[0.32em] text-amber-200/70">Create Account</p>
                    <h2 className="mt-2 font-display text-2xl text-white">Start your account</h2>
                </div>

                <form onSubmit={handleSubmit} className="grid gap-3 px-6 py-6">
                    <label className="text-sm text-slate-300">
                        <span className="mb-2 block">Email</span>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={event => setEmail(event.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/50"
                        />
                    </label>
                    <label className="text-sm text-slate-300">
                        <span className="mb-2 block">Password</span>
                        <input
                            type="password"
                            value={password}
                            onChange={event => setPassword(event.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/50"
                        />
                    </label>
                    {error && <p className="text-sm text-rose-300">{error}</p>}
                    <div className="mt-2 flex items-center justify-between">
                        <button onClick={onBack} type="button" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:bg-white/10">
                            Back
                        </button>
                        <button disabled={isSubmitting} type="submit" className="rounded-full border border-amber-300/30 bg-amber-300/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200 transition hover:bg-amber-300/12 disabled:opacity-60">
                            {isSubmitting ? "Creating..." : "Create account"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
