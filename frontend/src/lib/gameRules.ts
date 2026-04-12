export type GameRuleKey = "coinflip" | "blackjack" | "dice" | "roulette";

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
    dice: {
        eyebrow: "Quick Guide",
        title: "How Lucky 7 Works",
        summary: "Two dice hit the felt. Bet low, high, or call an exact Lucky 7 for a bigger payout.",
        steps: [
            {
                title: "Choose a lane",
                body: "Low wins on totals 2 through 6. High wins on 8 through 12. Lucky 7 only wins on an exact total of 7.",
            },
            {
                title: "Set your wager",
                body: "Low and high pay 1:1. Lucky 7 pays 4:1 because it only lands on one total.",
            },
            {
                title: "Server rolls both dice",
                body: "The backend resolves both values, so the result cannot be influenced by client-side timing or refreshes.",
            },
            {
                title: "Exact sevens hit harder",
                body: "Calling Lucky 7 correctly returns a larger profit and also counts toward the special dice achievement.",
            },
        ],
        footer: "Low and high lose when the total lands on 7. Lucky 7 is the only way to cash that middle roll.",
    },
    roulette: {
        eyebrow: "Quick Guide",
        title: "How Roulette Works",
        summary: "Spin the wheel and bet a single number or the color red/black for instant payouts.",
        steps: [
            {
                title: "Choose your wager",
                body: "Place a stake on a number from 0 to 36, or bet on red or black.",
            },
            {
                title: "Spin the wheel",
                body: "The backend generates the winning number and color, so the game result is always server authoritative.",
            },
            {
                title: "Number bets pay big",
                body: "A correct single-number bet pays 35:1, while red/black pays 1:1.",
            },
            {
                title: "Zero is green",
                body: "The green zero is only a win on a number bet and causes color bets to lose.",
            },
        ],
        footer: "Tip: Use the wheel display to see the result and celebrate wins on number or color bets.",
    },
};
