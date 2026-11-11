"use client";

import {
  ClipboardList,
  Coins,
  Lock,
  MoonStar,
  Sparkles,
  Store,
  Target,
  Trophy,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import {
  BUSINESS_STARTER_BADGE,
  isBusinessBasicsComplete,
} from "@/features/learn/business-basics-lessons";
import { FUTURE_LEVEL_PREVIEWS, isLessonUnlocked, LEARN_PATHS } from "@/features/learn/catalog";
import { LearnHubHero } from "@/features/learn/components/learn-hub-hero";
import { LearnStatsBar } from "@/features/learn/components/learn-stats-bar";
import { LessonNode } from "@/features/learn/components/lesson-node";
import { useTranslation } from "@/lib/i18n/context";
import { fetchLearnProgress } from "@/services/learn-progress-service";
import type { LearnPath } from "@/features/learn/types";
import { cn } from "@/lib/utils";

const pathIcons = {
  store: Store,
  coins: Coins,
  target: Target,
  sparkles: Sparkles,
  clipboard: ClipboardList,
  moon: MoonStar,
} as const;

function pathOffset(index: number): "left" | "center" | "right" {
  const m = index % 3;
  return m === 0 ? "center" : m === 1 ? "right" : "left";
}

export function LearnHubScreen({
  profileId,
  islamicMode,
}: {
  profileId: string;
  islamicMode: boolean;
}) {
  const { t } = useTranslation();
  const { data: progress } = useQuery({
    queryKey: ["learn-progress", profileId],
    queryFn: () => fetchLearnProgress(profileId),
  });

  const state = progress ?? {
    totalXp: 0,
    streakCount: 0,
    lastActivityDate: null,
    heartsRemaining: 5,
    heartsDate: new Date().toISOString().slice(0, 10),
    completedLessonIds: [],
    badges: [],
  };

  const completed = new Set(state.completedLessonIds);
  const hasStarterBadge =
    state.badges?.includes(BUSINESS_STARTER_BADGE) ||
    isBusinessBasicsComplete(state.completedLessonIds);
  void islamicMode;
  const paths = LEARN_PATHS;

  function lessonStatus(lessonId: string, pathLessons: LearnPath["lessons"]) {
    if (completed.has(lessonId)) return "completed" as const;
    if (!isLessonUnlocked(lessonId, completed)) return "locked" as const;
    const firstOpen = pathLessons.find(
      (l) => !completed.has(l.id) && isLessonUnlocked(l.id, completed),
    );
    if (firstOpen?.id === lessonId) return "current" as const;
    return "available" as const;
  }

  const today = new Date().toISOString().slice(0, 10);
  const dailyDone = state.lastActivityDate === today;

  return (
    <div className="learn-hub min-h-0 pb-8">
      <LearnHubHero totalXp={state.totalXp} />

      <div className="mt-4">
        <LearnStatsBar totalXp={state.totalXp} streak={state.streakCount} hearts={state.heartsRemaining} />
      </div>

      {hasStarterBadge && (
        <div className="learn-badge-card mt-4 rounded-3xl border border-primary/40 p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-foreground dark:text-primary">
            {t("app.learn.yourBadge")}
          </p>
          <p className="mt-1 flex items-center gap-2 text-lg font-extrabold text-foreground dark:text-primary-foreground">
            <span className="text-2xl" aria-hidden>
              🏆
            </span>
            {t("app.learn.businessStarterBadge")}
          </p>
        </div>
      )}

      <div
        className={cn(
          "learn-daily-card mt-4 overflow-hidden rounded-3xl border shadow-sm",
          dailyDone ? "border-primary/30" : "border-primary/20",
        )}
      >
        <div className="flex items-center gap-2 bg-gradient-to-r from-primary/15 to-secondary/10 px-4 py-2.5">
          <Trophy className="size-5 text-primary" strokeWidth={2.25} />
          <p className="text-sm font-extrabold">{t("app.learn.dailyMission")}</p>
          {dailyDone && (
            <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
              ✓
            </span>
          )}
        </div>
        <p className="px-4 py-3 text-sm text-muted-foreground">{t("app.learn.dailyMissionHint")}</p>
      </div>

      <div className="mt-8 space-y-10">
        {paths.map((path) => {
          const Icon = pathIcons[path.icon];
          const doneCount = path.lessons.filter((l) => completed.has(l.id)).length;
          const total = path.lessons.length;
          const pathPct = total > 0 ? (doneCount / total) * 100 : 0;

          return (
            <section key={path.id} className="learn-path-section rounded-3xl border border-primary/10 bg-card/80 p-4 shadow-sm backdrop-blur-sm sm:p-5">
              <div className="mb-5 flex items-start gap-3">
                <span
                  className={cn(
                    "flex size-12 shrink-0 items-center justify-center rounded-2xl shadow-sm",
                    path.colorClass,
                  )}
                >
                  <Icon className="size-6" strokeWidth={2.25} />
                </span>
                <div className="min-w-0 flex-1">
                  {path.levelLabelKey && (
                    <p className="text-[11px] font-bold uppercase tracking-wide text-primary">
                      {t(path.levelLabelKey)}
                    </p>
                  )}
                  <h2 className="text-lg font-extrabold leading-tight">{t(path.titleKey)}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t(path.subtitleKey)}</p>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] font-bold text-primary">
                      <span>
                        {t("app.learn.pathProgress")
                          .replace("{done}", String(doneCount))
                          .replace("{total}", String(total))}
                      </span>
                      <span className="tabular-nums">{Math.round(pathPct)}%</span>
                    </div>
                    <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-primary/10">
                      <div
                        className="learn-step-bar h-full rounded-full transition-all duration-700"
                        style={{ width: `${pathPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="learn-path-track relative space-y-8 py-2">
                <div
                  className="learn-path-line pointer-events-none absolute left-1/2 top-6 bottom-6 w-1.5 -translate-x-1/2 rounded-full"
                  aria-hidden
                />
                {path.lessons.map((lesson, li) => (
                  <LessonNode
                    key={lesson.id}
                    lessonId={lesson.id}
                    lessonNumber={li + 1}
                    title={t(lesson.titleKey)}
                    xp={lesson.xp}
                    status={lessonStatus(lesson.id, path.lessons)}
                    offset={pathOffset(li)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-muted-foreground">
          <Lock className="size-4" />
          {t("app.learn.lockedLevel")}
        </h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {FUTURE_LEVEL_PREVIEWS.map((level) => (
            <li
              key={level.id}
              className="learn-locked-level flex items-center gap-3 rounded-2xl border border-dashed px-4 py-3"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-muted/80 text-xl" aria-hidden>
                {level.emoji}
              </span>
              <span className="text-sm font-semibold text-muted-foreground">{t(level.titleKey)}</span>
              <Lock className="ml-auto size-4 shrink-0 text-muted-foreground/50" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
