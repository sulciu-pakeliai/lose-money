export type CoinSide = "Heads" | "Tails";

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
    result: CoinSide;
    amount: number;
    outcome: "win" | "loss" | "push";
    balanceAfter: number;
    timestamp: string;
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
    gameScope: "all" | "coinflip" | "blackjack";
    target: number;
    progress: number;
    rewardBalance: number;
    rewardXp: number;
    status: "in_progress" | "claimable" | "claimed";
    completedAt?: string;
    claimedAt?: string;
    resetsAt: string;
};

export type AppState = {
    session: Session;
    history: BetRecord[];
    topUp: TopUpPolicy;
    missions: Mission[];
    blackjack?: BlackjackGameState | null;
};

export type CoinFlipResult = {
    session: Session;
    bet: BetRecord;
    topUp: TopUpPolicy;
    missions: Mission[];
};

export type TopUpResult = {
    session: Session;
    creditedAmount: number;
    topUp: TopUpPolicy;
    missions: Mission[];
};

export type BlackjackActionResult = {
    session: Session;
    blackjack: BlackjackGameState;
    topUp: TopUpPolicy;
    missions: Mission[];
    historyEntry?: BetRecord;
};

export type MissionClaimResult = {
    session: Session;
    topUp: TopUpPolicy;
    missions: Mission[];
    claimedMissionId: string;
    rewardBalance: number;
    rewardXp: number;
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

export async function claimMission(missionId: string): Promise<MissionClaimResult> {
    return apiFetch<MissionClaimResult>("/api/missions/claim", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ missionId }),
    });
}
