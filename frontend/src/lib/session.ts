export type CoinSide = "Heads" | "Tails";
export type DiceBetType = "low" | "high" | "lucky7";

export type Session = {
    id: string;
    balance: number;
    userId?: string | null;
    userEmail?: string | null;
    xp: number;
    level: number;
    gamesPlayed: number;
    levelStartXp: number;
    nextLevelXp: number;
    xpIntoLevel: number;
    xpForNextLevel: number;
    createdAt: string;
};

export type BetRecord = {
    id: string;
    game: string;
    choice: string;
    result: string;
    amount: number;
    outcome: "win" | "loss" | "push";
    balanceAfter: number;
    timestamp: string;
};

export type DiceRollSummary = {
    dieOne: number;
    dieTwo: number;
    total: number;
    betType: DiceBetType;
    profitMultiplier: number;
    won: boolean;
};

export type TopUpPolicy = {
    allowedAmounts: number[];
    cooldownSeconds: number;
    availableAt?: string;
};

export type BlackjackCard = {
    rank: string;
    suit: "spades" | "hearts" | "diamonds" | "clubs";
};

export type BlackjackGameState = {
    id: string;
    betAmount: number;
    playerCards: BlackjackCard[];
    dealerCards: BlackjackCard[];
    dealerHiddenCount: number;
    playerTotal: number;
    dealerTotal: number;
    status: string;
    message: string;
    canHit: boolean;
    canStand: boolean;
    isComplete: boolean;
    completedAt?: string;
};

export type Mission = {
    id: string;
    templateKey: string;
    groupName: string;
    title: string;
    description: string;
    gameScope: "all" | "coinflip" | "blackjack" | "dice" | "slots" | "crash" | "mines";
    target: number;
    progress: number;
    rewardBalance: number;
    rewardXp: number;
    status: "in_progress" | "claimable" | "claimed";
    completedAt?: string;
    claimedAt?: string;
    resetsAt: string;
};

export type Achievement = {
    id: string;
    templateKey: string;
    groupName: string;
    title: string;
    description: string;
    gameScope: "all" | "coinflip" | "blackjack" | "dice" | "slots" | "crash" | "mines";
    rarity: "common" | "uncommon" | "rare" | "epic";
    accent: "copper" | "cyan" | "emerald" | "rose" | "gold";
    iconLabel: string;
    target: number;
    progress: number;
    status: "locked" | "unlocked";
    unlockedAt?: string;
};

export type AppNotification = {
    id: string;
    category: "notification";
    severity: "info" | "success" | "warning";
    title: string;
    message: string;
    isRead: boolean;
    createdAt: string;
    readAt?: string;
};

export type AppState = {
    session: Session;
    history: BetRecord[];
    topUp: TopUpPolicy;
    missions: Mission[];
    achievements: Achievement[];
    notifications: AppNotification[];
    blackjack?: BlackjackGameState | null;
    crash?: CrashGameState | null;
    mines?: MinesGameState | null;
};

export type CoinFlipResult = {
    session: Session;
    bet: BetRecord;
    topUp: TopUpPolicy;
    missions: Mission[];
    achievements: Achievement[];
    notifications: AppNotification[];
};

export type DiceRollResult = {
    session: Session;
    bet: BetRecord;
    roll: DiceRollSummary;
    topUp: TopUpPolicy;
    missions: Mission[];
    achievements: Achievement[];
    notifications: AppNotification[];
};

export type RouletteBetType = "number" | "color";

export type RouletteSpinResult = {
    number: number;
    color: "red" | "black" | "green";
    betType: RouletteBetType;
    choice: string;
    profitMultiplier: number;
    won: boolean;
};

export type RouletteResult = {
    session: Session;
    bet: BetRecord;
    spin: RouletteSpinResult;
    topUp: TopUpPolicy;
    missions: Mission[];
    achievements: Achievement[];
    notifications: AppNotification[];
};

export type TopUpResult = {
    session: Session;
    creditedAmount: number;
    topUp: TopUpPolicy;
    missions: Mission[];
    achievements: Achievement[];
    notifications: AppNotification[];
};

export type BlackjackActionResult = {
    session: Session;
    blackjack: BlackjackGameState;
    topUp: TopUpPolicy;
    missions: Mission[];
    achievements: Achievement[];
    notifications: AppNotification[];
    historyEntry?: BetRecord;
};

export type MissionClaimResult = {
    session: Session;
    topUp: TopUpPolicy;
    missions: Mission[];
    achievements: Achievement[];
    notifications: AppNotification[];
    claimedMissionId: string;
    rewardBalance: number;
    rewardXp: number;
};

export type ProfileStats = {
  session: Session;
  totalBets: number;
  totalWins: number;
  totalLoss: number;
  totalPush: number;
  totalWagered: number;
  biggestWin: number;
};

export type SlotSpinResult = {
    session: Session;
    bet: BetRecord;
    reels: [string, string, string];
    outcome: "win" | "loss";
    multiplier: number;
    payout: number;
    topUp: TopUpPolicy;
    missions: Mission[];
    achievements: Achievement[];
    notifications: AppNotification[];
};

export type CrashGameState = {
    id: string;
    betAmount: number;
    crashMultiplier?: number;
    cashoutMultiplier?: number;
    payout?: number;
    status: "active" | "cashed_out" | "crashed";
    startedAt: string;
    crashAfterMs?: number;
    elapsedMs: number;
    currentMultiplier: number;
    canCashout: boolean;
    message: string;
    completedAt?: string;
    balanceReserved: boolean;
};

export type CrashStartResult = {
    session: Session;
    crash: CrashGameState;
    topUp: TopUpPolicy;
    missions: Mission[];
    achievements: Achievement[];
    notifications: AppNotification[];
};

export type CrashCashoutResult = {
    session: Session;
    crash: CrashGameState;
    bet: BetRecord;
    topUp: TopUpPolicy;
    missions: Mission[];
    achievements: Achievement[];
    notifications: AppNotification[];
};

export type CrashStatusResult = {
    session: Session;
    crash: CrashGameState | null;
    bet?: BetRecord;
    topUp: TopUpPolicy;
    missions: Mission[];
    achievements: Achievement[];
    notifications: AppNotification[];
};

export type MinesGameState = {
    id: string;
    betAmount: number;
    gridSize: number;
    mineCount: number;
    revealedCells: number[];
    minePositions?: number[];
    safeReveals: number;
    currentMultiplier: number;
    potentialPayout: number;
    status: "active" | "cashed_out" | "exploded";
    message: string;
    canCashout: boolean;
    startedAt: string;
    completedAt?: string;
};

export type MinesActionResult = {
    session: Session;
    mines: MinesGameState;
    bet?: BetRecord;
    topUp: TopUpPolicy;
    missions: Mission[];
    achievements: Achievement[];
    notifications: AppNotification[];
};

export type SettingsDTO = {
    selfExclusion?: { excludedUntil: string };
    betLimit?: { maxBetAmount: number };
    theme?: string;
};

type APIError = {
    error?: string;
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, {
        credentials: "same-origin",
        ...init,
    });

    const payload = (await response.json().catch(() => null)) as T | APIError | null;
    if (!response.ok) {
        const message =
            payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
                ? payload.error
                : `Request failed with status ${response.status}`;
        throw new Error(message);
    }

    return payload as T;
}

export async function fetchState(): Promise<AppState> {
    return apiFetch<AppState>("/api/state");
}

export async function submitCoinFlip(choice: CoinSide, amount: number): Promise<CoinFlipResult> {
    return apiFetch<CoinFlipResult>("/api/coinflip", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ choice, amount }),
    });
}

export async function claimTopUp(amount: number): Promise<TopUpResult> {
    return apiFetch<TopUpResult>("/api/top-up", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount }),
    });
}

export async function submitDiceRoll(betType: DiceBetType, amount: number): Promise<DiceRollResult> {
    return apiFetch<DiceRollResult>("/api/dice", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ betType, amount }),
    });
}

export async function submitRoulette(betType: RouletteBetType, choice: string, amount: number): Promise<RouletteResult> {
    return apiFetch<RouletteResult>("/api/roulette", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ betType, choice, amount }),
    });
}

export async function startBlackjack(amount: number): Promise<BlackjackActionResult> {
    return apiFetch<BlackjackActionResult>("/api/blackjack/start", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount }),
    });
}

export async function hitBlackjack(): Promise<BlackjackActionResult> {
    return apiFetch<BlackjackActionResult>("/api/blackjack/hit", {
        method: "POST",
    });
}

export async function standBlackjack(): Promise<BlackjackActionResult> {
    return apiFetch<BlackjackActionResult>("/api/blackjack/stand", {
        method: "POST",
    });
}

export async function authLogin(email: string, password: string): Promise<{ id: string; session?: Session }> {
    return apiFetch<{ id: string; session?: Session }>("/api/auth/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
    });
}

export async function authRegister(email: string, password: string): Promise<{ id: string; email: string; session?: Session }> {
    return apiFetch<{ id: string; email: string; session?: Session }>("/api/auth/register", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
    });
}

export async function authLogout(): Promise<{ session?: Session; status?: string }> {
    return apiFetch<{ session?: Session; status?: string }>("/api/auth/logout", {
        method: "POST",
    });
}

export async function deleteAccount(): Promise<{ session?: Session; status: string }> {
    return apiFetch<{ session?: Session; status: string }>("/api/account", {
        method: "DELETE",
    });
}

export async function claimMission(missionId: string): Promise<MissionClaimResult> {
    return apiFetch<MissionClaimResult>("/api/missions/claim", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ missionId }),
    });
}

export async function fetchProfile(): Promise<ProfileStats> {
  return apiFetch<ProfileStats>("/api/profile");
}

export async function fetchNotifications(): Promise<{ notifications: AppNotification[] }> {
    return apiFetch<{ notifications: AppNotification[] }>("/api/notifications");
}

export async function markNotificationsRead(): Promise<{ notifications: AppNotification[] }> {
    return apiFetch<{ notifications: AppNotification[] }>("/api/notifications/read", {
        method: "POST",
    });
}

export async function submitSlotSpin(amount: number): Promise<SlotSpinResult> {
    return apiFetch<SlotSpinResult>("/api/slots/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
    });
}

export async function startCrashRound(amount: number): Promise<CrashStartResult> {
    return apiFetch<CrashStartResult>("/api/crash/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
    });
}

export async function cashOutCrashRound(): Promise<CrashCashoutResult> {
    return apiFetch<CrashCashoutResult>("/api/crash/cashout", {
        method: "POST",
    });
}

export async function checkCrashRound(): Promise<CrashStatusResult> {
    return apiFetch<CrashStatusResult>("/api/crash/status", {
        method: "POST",
    });
}

export async function startMinesRound(amount: number, mineCount: number): Promise<MinesActionResult> {
    return apiFetch<MinesActionResult>("/api/mines/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, mineCount }),
    });
}

export async function revealMinesCell(cell: number): Promise<MinesActionResult> {
    return apiFetch<MinesActionResult>("/api/mines/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cell }),
    });
}

export async function cashOutMinesRound(): Promise<MinesActionResult> {
    return apiFetch<MinesActionResult>("/api/mines/cashout", {
        method: "POST",
    });
}

export async function fetchSettings(): Promise<SettingsDTO> {
    return apiFetch<SettingsDTO>("/api/settings");
}

export async function setSelfExclusion(durationHours: number): Promise<SettingsDTO> {
    return apiFetch<SettingsDTO>("/api/settings/self-exclusion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationHours }),
    });
}

export async function removeSelfExclusion(): Promise<SettingsDTO> {
    return apiFetch<SettingsDTO>("/api/settings/self-exclusion", { method: "DELETE" });
}

export async function setBetLimit(maxBetAmount: number): Promise<SettingsDTO> {
    return apiFetch<SettingsDTO>("/api/settings/bet-limit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxBetAmount }),
    });
}

export async function removeBetLimit(): Promise<SettingsDTO> {
    return apiFetch<SettingsDTO>("/api/settings/bet-limit", { method: "DELETE" });
}

export async function setTheme(theme: string): Promise<SettingsDTO> {
    return apiFetch<SettingsDTO>("/api/settings/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme }),
    });
}

export async function removeTheme(): Promise<SettingsDTO> {
    return apiFetch<SettingsDTO>("/api/settings/theme", { method: "DELETE" });
}
