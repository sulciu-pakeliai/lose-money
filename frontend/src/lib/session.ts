export type CoinSide = "Heads" | "Tails";

export type Session = {
  id: string;
  balance: number;
  createdAt: string;
};

export type BetRecord = {
  id: string;
  game: string;
  choice: CoinSide;
  result: CoinSide;
  amount: number;
  outcome: "win" | "loss";
  balanceAfter: number;
  timestamp: string;
};

export type TopUpPolicy = {
  allowedAmounts: number[];
  cooldownSeconds: number;
  availableAt?: string;
};

export type AppState = {
  session: Session;
  history: BetRecord[];
  topUp: TopUpPolicy;
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
