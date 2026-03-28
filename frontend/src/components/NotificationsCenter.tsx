import { useState } from "react";
import type { AppNotification } from "../lib/session";

type NotificationsCenterProps = {
    notifications: AppNotification[];
};

type NotificationFilter = "all" | "notification" | "news";

const formatDate = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));

const filterOptions: Array<{ key: NotificationFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "notification", label: "Notifications" },
    { key: "news", label: "News" },
];

export function NotificationsCenter({ notifications }: NotificationsCenterProps) {
    const [activeFilter, setActiveFilter] = useState<NotificationFilter>("all");

    const visibleNotifications = notifications.filter(notification =>
        activeFilter === "all" ? true : notification.category === activeFilter,
    );

    const unreadCount = notifications.filter(notification => !notification.isRead).length;
    const newsCount = notifications.filter(notification => notification.category === "news").length;

    return (
        <section className="page-swap page-from-right w-full max-w-4xl rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Notifications tab</p>
                        <h2 className="mt-2 font-display text-3xl text-white">Inbox for alerts and casino news</h2>
                        <p className="mt-3 max-w-2xl text-sm text-slate-300/75">
                            Balance updates, reward payouts, and product news land here automatically.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <StatCard label="Unread" value={`${unreadCount}`} accent="text-cyan-200" />
                        <StatCard label="News" value={`${newsCount}`} accent="text-amber-200" />
                        <StatCard label="Total" value={`${notifications.length}`} accent="text-white" />
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    {filterOptions.map(option => (
                        <button
                            key={option.key}
                            onClick={() => setActiveFilter(option.key)}
                            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${activeFilter === option.key
                                    ? "bg-white/15 text-white shadow-[0_0_30px_rgba(56,189,248,0.18)]"
                                    : "border border-white/10 bg-white/5 text-slate-300/75 hover:bg-white/10 hover:text-white"
                                }`}
                            type="button"
                        >
                            {option.label}
                        </button>
                    ))}
                </div>

                {visibleNotifications.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-white/10 bg-black/10 px-6 py-12 text-center">
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-400/70">No entries</p>
                        <p className="mt-3 text-sm text-slate-300/75">This filter does not have any notifications yet.</p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {visibleNotifications.map(notification => (
                            <article
                                key={notification.id}
                                className={`rounded-3xl border p-5 transition ${notificationTone(notification.severity)} ${notification.isRead ? "opacity-80" : "shadow-[0_18px_45px_rgba(8,15,35,0.22)]"
                                    }`}
                            >
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] ${notificationBadge(notification.category)}`}>
                                                {notification.category === "news" ? "News" : "Notification"}
                                            </span>
                                            <span className="text-[11px] uppercase tracking-[0.24em] text-slate-400/70">
                                                {formatDate(notification.createdAt)}
                                            </span>
                                            {!notification.isRead && (
                                                <span className="rounded-full bg-cyan-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-950">
                                                    New
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="mt-3 font-display text-2xl text-white">{notification.title}</h3>
                                        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200/80">{notification.message}</p>
                                    </div>

                                    <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-right">
                                        <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400/65">Severity</p>
                                        <p className="mt-1 font-display text-lg text-white capitalize">{notification.severity}</p>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400/70">{label}</p>
            <p className={`mt-1 font-display text-2xl ${accent}`}>{value}</p>
        </div>
    );
}

function notificationTone(severity: AppNotification["severity"]) {
    switch (severity) {
        case "success":
            return "border-emerald-300/20 bg-[linear-gradient(135deg,rgba(6,78,59,0.32),rgba(15,23,42,0.76))]";
        case "warning":
            return "border-amber-300/20 bg-[linear-gradient(135deg,rgba(120,53,15,0.28),rgba(15,23,42,0.78))]";
        default:
            return "border-cyan-300/18 bg-[linear-gradient(135deg,rgba(8,47,73,0.34),rgba(15,23,42,0.78))]";
    }
}

function notificationBadge(category: AppNotification["category"]) {
    return category === "news"
        ? "border border-amber-300/30 bg-amber-300/12 text-amber-100"
        : "border border-cyan-300/30 bg-cyan-300/12 text-cyan-100";
}
