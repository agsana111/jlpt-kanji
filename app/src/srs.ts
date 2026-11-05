import { createEmptyCard, fsrs, generatorParameters, Rating, type Grade } from "ts-fsrs";
import type { CardData, Grade3, Progress, Status } from "./types";

const scheduler = fsrs(
  generatorParameters({
    enable_fuzz: true,
    enable_short_term: false, // same-day repeats are handled by the session, not the scheduler
    request_retention: 0.9,
    maximum_interval: 365,
  }),
);

const RATING: Record<Grade3, Grade> = { 1: Rating.Again, 2: Rating.Hard, 3: Rating.Good };

/** A study "day" starts at 04:00 local time. */
export const DAY_START_HOUR = 4;

export function dayKey(d = new Date()): string {
  const t = new Date(d.getTime() - DAY_START_HOUR * 3600_000);
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const dd = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** End of the current study day (next 04:00). */
export function endOfDay(d = new Date()): Date {
  const t = new Date(d.getTime() - DAY_START_HOUR * 3600_000);
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 1);
  return new Date(t.getTime() + DAY_START_HOUR * 3600_000);
}

export function newProgress(card: CardData, deck: string): Progress {
  return {
    id: card.id,
    deck,
    fsrs: createEmptyCard(new Date()),
    goodStreak: 0,
    wrongTotal: 0,
    lastGrade: 1,
    leechAuto: false,
    leechManual: false,
    firstSeen: dayKey(),
    history: [],
  };
}

const LEECH_WRONG = 6;
const LEECH_CLEAR_STREAK = 3;
const MASTER_DAYS = 21;

/** Apply the day's first evaluation: this is the only thing that moves the long-term schedule. */
export function applyFirstEval(p: Progress, g: Grade3, now = new Date()): Progress {
  const next = scheduler.next(p.fsrs, now, RATING[g]).card;
  const goodStreak = g === 3 ? p.goodStreak + 1 : 0;
  const wrongTotal = p.wrongTotal + (g === 1 ? 1 : 0);
  let leechAuto = p.leechAuto;
  if (g === 1 && wrongTotal >= LEECH_WRONG) leechAuto = true;
  if (leechAuto && goodStreak >= LEECH_CLEAR_STREAK) leechAuto = false;
  return {
    ...p,
    fsrs: next,
    goodStreak,
    wrongTotal,
    lastGrade: g,
    leechAuto,
    history: [...p.history, { d: dayKey(now), g }],
  };
}

/** Failed again in the final test: bring the card back tomorrow at the latest. */
export function pullToTomorrow(p: Progress, now = new Date()): Progress {
  const tomorrow = endOfDay(now);
  if (p.fsrs.due.getTime() <= tomorrow.getTime()) return p;
  return { ...p, fsrs: { ...p.fsrs, due: tomorrow, scheduled_days: 1 } };
}

export function isDue(p: Progress, now = new Date()): boolean {
  return p.fsrs.due.getTime() < endOfDay(now).getTime();
}

export function isOverdue(p: Progress, now = new Date()): boolean {
  const startToday = new Date(endOfDay(now).getTime() - 86400_000);
  return p.fsrs.due.getTime() < startToday.getTime();
}

export function retrievability(p: Progress, now = new Date()): number {
  if (!p.fsrs.last_review) return 0;
  return scheduler.get_retrievability(p.fsrs, now, false) as number;
}

export function cardStatus(p: Progress | undefined): Status {
  if (!p) return "new";
  if (p.leechManual || p.leechAuto) return "leech";
  if (p.fsrs.scheduled_days >= MASTER_DAYS && p.goodStreak >= 2) return "mastered";
  if (p.lastGrade === 2 || (p.fsrs.lapses >= 2 && p.goodStreak < 2)) return "shaky";
  return "learning";
}

/** Next interval preview for the three buttons, in days. */
export function previewIntervals(p: Progress | undefined, card: CardData, deck: string, now = new Date()) {
  const base = p ?? newProgress(card, deck);
  const out = {} as Record<Grade3, number>;
  for (const g of [1, 2, 3] as Grade3[]) {
    out[g] = scheduler.next(base.fsrs, now, RATING[g]).card.scheduled_days;
  }
  return out;
}

export const STATUS_LABEL: Record<Status, string> = {
  new: "안 건드림",
  learning: "익히는 중",
  shaky: "긴가민가",
  mastered: "마스터",
  leech: "안 외워짐",
};
