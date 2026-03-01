export type Session = {
  id: string;
  balance: number;
  createdAt: string;
};

const STORAGE_KEY = "lm_session_v1";
const START_BALANCE = 1000;

const generateId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `sess_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
};

export const getOrCreateSession = (): Session => {
  if (typeof window === "undefined") {
    return {
      id: generateId(),
      balance: START_BALANCE,
      createdAt: new Date().toISOString(),
    };
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Session;
      if (parsed.id && typeof parsed.balance === "number") {
        return parsed;
      }
    } catch {
      // fall through and recreate
    }
  }

  const session = {
    id: generateId(),
    balance: START_BALANCE,
    createdAt: new Date().toISOString(),
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
};

export const updateSessionBalance = (balance: number): Session => {
  const session = getOrCreateSession();
  const next = {
    ...session,
    balance: Math.max(0, balance),
  };

  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  return next;
};

export type BetRecord = {
  id: string;
  game: string;
  result: string;
  amount: number;
  outcome: "win" | "loss";
  balanceAfter: number;
  timestamp: string;
};

const HISTORY_KEY = "lm_history_v1";

export const getBetHistory = (): BetRecord[] => {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(HISTORY_KEY);
    return stored ? (JSON.parse(stored) as BetRecord[]) : [];
  } catch {
    return [];
  }
};

export const recordBet = (bet: Omit<BetRecord, "id" | "timestamp">): BetRecord => {
  const record: BetRecord = {
    ...bet,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };
  const history = getBetHistory();
  history.unshift(record); // newest first
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 100))); // cap at 100
  return record;
};