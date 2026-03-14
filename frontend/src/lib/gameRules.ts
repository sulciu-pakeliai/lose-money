export type GameRuleKey = "coinflip" | "blackjack";

export type GameRuleDefinition = {
  eyebrow: string;
  title: string;
  summary: string;
  steps: Array<{
    title: string;
    body: string;
  }>;
  footer: string;
};

export const GAME_RULES: Record<GameRuleKey, GameRuleDefinition> = {
  coinflip: {
    eyebrow: "Quick Guide",
    title: "How Coin Flip Works",
    summary: "A fast 50/50 wager. Pick a side, set a bet, and let the server resolve the flip.",
    steps: [
      {
        title: "Pick Heads or Tails",
        body: "Your selection is locked in when you press Flip Coin.",
      },
      {
        title: "Set your wager",
        body: "You can use preset bet chips or type a custom bet amount.",
      },
      {
        title: "Server resolves the flip",
        body: "The result is generated on the backend, so changing browser state will not change the outcome.",
      },
      {
        title: "Win or lose instantly",
        body: "If your side lands, your balance goes up by the bet. If not, the bet is deducted.",
      },
    ],
    footer: "Tip: Use the history page to review previous flips and balance changes.",
  },
  blackjack: {
    eyebrow: "Quick Guide",
    title: "How Blackjack Works",
    summary: "Beat the dealer without going over 21. Cards and dealer logic are handled on the backend.",
    steps: [
      {
        title: "Start a hand with a bet",
        body: "Your wager is reserved immediately when the hand is dealt.",
      },
      {
        title: "Read your total",
        body: "Face cards count as 10, aces count as 1 or 11, and the goal is to get closer to 21 than the dealer.",
      },
      {
        title: "Choose Hit or Stand",
        body: "Hit draws another card. Stand ends your turn and lets the dealer finish the hand.",
      },
      {
        title: "Dealer draws to 17",
        body: "When you stand, the dealer keeps drawing until reaching at least 17, then the higher valid total wins.",
      },
      {
        title: "Blackjack and pushes",
        body: "A natural blackjack pays 3:2. Matching totals push and return your wager.",
      },
    ],
    footer: "Current version supports single-hand blackjack with hit and stand. No split or double down yet.",
  },
};
