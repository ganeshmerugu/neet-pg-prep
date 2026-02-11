"use client";

import { useState, useMemo } from "react";
import { X, CheckCircle, XCircle, Circle, Bookmark } from "lucide-react";
import clsx from "clsx";

type PaletteProps = {
    total: number;
    attempts: Record<string, { isCorrect: boolean }>; // map of questionId -> status
    bookmarks: Set<string>; // set of bookmarked questionIds
    questionIdMap: Array<{ id: string; index: number }>; // map index -> questionId
    currentIndex: number;
    onJump: (index: number) => void;
    onClose: () => void;
};

type Filter = "all" | "unattempted" | "mistakes" | "bookmarked";

export function QuestionPalette({
    total,
    attempts,
    bookmarks,
    questionIdMap,
    currentIndex,
    onJump,
    onClose,
}: PaletteProps) {
    const [filter, setFilter] = useState<Filter>("all");

    const items = useMemo(() => {
        const list = [];
        // We want to show 1..Total
        // We rely on questionIdMap being properly sorted (index 0 = Q1)
        // If map is partial, we fill with placeholders, but map should be full.

        for (let i = 0; i < total; i++) {
            const qId = questionIdMap[i]?.id;
            const attempt = qId ? attempts[qId] : undefined;
            const isBookmarked = qId ? bookmarks.has(qId) : false;
            const isCorrect = attempt?.isCorrect === true;
            const isWrong = attempt?.isCorrect === false;
            const isAttempted = attempt !== undefined;

            list.push({
                index: i,
                number: i + 1,
                id: qId,
                isCorrect,
                isWrong,
                isAttempted,
                isBookmarked,
            });
        }
        return list;
    }, [total, attempts, bookmarks, questionIdMap]);

    const filteredItems = useMemo(() => {
        return items.filter((item) => {
            if (filter === "all") return true;
            if (filter === "unattempted") return !item.isAttempted;
            if (filter === "mistakes") return item.isWrong;
            if (filter === "bookmarked") return item.isBookmarked;
            return true;
        });
    }, [items, filter]);

    const stats = useMemo(() => {
        const attempted = items.filter((i) => i.isAttempted).length;
        const correct = items.filter((i) => i.isCorrect).length;
        const mistakes = items.filter((i) => i.isWrong).length;
        return { attempted, correct, mistakes };
    }, [items]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="flex h-full max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-[var(--card-bg)] shadow-2xl ring-1 ring-[var(--card-border)]">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[color:var(--card-border)] p-4 sm:p-6">
                    <div>
                        <h2 className="text-lg font-bold text-[var(--app-fg)]">Question Palette</h2>
                        <div className="mt-1 flex items-center gap-3 text-xs text-[var(--muted-fg)]">
                            <span className="flex items-center gap-1">
                                <div className="size-2 rounded-full bg-emerald-500" /> {stats.correct} Correct
                            </span>
                            <span className="flex items-center gap-1">
                                <div className="size-2 rounded-full bg-rose-500" /> {stats.mistakes} Mistakes
                            </span>
                            <span className="flex items-center gap-1">
                                <div className="size-2 rounded-full bg-[var(--muted-fg)]" /> {total - stats.attempted} Left
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-full p-2 text-[var(--muted-fg)] transition hover:bg-[var(--soft-bg)] hover:text-[var(--app-fg)]"
                    >
                        <X className="size-6" />
                    </button>
                </div>

                {/* Filters */}
                <div className="flex gap-2 overflow-x-auto border-b border-[color:var(--card-border)] bg-[var(--soft-bg)] p-2">
                    {[
                        { id: "all", label: "All Questions" },
                        { id: "unattempted", label: "Unattempted" },
                        { id: "mistakes", label: "Mistakes" },
                        { id: "bookmarked", label: "Bookmarked" },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setFilter(tab.id as Filter)}
                            className={clsx(
                                "whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition active:scale-95",
                                filter === tab.id
                                    ? "bg-[var(--card-bg)] text-[var(--app-fg)] shadow-sm ring-1 ring-[var(--card-border)]"
                                    : "text-[var(--muted-fg)] hover:text-[var(--app-fg)]",
                            )}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Grid */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                    <div className="grid grid-cols-5 gap-3 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
                        {filteredItems.map((item) => {
                            const isActive = item.index === currentIndex;
                            let bg = "bg-[var(--soft-bg)]";
                            let text = "text-[var(--app-fg)]";
                            let border = "border-transparent";

                            if (item.isCorrect) {
                                bg = "bg-emerald-500/15";
                                text = "text-emerald-600 dark:text-emerald-400";
                                border = "border-emerald-500/20";
                            } else if (item.isWrong) {
                                bg = "bg-rose-500/15";
                                text = "text-rose-600 dark:text-rose-400";
                                border = "border-rose-500/20";
                            }

                            if (isActive) {
                                border = "border-[var(--accent)] ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--card-bg)]";
                            }

                            return (
                                <button
                                    key={item.index}
                                    onClick={() => {
                                        onJump(item.index);
                                        onClose();
                                    }}
                                    className={clsx(
                                        "group relative flex aspect-square flex-col items-center justify-center rounded-xl border text-sm font-bold transition hover:scale-105 active:scale-95",
                                        bg,
                                        text,
                                        border,
                                    )}
                                >
                                    {item.number}
                                    {item.isBookmarked && (
                                        <div className="absolute -right-1 -top-1 rounded-full bg-[var(--card-bg)] p-0.5 text-purple-500 shadow-sm ring-1 ring-[var(--card-border)]">
                                            <Bookmark className="size-3 fill-current" />
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    {filteredItems.length === 0 && (
                        <div className="flex h-full flex-col items-center justify-center text-[var(--muted-fg)]">
                            <div className="text-lg font-medium">No questions found</div>
                            <p className="text-sm">Try changing the filter.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
