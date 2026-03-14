export type CoinSide = "Heads" | "Tails";

export type Session = {
  id: string;
  balance: number;
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

export type AppState = {
  session: Session;
  history: BetRecord[];
  topUp: TopUpPolicy;
  blackjack?: BlackjackGameState | null;
};

export type CoinFlipResult = {
  session: Session;
  bet: BetRecord;
  topUp: TopUpPolicy;
};

export type TopUpResult = {
  session: Session;
  creditedAmount: number;
  topUp: TopUpPolicy;
};

export type BlackjackActionResult = {
  session: Session;
  blackjack: BlackjackGameState;
  topUp: TopUpPolicy;
  historyEntry?: BetRecord;
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
