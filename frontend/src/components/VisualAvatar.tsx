import { useEffect, useMemo, useRef, useState } from "react";
import type { AppState, BetRecord, BlackjackCard, BlackjackGameState } from "../lib/session";
import coralAngry from "../assets/assets/girl_red/coral_angry.png";
import coralHappy from "../assets/assets/girl_red/coral_happy.png";
import coralNeutral from "../assets/assets/girl_red/coral_neutral.png";
import coralSad from "../assets/assets/girl_red/coral_sad.png";
import coralSurprised from "../assets/assets/girl_red/coral_surprised.png";

type AvatarEmotion = "neutral" | "happy" | "sad" | "angry" | "surprised";
type AvatarAnimation = "idle" | "talk" | "react" | "celebrate" | "panic";
type AvatarView =
    | "lobby"
    | "missions"
    | "achievements"
    | "coinflip"
    | "dice"
    | "blackjack"
    | "roulette"
    | "slots"
    | "crash"
    | "history"
    | "topup"
    | "profile"
    | "notifications";
type AvatarGameKey = "coinflip" | "dice" | "blackjack" | "roulette" | "slots" | "crash";

type DialogueBeat = {
    emotion: AvatarEmotion;
    line: string;
    animation: AvatarAnimation;
    durationMs?: number;
};

type AvatarScene = {
    signature: string;
    beats: DialogueBeat[];
};

type VisualAvatarProps = {
    isLoading: boolean;
    loadingError: string | null;
    state: AppState | null;
    view: AvatarView;
    lastOutcome: BetRecord | null;
};

const AVATAR_STORAGE_KEY = "lm_avatar_position_x_v1";
const AVATAR_MARGIN = 12;

const emotionArt: Record<AvatarEmotion, string> = {
    neutral: coralNeutral,
    happy: coralHappy,
    sad: coralSad,
    angry: coralAngry,
    surprised: coralSurprised,
};

type DialogueFactory = (event: BetRecord, gameLabel: string) => DialogueBeat[];

const gameLabels: Record<AvatarGameKey, string> = {
    blackjack: "blackjack hand",
    coinflip: "coin flip",
    crash: "crash round",
    dice: "dice roll",
    roulette: "roulette spin",
    slots: "slot spin",
};

const winDialogueSets: DialogueFactory[] = [
    (event, gameLabel) => [
        { emotion: "happy", animation: "celebrate", line: `That ${gameLabel} hit. I will be taking advisory credit.`, durationMs: 5200 },
        { emotion: "surprised", animation: "react", line: `${event.choice} into ${event.result}. Suspiciously elegant.`, durationMs: 5400 },
        { emotion: "happy", animation: "talk", line: "Bank the confidence. The spreadsheet can hear fear.", durationMs: 5600 },
    ],
    (event, gameLabel) => [
        { emotion: "happy", animation: "celebrate", line: `Winner. The ${gameLabel} briefly respected us.`, durationMs: 5000 },
        { emotion: "neutral", animation: "talk", line: `A ${formatCredits(event.amount)} credit wager survived contact with reality.`, durationMs: 6000 },
        { emotion: "happy", animation: "talk", line: "Pretend this was discipline. I will back your story.", durationMs: 5600 },
    ],
    (event, gameLabel) => [
        { emotion: "surprised", animation: "celebrate", line: `The ${gameLabel} paid out. My fake model says genius.`, durationMs: 5400 },
        { emotion: "happy", animation: "talk", line: `Balance after impact: ${formatCredits(event.balanceAfter)} credits.`, durationMs: 5600 },
        { emotion: "neutral", animation: "talk", line: "Do not look shocked. Winners look like they expected paperwork.", durationMs: 6200 },
    ],
    (event, gameLabel) => [
        { emotion: "happy", animation: "celebrate", line: `Green lights on the ${gameLabel}. I am upgrading my confidence illegally.`, durationMs: 5600 },
        { emotion: "surprised", animation: "react", line: `${event.result} was the answer. Obviously I knew that after it happened.`, durationMs: 6000 },
        { emotion: "happy", animation: "talk", line: "That is a clean little win. Look casual so probability gets jealous.", durationMs: 6200 },
    ],
    (event, gameLabel) => [
        { emotion: "happy", animation: "celebrate", line: `The ${gameLabel} listened. Rare, beautiful, financially convenient.`, durationMs: 5600 },
        { emotion: "neutral", animation: "talk", line: `You risked ${formatCredits(event.amount)} and the room blinked.`, durationMs: 5600 },
        { emotion: "surprised", animation: "react", line: "I am writing this down as teamwork, even if you did the clicking.", durationMs: 6200 },
    ],
];

const lossDialogueSets: DialogueFactory[] = [
    (event, gameLabel) => [
        { emotion: "sad", animation: "panic", line: `That ${gameLabel} missed. Technically, this is data collection.`, durationMs: 5600 },
        { emotion: "angry", animation: "talk", line: `${event.choice} into ${event.result}. The table chose drama.`, durationMs: 5600 },
        { emotion: "neutral", animation: "talk", line: "Tiny setback. I am recalculating excuses at premium speed.", durationMs: 6200 },
    ],
    (event, gameLabel) => [
        { emotion: "angry", animation: "panic", line: `Loss on the ${gameLabel}. I dislike this plot twist.`, durationMs: 5200 },
        { emotion: "sad", animation: "talk", line: `The wager was ${formatCredits(event.amount)} credits. I saw nothing.`, durationMs: 5600 },
        { emotion: "surprised", animation: "react", line: "Shake it off with theatrical dignity.", durationMs: 5000 },
    ],
    (event, gameLabel) => [
        { emotion: "sad", animation: "panic", line: `The ${gameLabel} betrayed the briefing. Rude.`, durationMs: 5200 },
        { emotion: "neutral", animation: "talk", line: `Balance after impact: ${formatCredits(event.balanceAfter)} credits. We remain numerically alive.`, durationMs: 6400 },
        { emotion: "angry", animation: "react", line: "I am not mad at you. I am mad at probability.", durationMs: 5600 },
    ],
    (event, gameLabel) => [
        { emotion: "angry", animation: "panic", line: `Red result on the ${gameLabel}. I reject this timeline.`, durationMs: 5400 },
        { emotion: "sad", animation: "talk", line: `${event.result} landed, and it was not polite about it.`, durationMs: 5600 },
        { emotion: "neutral", animation: "talk", line: "We call this tuition. Extremely fake, extremely educational tuition.", durationMs: 6400 },
    ],
    (event, gameLabel) => [
        { emotion: "sad", animation: "panic", line: `That ${gameLabel} did not clear. I have entered dramatic recovery mode.`, durationMs: 5600 },
        { emotion: "angry", animation: "react", line: `${formatCredits(event.amount)} credits walked into the fog. I saw the whole thing.`, durationMs: 6400 },
        { emotion: "neutral", animation: "talk", line: "Breathe. The next decision deserves a less haunted face.", durationMs: 5600 },
    ],
];

const pushDialogueSets: DialogueFactory[] = [
    (event, gameLabel) => [
        { emotion: "surprised", animation: "react", line: `Push on the ${gameLabel}. The table blinked first, but quietly.`, durationMs: 5600 },
        { emotion: "neutral", animation: "talk", line: `${event.choice} into ${event.result}. Very diplomatic.`, durationMs: 5400 },
        { emotion: "happy", animation: "talk", line: "No loss is a tiny win wearing sensible shoes.", durationMs: 5600 },
    ],
    (event, gameLabel) => [
        { emotion: "neutral", animation: "react", line: `The ${gameLabel} ended even. Suspense with receipts.`, durationMs: 5200 },
        { emotion: "surprised", animation: "talk", line: `Balance holds at ${formatCredits(event.balanceAfter)} credits.`, durationMs: 5400 },
        { emotion: "happy", animation: "talk", line: "A draw is probability asking for another meeting.", durationMs: 5600 },
    ],
    (event, gameLabel) => [
        { emotion: "surprised", animation: "react", line: `The ${gameLabel} pushed. Nobody wins, nobody apologizes.`, durationMs: 5600 },
        { emotion: "neutral", animation: "talk", line: "That was a full lap around suspense for no balance change.", durationMs: 6000 },
        { emotion: "happy", animation: "talk", line: "I respect a non-disaster. Very mature of the table.", durationMs: 5600 },
    ],
];

function formatCredits(value: number) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function stableIndex(seed: string, length: number) {
    let hash = 0;

    for (let index = 0; index < seed.length; index += 1) {
        hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
    }

    return hash % length;
}

function normalizeGameKey(game: string): AvatarGameKey | null {
    switch (game.toLowerCase().replaceAll(/[^a-z0-9]/g, "")) {
        case "coinflip":
        case "flipzilla":
            return "coinflip";
        case "dice":
        case "lucky7":
            return "dice";
        case "blackjack":
            return "blackjack";
        case "roulette":
        case "rouletteroyale":
            return "roulette";
        case "slots":
            return "slots";
        case "crash":
            return "crash";
        default:
            return null;
    }
}

function getOutcomeScene(event: BetRecord, view: AvatarView): AvatarScene | null {
    const gameKey = normalizeGameKey(event.game);

    if (!gameKey || gameKey !== view) {
        return null;
    }

    const gameLabel = gameLabels[gameKey];
    const dialogueSets =
        event.outcome === "win"
            ? winDialogueSets
            : event.outcome === "loss"
                ? lossDialogueSets
                : pushDialogueSets;
    const selectedSet = dialogueSets[stableIndex(`${event.id}-${event.outcome}-${event.result}`, dialogueSets.length)];

    return {
        signature: `outcome-${event.id}-${event.outcome}`,
        beats: [...selectedSet(event, gameLabel), getPostOutcomeRecommendation(event, gameKey)],
    };
}

function getPostOutcomeRecommendation(event: BetRecord, gameKey: AvatarGameKey): DialogueBeat {
    switch (gameKey) {
        case "coinflip": {
            const nextSide = event.outcome === "win" ? event.choice : event.result === "Heads" ? "Tails" : "Heads";
            return {
                emotion: event.outcome === "win" ? "happy" : "surprised",
                animation: "talk",
                line: `Next fake read: ${nextSide}. ${event.outcome === "win" ? "Ride the bit until it gets embarrassed." : "Fade the betrayal and call it science."}`,
                durationMs: 6800,
            };
        }
        case "dice": {
            const total = Number(event.result.match(/\d+/)?.[0] ?? Number.NaN);
            const nextLane = Number.isFinite(total) && total <= 6 ? "Low 2-6" : Number.isFinite(total) && total >= 8 ? "High 8-12" : "Lucky 7";
            return {
                emotion: "neutral",
                animation: "talk",
                line: `Next dice read: ${nextLane}. My model is mostly vibes, but the vibes are wearing a lab coat.`,
                durationMs: 7000,
            };
        }
        case "blackjack":
            return {
                emotion: "neutral",
                animation: "talk",
                line: event.outcome === "win" ? "Next hand: keep the same posture. It looked expensive." : "Next hand: calmer totals, fewer haunted decisions.",
                durationMs: 6200,
            };
        case "roulette":
            return {
                emotion: event.outcome === "win" ? "happy" : "neutral",
                animation: "talk",
                line: event.outcome === "win" ? "Next spin: same nerve, less speech." : "Next spin: pick a lane and let the wheel do its little speech.",
                durationMs: 6400,
            };
        case "slots":
            return {
                emotion: event.outcome === "win" ? "happy" : "neutral",
                animation: "talk",
                line: event.outcome === "win" ? "Next spin: same wager once, then act disciplined." : "Next spin: smaller wager. Make the machine work harder for the drama.",
                durationMs: 6600,
            };
        case "crash":
            return {
                emotion: event.outcome === "win" ? "happy" : "surprised",
                animation: "talk",
                line: event.outcome === "win" ? "Next launch: profit first, hero speech later." : "Next launch: the curve was rude. We can be ruder with timing.",
                durationMs: 6600,
            };
    }
}

function getRecentOutcomeForGame(lastOutcome: BetRecord | null, gameKey: AvatarGameKey) {
    return lastOutcome && normalizeGameKey(lastOutcome.game) === gameKey ? lastOutcome : null;
}

function getCoinFlipRecommendation(state: AppState, lastOutcome: BetRecord | null) {
    const recent = getRecentOutcomeForGame(lastOutcome, "coinflip");
    const side = recent
        ? recent.outcome === "win"
            ? recent.choice
            : recent.result === "Heads" ? "Tails" : "Heads"
        : stableIndex(`${state.session.id}-${state.session.gamesPlayed}-${Math.floor(state.session.balance)}`, 2) === 0
            ? "Heads"
            : "Tails";
    const reason = recent
        ? recent.outcome === "win"
            ? "because the last call got paid and I am pretending heat exists"
            : "because the last result hurt my feelings"
        : "because my fake model found a pattern in absolutely nothing";

    return { side, reason };
}

function getDiceRecommendation(state: AppState, lastOutcome: BetRecord | null) {
    const recent = getRecentOutcomeForGame(lastOutcome, "dice");

    if (recent) {
        const total = Number(recent.result.match(/\d+/)?.[0] ?? Number.NaN);
        if (Number.isFinite(total) && total === 7) {
            return { lane: "Lucky 7", reason: "the middle just made noise and I am easily influenced" };
        }
        if (Number.isFinite(total) && total <= 6) {
            return { lane: "Low 2-6", reason: "the dice were recently leaning low" };
        }
        if (Number.isFinite(total)) {
            return { lane: "High 8-12", reason: "the dice were recently acting tall" };
        }
    }

    const picks = [
        { lane: "Low 2-6", reason: "it covers five totals and sounds responsible" },
        { lane: "High 8-12", reason: "it covers five totals and lets you stare down the table" },
        { lane: "Lucky 7", reason: "it pays louder, even if it lands narrower" },
    ];

    return picks[stableIndex(`${state.session.id}-${state.session.gamesPlayed}-${state.session.xp}`, picks.length)];
}

function getSlotRecommendation(state: AppState, lastOutcome: BetRecord | null) {
    const recent = getRecentOutcomeForGame(lastOutcome, "slots");
    const balance = state.session.balance;
    const suggestedBet = Math.max(1, Math.min(100, Math.floor(balance * 0.05)));

    if (recent?.outcome === "win") {
        return {
            amount: Math.max(1, Math.min(100, recent.amount)),
            line: "repeat the winning wager once, then pretend we have restraint",
        };
    }

    if (recent?.outcome === "loss") {
        return {
            amount: Math.max(1, Math.min(100, Math.floor(recent.amount / 2) || 1)),
            line: "cut the next spin down and make the reels earn attention",
        };
    }

    return {
        amount: suggestedBet,
        line: "keep it small enough that the fruit cannot smell panic",
    };
}

function blackjackCardValue(card: BlackjackCard) {
    if (card.rank === "A") {
        return 11;
    }

    if (card.rank === "K" || card.rank === "Q" || card.rank === "J") {
        return 10;
    }

    return Number(card.rank);
}

function blackjackCardLabel(card: BlackjackCard | undefined) {
    return card ? `${card.rank} ${card.suit}` : "unknown";
}

function isSoftBlackjackTotal(cards: BlackjackCard[], total: number) {
    const hardTotal = cards.reduce((sum, card) => sum + (card.rank === "A" ? 1 : blackjackCardValue(card)), 0);
    return cards.some(card => card.rank === "A") && hardTotal + 10 === total;
}

function getBlackjackAdvice(game: BlackjackGameState): DialogueBeat[] {
    const dealerCard = game.dealerCards[0];
    const dealerValue = dealerCard ? blackjackCardValue(dealerCard) : 10;
    const dealerLabel = blackjackCardLabel(dealerCard);
    const isSoft = isSoftBlackjackTotal(game.playerCards, game.playerTotal);
    const totalLabel = `${game.playerTotal}${isSoft ? " soft" : ""}`;

    if (!game.canHit && game.canStand) {
        return [
            { emotion: "angry", animation: "react", line: "Stand. Only sane button left.", durationMs: 4200 },
            { emotion: "neutral", animation: "talk", line: `${totalLabel} into ${dealerLabel}. Let dealer sweat.`, durationMs: 4800 },
        ];
    }

    if (game.playerTotal >= 21) {
        return [
            { emotion: "surprised", animation: "react", line: `Stand. ${game.playerTotal} needs no help.`, durationMs: 4400 },
            { emotion: "neutral", animation: "talk", line: `${dealerLabel} showing. Make them chase.`, durationMs: 4600 },
        ];
    }

    if (isSoft) {
        if (game.playerTotal <= 17 || (game.playerTotal === 18 && dealerValue >= 9)) {
            return [
                { emotion: "happy", animation: "talk", line: `Hit. Soft ${game.playerTotal} can bend.`, durationMs: 4300 },
                { emotion: "surprised", animation: "react", line: `${dealerLabel} showing. Ace has room.`, durationMs: 4600 },
            ];
        }

        return [
            { emotion: "neutral", animation: "talk", line: `Stand. Soft ${game.playerTotal} is enough.`, durationMs: 4400 },
            { emotion: "happy", animation: "talk", line: `${dealerLabel} showing. Do not get greedy.`, durationMs: 4600 },
        ];
    }

    if (game.playerTotal <= 11) {
        return [
            { emotion: "happy", animation: "talk", line: `Hit. ${game.playerTotal} cannot bust.`, durationMs: 4200 },
            { emotion: "neutral", animation: "talk", line: `${dealerLabel} showing. Free courage.`, durationMs: 4200 },
        ];
    }

    if (game.playerTotal >= 17) {
        return [
            { emotion: "neutral", animation: "talk", line: `Stand. ${game.playerTotal} is real.`, durationMs: 4200 },
            { emotion: "surprised", animation: "react", line: `${dealerLabel} showing. Make them chase.`, durationMs: 4300 },
        ];
    }

    if (game.playerTotal === 12) {
        const shouldStand = dealerValue >= 4 && dealerValue <= 6;
        return [
            {
                emotion: shouldStand ? "neutral" : "angry",
                animation: shouldStand ? "talk" : "react",
                line: `${shouldStand ? "Stand" : "Hit"}. 12 into ${dealerLabel}.`,
                durationMs: 4200,
            },
            { emotion: "surprised", animation: "talk", line: shouldStand ? "Let dealer trip." : "One card. No drama.", durationMs: 4200 },
        ];
    }

    const shouldStand = dealerValue >= 2 && dealerValue <= 6;
    return [
        {
            emotion: shouldStand ? "neutral" : "angry",
            animation: shouldStand ? "talk" : "react",
            line: `${shouldStand ? "Stand" : "Hit"}. ${game.playerTotal} into ${dealerLabel}.`,
            durationMs: 4200,
        },
        { emotion: "happy", animation: "talk", line: shouldStand ? "Look calm." : "Take the rescue card.", durationMs: 4000 },
    ];
}

function getScene({
    isLoading,
    loadingError,
    state,
    view,
    lastOutcome,
}: VisualAvatarProps): AvatarScene {
    if (isLoading) {
        return {
            signature: "loading",
            beats: [
                { emotion: "surprised", animation: "react", line: "Hang on, I am waking up.", durationMs: 4600 },
                { emotion: "neutral", animation: "idle", line: "Pulling the table state into place.", durationMs: 5600 },
                { emotion: "happy", animation: "talk", line: "A dramatic entrance takes a second.", durationMs: 5200 },
            ],
        };
    }

    if (loadingError) {
        return {
            signature: `error-${loadingError}`,
            beats: [
                { emotion: "sad", animation: "react", line: "That load failed. I hate when the room goes quiet.", durationMs: 5200 },
                { emotion: "angry", animation: "talk", line: "Hit retry. I am not staying in a broken casino.", durationMs: 6200 },
                { emotion: "neutral", animation: "idle", line: "I can pose through downtime, not fix it by staring.", durationMs: 5600 },
            ],
        };
    }

    if (!state) {
        return {
            signature: "empty",
            beats: [
                { emotion: "neutral", animation: "idle", line: "I am here. The session briefing is not.", durationMs: 5600 },
                { emotion: "happy", animation: "react", line: "Once the state lands, I will start pretending to be insightful.", durationMs: 6200 },
            ],
        };
    }

    const unreadNotifications = state.notifications.filter(notification => !notification.isRead).length;
    const claimableMissions = state.missions.filter(mission => mission.status === "claimable").length;
    const unlockedAchievements = state.achievements.filter(achievement => achievement.status === "unlocked").length;
    const lowBalanceFloor = state.topUp.allowedAmounts[0] ?? 25;
    const outcomeScene = lastOutcome ? getOutcomeScene(lastOutcome, view) : null;

    if (outcomeScene) {
        return outcomeScene;
    }

    if (view === "coinflip") {
        const recommendation = getCoinFlipRecommendation(state, lastOutcome);
        return {
            signature: `coinflip-${state.session.balance}-${claimableMissions}`,
            beats: [
                { emotion: "happy", animation: "talk", line: `Pick ${recommendation.side}. ${recommendation.reason}.`, durationMs: 5200 },
                { emotion: "surprised", animation: "react", line: `${recommendation.side} has the fake signal.`, durationMs: 4200 },
                { emotion: "neutral", animation: "talk", line: "Call it early and stick to the story. Confidence matters more than evidence.", durationMs: 6600 },
                { emotion: "happy", animation: "talk", line: "Pick one and make it sound inevitable. The coin loves commitment.", durationMs: 6200 },
                { emotion: "surprised", animation: "react", line: "If you win, I meant this. If you lose, I was testing your independence.", durationMs: 6800 },
                { emotion: "neutral", animation: "talk", line: "Heads is tradition. Tails is rebellion. Both are marketable.", durationMs: 6200 },
                { emotion: "happy", animation: "talk", line: "Do not overthink it. The coin respects speed and questionable posture.", durationMs: 6200 },
                { emotion: "surprised", animation: "react", line: "I just detected a pattern. It is called guessing with confidence.", durationMs: 6200 },
                { emotion: "angry", animation: "talk", line: "The house cannot read your mind if your mind is mostly coin noises.", durationMs: 6600 },
            ],
        };
    }

    if (view === "dice") {
        const recommendation = getDiceRecommendation(state, lastOutcome);
        return {
            signature: `dice-${state.session.balance}-${claimableMissions}`,
            beats: [
                { emotion: "happy", animation: "talk", line: `Call ${recommendation.lane}. ${recommendation.reason}.`, durationMs: 5400 },
                { emotion: "neutral", animation: "talk", line: "Low or High is wider. Lucky 7 is louder.", durationMs: 5000 },
                { emotion: "surprised", animation: "react", line: "Seven sits in the middle like trouble wearing perfume.", durationMs: 5800 },
                { emotion: "neutral", animation: "talk", line: "If you call Lucky 7, do it because you mean it, not because the button looks good.", durationMs: 6800 },
                { emotion: "happy", animation: "talk", line: "Two dice, one decision, immediate consequences. Efficient.", durationMs: 5600 },
                { emotion: "neutral", animation: "talk", line: "Low and high are practical. Lucky 7 brought a cape.", durationMs: 6000 },
                { emotion: "surprised", animation: "react", line: "I can almost hear the dice negotiating with gravity.", durationMs: 5800 },
                { emotion: "happy", animation: "talk", line: "Pick the lane you can defend with a straight face.", durationMs: 5800 },
                { emotion: "angry", animation: "talk", line: "Do not let a pair of cubes intimidate you. They are furniture with dots.", durationMs: 6600 },
                { emotion: "neutral", animation: "idle", line: "A 7 is not a number here. It is a personality test.", durationMs: 6000 },
            ],
        };
    }

    if (view === "slots") {
        const recommendation = getSlotRecommendation(state, lastOutcome);
        return {
            signature: `slots-${state.session.balance}-${claimableMissions}`,
            beats: [
                { emotion: "happy", animation: "talk", line: `Spin ${formatCredits(recommendation.amount)}. ${recommendation.line}.`, durationMs: 5200 },
                { emotion: "surprised", animation: "react", line: "Check payouts. The fruit has ranks.", durationMs: 4400 },
                { emotion: "surprised", animation: "react", line: "The machine has vibes. I cannot legally explain them.", durationMs: 5600 },
                { emotion: "neutral", animation: "talk", line: "Set the wager, pull the lever, and act like the fruit reports to you.", durationMs: 6600 },
                { emotion: "happy", animation: "talk", line: "If the sevens land, I was obviously supervising.", durationMs: 5800 },
                { emotion: "surprised", animation: "react", line: "Cherries are humble. Diamonds are not. I respect both.", durationMs: 5800 },
                { emotion: "neutral", animation: "talk", line: "The reels are spinning like they know gossip.", durationMs: 5600 },
                { emotion: "angry", animation: "talk", line: "I do not trust the lemon. It has too much confidence.", durationMs: 5800 },
                { emotion: "happy", animation: "talk", line: "Three matching symbols would be tasteful. Please inform the machine.", durationMs: 6400 },
                { emotion: "neutral", animation: "idle", line: "A break-even cherry line is still a story with punctuation.", durationMs: 6200 },
            ],
        };
    }

    if (view === "crash") {
        const activeCrash = state.crash?.status === "active" ? state.crash : null;
        return {
            signature: activeCrash
                ? `crash-live-${activeCrash.id}-${activeCrash.betAmount}-${Math.floor(activeCrash.elapsedMs / 500)}`
                : `crash-idle-${state.session.balance}-${claimableMissions}`,
            beats: activeCrash
                ? [
                    { emotion: "surprised", animation: "react", line: "The multiplier is climbing. Decide before the rocket develops opinions.", durationMs: 5200 },
                    { emotion: "neutral", animation: "talk", line: "Cashout is not cowardice. It is profit with an exit plan.", durationMs: 6200 },
                    { emotion: "angry", animation: "talk", line: "Do not stare at the curve like it owes you friendship.", durationMs: 5800 },
                ]
                : [
                    { emotion: "happy", animation: "talk", line: "Crash is simple. Bet, lift off, leave before gravity notices.", durationMs: 5800 },
                    { emotion: "neutral", animation: "idle", line: "A clean 2x feels good. A greedy 20x tells stories in past tense.", durationMs: 6600 },
                    { emotion: "surprised", animation: "react", line: "Auto cashout is discipline with a timer.", durationMs: 5600 },
                ],
        };
    }

    if (view === "blackjack" && state.blackjack && !state.blackjack.isComplete) {
        const advice = getBlackjackAdvice(state.blackjack);
        return {
            signature: `blackjack-live-${state.blackjack.id}-${state.blackjack.status}-${state.blackjack.playerTotal}-${state.blackjack.dealerCards[0]?.rank ?? "hidden"}-${state.blackjack.dealerCards[0]?.suit ?? "hidden"}`,
            beats: [
                ...advice,
                { emotion: "neutral", animation: "talk", line: state.blackjack.message, durationMs: 5600 },
                { emotion: "surprised", animation: "react", line: "The dealer is always acting. Do not fall for the performance.", durationMs: 6000 },
                { emotion: "happy", animation: "talk", line: "Read the table, then act like you meant it.", durationMs: 5800 },
                { emotion: "neutral", animation: "talk", line: "Totals first, pride second. That is the closest I get to wisdom.", durationMs: 6200 },
                { emotion: "angry", animation: "talk", line: "A hidden card is just the dealer being theatrical.", durationMs: 5800 },
                { emotion: "surprised", animation: "react", line: "If your hand feels cursed, call it advanced tension.", durationMs: 6000 },
            ],
        };
    }

    if (view === "blackjack") {
        return {
            signature: "blackjack-idle",
            beats: [
                { emotion: "neutral", animation: "idle", line: "High table energy. Try not to embarrass us.", durationMs: 5600 },
                { emotion: "happy", animation: "talk", line: "A clean 21 makes me look smarter too.", durationMs: 5600 },
                { emotion: "angry", animation: "react", line: "Play disciplined for once. It would be refreshing.", durationMs: 6200 },
                { emotion: "surprised", animation: "react", line: "Blackjack is math wearing a tuxedo and lying sometimes.", durationMs: 6200 },
                { emotion: "neutral", animation: "talk", line: "Deal a hand when ready. I have several opinions queued.", durationMs: 5800 },
                { emotion: "happy", animation: "talk", line: "A face card and an ace would do wonders for morale.", durationMs: 5800 },
                { emotion: "angry", animation: "talk", line: "The dealer looks calm. Suspicious. Professionally suspicious.", durationMs: 6200 },
            ],
        };
    }

    if (view === "notifications" && unreadNotifications > 0) {
        return {
            signature: `notifications-${unreadNotifications}`,
            beats: [
                { emotion: "surprised", animation: "react", line: `You have ${unreadNotifications} unread notification${unreadNotifications === 1 ? "" : "s"}.`, durationMs: 5200 },
                { emotion: "neutral", animation: "talk", line: "Do not ignore the glowing problems. That is my job.", durationMs: 6000 },
                { emotion: "happy", animation: "talk", line: "Open them. Maybe one of them is good news for once.", durationMs: 5600 },
            ],
        };
    }

    if (claimableMissions > 0) {
        return {
            signature: `claimable-${claimableMissions}`,
            beats: [
                { emotion: "happy", animation: "talk", line: `I found ${claimableMissions} ready reward${claimableMissions === 1 ? "" : "s"}. Claim them before you forget.`, durationMs: 6200 },
                { emotion: "surprised", animation: "react", line: "Free progress counts. Take the easy win.", durationMs: 5400 },
                { emotion: "happy", animation: "talk", line: "I support any strategy that involves collecting money with minimal suffering.", durationMs: 6600 },
            ],
        };
    }

    if (state.session.balance <= lowBalanceFloor) {
        return {
            signature: `low-balance-${Math.floor(state.session.balance)}`,
            beats: [
                { emotion: "sad", animation: "react", line: `Balance is down to $${state.session.balance.toFixed(2)}. I am visibly worried.`, durationMs: 6200 },
                { emotion: "neutral", animation: "talk", line: "Maybe top up. Maybe call this a tactical retreat.", durationMs: 6200 },
                { emotion: "sad", animation: "idle", line: "This is the kind of bankroll that makes me speak softly.", durationMs: 5800 },
            ],
        };
    }

    if (view === "achievements") {
        return {
            signature: `achievements-${unlockedAchievements}`,
            beats: [
                { emotion: "happy", animation: "talk", line: `You unlocked ${unlockedAchievements} achievement${unlockedAchievements === 1 ? "" : "s"}. I approve of shiny progress.`, durationMs: 6400 },
                { emotion: "neutral", animation: "idle", line: "Collect enough badges and I will become intolerably smug.", durationMs: 6000 },
                { emotion: "happy", animation: "talk", line: "A trophy wall makes any fake AI sound more convincing.", durationMs: 6200 },
            ],
        };
    }

    if (view === "missions") {
        return {
            signature: "missions",
            beats: [
                { emotion: "neutral", animation: "talk", line: "Mission board is open. Let us pretend this is disciplined behavior.", durationMs: 6400 },
                { emotion: "happy", animation: "talk", line: "Small goals first. Momentum looks good on both of us.", durationMs: 5800 },
                { emotion: "surprised", animation: "react", line: "Complete the easy ones first and call it strategy.", durationMs: 6200 },
            ],
        };
    }

    if (view === "topup") {
        return {
            signature: "topup",
            beats: [
                { emotion: "sad", animation: "idle", line: "Refill screen. Tough scene, but we recover.", durationMs: 6200 },
                { emotion: "happy", animation: "talk", line: "Fresh bankroll, fresh delusions. I support the reset.", durationMs: 6200 },
                { emotion: "neutral", animation: "talk", line: "Rebuilding is still a plan, even if it starts with admitting things.", durationMs: 6600 },
            ],
        };
    }

    if (view === "history") {
        return {
            signature: "history",
            beats: [
                { emotion: "neutral", animation: "idle", line: "Bet history is open. The receipts have entered the chat.", durationMs: 6200 },
                { emotion: "surprised", animation: "react", line: "If this trend was intentional, I respect the commitment.", durationMs: 6000 },
                { emotion: "neutral", animation: "talk", line: "Past bets are just stories with numbers attached.", durationMs: 6200 },
            ],
        };
    }

    if (view === "profile") {
        return {
            signature: `profile-${state.session.level}`,
            beats: [
                { emotion: "happy", animation: "talk", line: `Level ${state.session.level}. You are developing a reputation.`, durationMs: 6000 },
                { emotion: "neutral", animation: "idle", line: "Numbers, stats, presence. A strong profile needs all three.", durationMs: 6200 },
                { emotion: "happy", animation: "talk", line: "This page makes you look organized. Let us enjoy that illusion.", durationMs: 6600 },
            ],
        };
    }

    return {
        signature: "lobby",
        beats: [
            { emotion: "neutral", animation: "idle", line: "I will keep an eye on the room while you choose a game.", durationMs: 6200 },
            { emotion: "happy", animation: "talk", line: "Coinflip is quick. Dice is loud. Blackjack is classy. Pick your poison.", durationMs: 6200 },
            { emotion: "surprised", animation: "react", line: "Tap me if you want a new thought. I have plenty.", durationMs: 5800 },
            { emotion: "happy", animation: "talk", line: "I can motivate. I can judge. I can also do both at once.", durationMs: 6600 },
        ],
    };
}

export function VisualAvatar({
    isLoading,
    loadingError,
    state,
    view,
    lastOutcome,
}: VisualAvatarProps) {
    const [animation, setAnimation] = useState<AvatarAnimation>("idle");
    const [isMinimized, setIsMinimized] = useState(false);
    const [beatIndex, setBeatIndex] = useState(0);
    const [positionX, setPositionX] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const shellRef = useRef<HTMLElement | null>(null);
    const dragStateRef = useRef<{ pointerId: number | null; startX: number; startLeft: number; moved: boolean }>({
        pointerId: null,
        startX: 0,
        startLeft: 0,
        moved: false,
    });
    const suppressClickRef = useRef(false);

    const scene = useMemo(
        () =>
            getScene({
                isLoading,
                loadingError,
                state,
                view,
                lastOutcome,
            }),
        [isLoading, loadingError, state, view, lastOutcome],
    );

    const activeBeat = scene.beats[beatIndex % scene.beats.length] ?? scene.beats[0];

    useEffect(() => {
        setBeatIndex(0);
    }, [scene.signature]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const clampPosition = (value: number) => {
            const shellWidth = shellRef.current?.offsetWidth ?? 240;
            return Math.min(
                Math.max(AVATAR_MARGIN, value),
                Math.max(AVATAR_MARGIN, window.innerWidth - shellWidth - AVATAR_MARGIN),
            );
        };

        const storedValue = window.localStorage.getItem(AVATAR_STORAGE_KEY);
        const parsedStoredValue = storedValue ? Number(storedValue) : Number.NaN;
        const fallback = window.innerWidth - (shellRef.current?.offsetWidth ?? 240) - AVATAR_MARGIN;
        const initial = Number.isFinite(parsedStoredValue) ? parsedStoredValue : fallback;
        setPositionX(clampPosition(initial));

        const handleResize = () => {
            setPositionX(current => clampPosition(current ?? fallback));
        };

        window.addEventListener("resize", handleResize);
        return () => {
            window.removeEventListener("resize", handleResize);
        };
    }, []);

    useEffect(() => {
        if (typeof window === "undefined" || !activeBeat) {
            return;
        }

        const advanceTimer = window.setTimeout(() => {
            setBeatIndex(current => (current + 1) % scene.beats.length);
        }, activeBeat.durationMs ?? 3600);

        return () => {
            window.clearTimeout(advanceTimer);
        };
    }, [activeBeat, scene.beats.length]);

    useEffect(() => {
        if (typeof window === "undefined" || !activeBeat) {
            return;
        }

        setAnimation("react");

        const talkTimer = window.setTimeout(() => {
            setAnimation(activeBeat.animation);
        }, 150);

        const idleTimer = window.setTimeout(() => {
            setAnimation("idle");
        }, Math.min((activeBeat.durationMs ?? 5600) - 900, 3200));

        return () => {
            window.clearTimeout(talkTimer);
            window.clearTimeout(idleTimer);
        };
    }, [activeBeat]);

    const clampPosition = (value: number) => {
        if (typeof window === "undefined") {
            return value;
        }

        const shellWidth = shellRef.current?.offsetWidth ?? 240;
        return Math.min(
            Math.max(AVATAR_MARGIN, value),
            Math.max(AVATAR_MARGIN, window.innerWidth - shellWidth - AVATAR_MARGIN),
        );
    };

    const handleDragStart = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (typeof window === "undefined") {
            return;
        }

        if (event.pointerType === "mouse" && event.button !== 0) {
            return;
        }

        const currentLeft = positionX ?? shellRef.current?.getBoundingClientRect().left ?? window.innerWidth - 240 - AVATAR_MARGIN;
        dragStateRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startLeft: currentLeft,
            moved: false,
        };
        setIsDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handleDragMove = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (dragStateRef.current.pointerId !== event.pointerId) {
            return;
        }

        const deltaX = event.clientX - dragStateRef.current.startX;
        if (Math.abs(deltaX) > 6) {
            dragStateRef.current.moved = true;
        }
        setPositionX(clampPosition(dragStateRef.current.startLeft + deltaX));
    };

    const finishDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (dragStateRef.current.pointerId !== event.pointerId) {
            return;
        }

        const nextPosition = clampPosition(positionX ?? dragStateRef.current.startLeft);
        suppressClickRef.current = dragStateRef.current.moved;
        dragStateRef.current.pointerId = null;
        dragStateRef.current.moved = false;
        setPositionX(nextPosition);
        setIsDragging(false);

        if (typeof window !== "undefined") {
            window.localStorage.setItem(AVATAR_STORAGE_KEY, String(nextPosition));
        }

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    };

    const handleCharacterClick = () => {
        if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
        }

        setBeatIndex(current => (current + 1) % scene.beats.length);
    };

    if (!activeBeat) {
        return null;
    }

    return (
        <aside
            ref={shellRef}
            className={`avatar-shell ${isDragging ? "avatar-shell-dragging" : ""}`}
            style={positionX === null ? undefined : { left: `${positionX}px` }}
        >
            {isMinimized ? (
                <button
                    aria-label="Show Coral"
                    className="avatar-minimized arcade-button"
                    onClick={() => setIsMinimized(false)}
                    type="button"
                >
                    <span className="avatar-minimized-ring">
                        <img alt="Coral avatar" className="avatar-minimized-image" src={emotionArt[activeBeat.emotion]} />
                    </span>
                </button>
            ) : (
                <div className="avatar-stage">
                    <div className="avatar-bubble">
                        <p key={`${scene.signature}-${beatIndex}`} className="avatar-dialogue">
                            {activeBeat.line}
                        </p>
                    </div>

                    <div className="avatar-character-wrap">
                        <button
                            aria-label="Minimize Coral"
                            className="avatar-minimize-control arcade-button"
                            onClick={() => setIsMinimized(true)}
                            type="button"
                        />

                        <button
                            aria-label="Ask Coral for another line"
                            className={`avatar-character avatar-motion-${animation} ${isDragging ? "avatar-character-dragging" : ""}`}
                            onClick={handleCharacterClick}
                            onDragStart={event => event.preventDefault()}
                            onPointerCancel={finishDrag}
                            onPointerDown={handleDragStart}
                            onPointerMove={handleDragMove}
                            onPointerUp={finishDrag}
                            type="button"
                        >
                            <span className="avatar-character-glow" />
                            <span className="avatar-character-base" />
                            <img
                                alt={`${activeBeat.emotion} Coral avatar`}
                                className="avatar-character-image"
                                draggable={false}
                                onDragStart={event => event.preventDefault()}
                                src={emotionArt[activeBeat.emotion]}
                            />
                        </button>
                    </div>
                </div>
            )}
        </aside>
    );
}
