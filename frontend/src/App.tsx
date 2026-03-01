import { useState } from "react";
import "./index.css";

import { getOrCreateSession, updateSessionBalance } from "./lib/session";
import { Header } from "./components/Header";
import { Lobby } from "./components/Lobby";
import { CoinFlipGame } from "./components/CoinFlipGame";
import { BetHistory } from "./components/BetHistory";
import { TopUp } from "./components/TopUp";

type View = "lobby" | "coinflip" | "history" | "topup";

export function App() {
  const [view, setView] = useState<View>("lobby");
  const [session, setSession] = useState(() => getOrCreateSession());

  const handleBalanceChange = (nextBalance: number) => {
    setSession(updateSessionBalance(nextBalance));
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 pb-14 pt-10">
        <Header
          balance={session.balance}
          onLobbyClick={() => setView("lobby")}
          onHistoryClick={() => setView("history")}
          onTopUpClick={() => setView("topup")}
          isLobby={view === "lobby"}
          isHistory={view === "history"}
        />

        <main className="flex flex-1 items-center justify-center py-12">
          {view === "lobby" && <Lobby onSelectCoinFlip={() => setView("coinflip")} />}
          {view === "coinflip" && <CoinFlipGame balance={session.balance} onBalanceChange={handleBalanceChange} />}
          {view === "history" && <BetHistory />}
          {view === "topup" && (
            <TopUp
              onConfirm={(amount) => {
                handleBalanceChange(session.balance + amount);
                setView("lobby");
              }}
              onCancel={() => setView("lobby")}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
