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
