import { useEffect, useState } from "react";
import { getBetHistory, type BetRecord } from "../lib/session";

export function BetHistory() {
  const [history, setHistory] = useState<BetRecord[]>([]);

  useEffect(() => {
    setHistory(getBetHistory());
  }, []);

  return (
    <section className="w-full max-w-2xl rounded-3xl border border-white/10 bg-white/5 p-6">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Bet History</p>

      <div className="mt-4">
        {history.length === 0 ? (
          <p className="text-center text-xs uppercase tracking-[0.3em] text-slate-500">
            No bets recorded
          </p>
        ) : (
          <div className="overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left uppercase tracking-[0.2em] text-slate-400/60">
                  <th className="pb-2">Game</th>
                  <th className="pb-2">Result</th>
                  <th className="pb-2 text-right">Bet</th>
                  <th className="pb-2 text-right">Balance</th>
                  <th className="pb-2 text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {history.map(r => (
                  <tr
                    key={r.id}
                    className={`border-t border-white/5 ${
                      r.outcome === "win" ? "text-emerald-300" : "text-rose-300"
                    }`}
                  >
                    <td className="py-2">{r.game}</td>
                    <td className="py-2">{r.result}</td>
                    <td className="py-2 text-right">₵ {r.amount}</td>
                    <td className="py-2 text-right">₵ {r.balanceAfter}</td>
                    <td className="py-2 text-right text-slate-400/60">
                      {new Date(r.timestamp).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}