import { useEffect, useMemo, useRef, useState } from "react";
import type { AppState } from "../lib/session";
import coralAngry from "../assets/assets/girl_red/coral_angry.png";
import coralHappy from "../assets/assets/girl_red/coral_happy.png";
import coralNeutral from "../assets/assets/girl_red/coral_neutral.png";
import coralSad from "../assets/assets/girl_red/coral_sad.png";
import coralSurprised from "../assets/assets/girl_red/coral_surprised.png";

type AvatarEmotion = "neutral" | "happy" | "sad" | "angry" | "surprised";
type AvatarAnimation = "idle" | "talk" | "react";
type AvatarView =
    | "lobby"
    | "missions"
    | "achievements"
    | "coinflip"
    | "dice"
    | "blackjack"
    | "history"
    | "topup"
    | "profile"
    | "notifications";

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

function getScene({
    isLoading,
    loadingError,
    state,
    view,
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

    if (view === "coinflip") {
        return {
            signature: `coinflip-${state.session.balance}-${claimableMissions}`,
            beats: [
                { emotion: "happy", animation: "talk", line: "Coin table time. I am feeling tails today.", durationMs: 5400 },
                { emotion: "surprised", animation: "react", line: "No, wait. Heads has chaotic winner energy.", durationMs: 5200 },
                { emotion: "neutral", animation: "talk", line: "Call it early and stick to the story. Confidence matters more than evidence.", durationMs: 6600 },
                { emotion: "happy", animation: "talk", line: "Pick one and make it sound inevitable. The coin loves commitment.", durationMs: 6200 },
                { emotion: "surprised", animation: "react", line: "If you win, I meant this. If you lose, I was testing your independence.", durationMs: 6800 },
            ],
        };
    }

    if (view === "dice") {
        return {
            signature: `dice-${state.session.balance}-${claimableMissions}`,
            beats: [
                { emotion: "happy", animation: "talk", line: "Dice table is live. Low is safe, Lucky 7 is dramatic.", durationMs: 5600 },
                { emotion: "surprised", animation: "react", line: "Seven sits in the middle like trouble wearing perfume.", durationMs: 5800 },
                { emotion: "neutral", animation: "talk", line: "If you call Lucky 7, do it because you mean it, not because the button looks good.", durationMs: 6800 },
                { emotion: "happy", animation: "talk", line: "Two dice, one decision, immediate consequences. Efficient.", durationMs: 5600 },
            ],
        };
    }

    if (view === "blackjack" && state.blackjack && !state.blackjack.isComplete) {
        return {
            signature: `blackjack-live-${state.blackjack.id}-${state.blackjack.status}`,
            beats: [
                { emotion: "angry", animation: "react", line: "Focus. Blackjack deserves a sharper face than coinflip.", durationMs: 5200 },
                { emotion: "neutral", animation: "talk", line: state.blackjack.message, durationMs: 5600 },
                { emotion: "surprised", animation: "react", line: "The dealer is always acting. Do not fall for the performance.", durationMs: 6000 },
                { emotion: "happy", animation: "talk", line: "Read the table, then act like you meant it.", durationMs: 5800 },
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
            }),
        [isLoading, loadingError, state, view],
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
