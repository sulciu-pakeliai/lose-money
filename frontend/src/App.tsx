import { useEffect, useState } from "react";
import "./index.css";

import {
    authLogout,
    claimTopUp,
    claimMission,
    fetchState,
    hitBlackjack,
    standBlackjack,
    startBlackjack,
    submitCoinFlip,
    type AppState,
    type BlackjackActionResult,
    type CoinSide,
    type CoinFlipResult,
    type MissionClaimResult,
    type TopUpResult,
} from "./lib/session";
import { AuthModal } from "./components/AuthModal";
import type { GameRuleKey } from "./lib/gameRules";
import { Header } from "./components/Header";
import { Lobby } from "./components/Lobby";
import { MissionsBoard } from "./components/MissionsBoard";
import { CoinFlipGame } from "./components/CoinFlipGame";
import { BlackjackGame } from "./components/BlackjackGame";
import { BetHistory } from "./components/BetHistory";
import { GameRulesModal } from "./components/GameRulesModal";
import { TopUp } from "./components/TopUp";
import { SignInModal } from "./components/SignInModal";
import { SignUpModal } from "./components/SignUpModal";
import { Profile } from "./components/Profile";

type View = "lobby" | "missions" | "coinflip" | "blackjack" | "history" | "topup" | "profile";

export function App() {
    const [view, setView] = useState<View>("lobby");
    const [state, setState] = useState<AppState | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadingError, setLoadingError] = useState<string | null>(null);
    const [activeRules, setActiveRules] = useState<GameRuleKey | null>(null);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [authModalView, setAuthModalView] = useState<"choose" | "signin" | "signup">("choose");
    const [showSignInModal, setShowSignInModal] = useState(false);
    const [showSignUpModal, setShowSignUpModal] = useState(false);

    const claimableMissionCount = state?.missions.filter(mission => mission.status === "claimable").length ?? 0;

    useEffect(() => {
        if (typeof window === "undefined") {
            void loadState();
            return;
        }

        const seenAuth = window.localStorage.getItem("lm_auth_seen_v1") === "1";
        if (seenAuth) {
            void loadState();
            return;
        }

        setShowAuthModal(true);
    }, []);

    useEffect(() => {
        if (view !== "coinflip" && view !== "blackjack") {
            return;
        }

        if (typeof window === "undefined") {
            return;
        }

        const storageKey = `lm_rules_seen_${view}_v1`;
        if (window.localStorage.getItem(storageKey) === "1") {
            return;
        }

        setActiveRules(view);
    }, [view]);

    const loadState = async () => {
        setIsLoading(true);
        setLoadingError(null);

        try {
            setState(await fetchState());
        } catch (error) {
            setLoadingError(error instanceof Error ? error.message : "Failed to load game state");
        } finally {
            setIsLoading(false);
        }
    };

    const applyCoinFlip = (next: CoinFlipResult) => {
        setState(current =>
            current
                ? {
                    ...current,
                    session: next.session,
                    history: [next.bet, ...current.history].slice(0, 100),
                    topUp: next.topUp,
                    missions: next.missions,
                }
                : current,
        );
    };

    const applyTopUp = (next: TopUpResult) => {
        setState(current =>
            current
                ? {
                    ...current,
                    session: next.session,
                    topUp: next.topUp,
                    missions: next.missions,
                }
                : current,
        );
    };

    const applyBlackjack = (next: BlackjackActionResult) => {
        setState(current =>
            current
                ? {
                    ...current,
                    session: next.session,
                    topUp: next.topUp,
                    missions: next.missions,
                    blackjack: next.blackjack,
                    history: next.historyEntry ? [next.historyEntry, ...current.history].slice(0, 100) : current.history,
                }
                : current,
        );
    };

    const applyMissionClaim = (next: MissionClaimResult) => {
        setState(current =>
            current
                ? {
                    ...current,
                    session: next.session,
                    topUp: next.topUp,
                    missions: next.missions,
                }
                : current,
        );
    };

    const handleCoinFlip = async (choice: CoinSide, amount: number) => {
        const next = await submitCoinFlip(choice, amount);
        applyCoinFlip(next);
        return next;
    };

    const handleTopUp = async (amount: number) => {
        const next = await claimTopUp(amount);
        applyTopUp(next);
        setView("lobby");
    };

    const handleBlackjackStart = async (amount: number) => {
        const next = await startBlackjack(amount);
        applyBlackjack(next);
        return next;
    };

    const handleBlackjackHit = async () => {
        const next = await hitBlackjack();
        applyBlackjack(next);
        return next;
    };

    const handleBlackjackStand = async () => {
        const next = await standBlackjack();
        applyBlackjack(next);
        return next;
    };

    const handleMissionClaim = async (missionId: string) => {
        const next = await claimMission(missionId);
        applyMissionClaim(next);
        return next;
    };

    const openRules = (game: GameRuleKey) => {
        setActiveRules(game);
    };

    const closeRules = () => {
        if (typeof window !== "undefined" && activeRules) {
            window.localStorage.setItem(`lm_rules_seen_${activeRules}_v1`, "1");
        }

        setActiveRules(null);
    };

    const continueAsGuest = async () => {
        if (typeof window !== "undefined") {
            window.localStorage.setItem("lm_auth_seen_v1", "1");
        }
        setShowAuthModal(false);
        setAuthModalView("choose");
        await loadState();
    };

    const handleAuthSuccess = async () => {
        if (typeof window !== "undefined") {
            window.localStorage.setItem("lm_auth_seen_v1", "1");
        }
        setShowAuthModal(false);
        setShowSignInModal(false);
        setShowSignUpModal(false);
        setAuthModalView("choose");
        await loadState();
    };

    const handleLogout = async () => {
        try {
            await authLogout();
        } catch {
            // Ignore API errors and still refresh state.
        }
        await loadState();
    };

    return (
        <div className="min-h-screen">
            <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 pb-14 pt-10">
                <Header
                    session={state?.session ?? null}
                    showAuthActions={!isLoading}
                    onLobbyClick={() => setView("lobby")}
                    onMissionsClick={() => setView("missions")}
                    onHistoryClick={() => setView("history")}
                    onTopUpClick={() => setView("topup")}
                    onSignInClick={() => {
                        setShowSignInModal(true);
                    }}
                    onSignUpClick={() => {
                        setShowSignUpModal(true);
                    }}
                    onLogoutClick={() => {
                        void handleLogout();
                    }}
                    isLobby={view === "lobby"}
                    isMissions={view === "missions"}
                    isHistory={view === "history"}
                    claimableMissionCount={claimableMissionCount}
                    isProfile={view === "profile"}
                    onProfileClick={() => setView("profile")}
                />

                <main className="flex flex-1 items-center justify-center py-12">
                    {isLoading && (
                        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Loading table state</p>
                            <p className="mt-4 text-sm text-slate-300/80">Syncing your server-side balance and history.</p>
                        </section>
                    )}

                    {!isLoading && loadingError && !state && (
                        <section className="w-full max-w-md rounded-3xl border border-rose-400/30 bg-rose-400/10 p-8 text-center">
                            <p className="text-xs uppercase tracking-[0.3em] text-rose-200">Game state unavailable</p>
                            <p className="mt-4 text-sm text-rose-100/80">{loadingError}</p>
                            <button
                                onClick={() => void loadState()}
                                className="mt-6 rounded-full bg-white px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-slate-100"
                                type="button"
                            >
                                Retry
                            </button>
                        </section>
                    )}

                    {!isLoading && state && view === "lobby" && (
                        <Lobby
                            onSelectCoinFlip={() => setView("coinflip")}
                            onSelectBlackjack={() => setView("blackjack")}
                            onOpenMissions={() => setView("missions")}
                            missions={state.missions}
                        />
                    )}
                    {!isLoading && state && view === "missions" && (
                        <MissionsBoard missions={state.missions} onClaim={handleMissionClaim} />
                    )}
                    {!isLoading && state && view === "coinflip" && (
                        <CoinFlipGame balance={state.session.balance} onFlip={handleCoinFlip} onOpenRules={() => openRules("coinflip")} />
                    )}
                    {!isLoading && state && view === "blackjack" && (
                        <BlackjackGame
                            balance={state.session.balance}
                            game={state.blackjack ?? null}
                            onStart={handleBlackjackStart}
                            onHit={handleBlackjackHit}
                            onStand={handleBlackjackStand}
                            onOpenRules={() => openRules("blackjack")}
                        />
                    )}
                    {!isLoading && state && view === "history" && <BetHistory history={state.history} />}
                    {!isLoading && state && view === "topup" && (
                        <TopUp policy={state.topUp} onConfirm={handleTopUp} onCancel={() => setView("lobby")} />
                    )}
                    {!isLoading && state && view === "profile" && <Profile session={state.session} />}
                </main>
            </div>

            {activeRules && <GameRulesModal game={activeRules} onClose={closeRules} />}
            {showAuthModal && (
                <AuthModal
                    initialView={authModalView}
                    onContinueAsGuest={() => {
                        void continueAsGuest();
                    }}
                    onAuthSuccess={() => {
                        void handleAuthSuccess();
                    }}
                />
            )}
            {showSignInModal && (
                <SignInModal
                    onBack={() => setShowSignInModal(false)}
                    onSuccess={() => {
                        void handleAuthSuccess();
                    }}
                />
            )}
            {showSignUpModal && (
                <SignUpModal
                    onBack={() => setShowSignUpModal(false)}
                    onSuccess={() => {
                        void handleAuthSuccess();
                    }}
                />
            )}
        </div>
    );
}

export default App;
