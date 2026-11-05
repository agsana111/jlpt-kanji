import { breakEndDate, daysBetween, learnedJustBefore, type BreakState } from "./insights";
import { cardStatus, dayKey, isDue, isOverdue, retrievability } from "./srs";
import type { BreakPlan, DeckData, Progress, Session, Settings, Status } from "./types";

export function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/** Reviews done today across every deck (first evaluations of cards first seen on an earlier day). */
export function reviewsDoneToday(progress: Map<string, Progress>, day = dayKey()): number {
  let n = 0;
  for (const p of progress.values()) {
    if (p.firstSeen !== day && p.history.some((h) => h.d === day)) n++;
  }
  return n;
}

export function dueCards(
  deck: DeckData,
  progress: Map<string, Progress>,
  exclude: Set<string> = new Set(),
  brk: BreakState = { phase: "none", plan: null },
) {
  const now = new Date();
  const day = dayKey(now);
  // before a break, everything that would fall due during the break is reviewed early
  const horizon = brk.phase === "pre" && brk.plan ? breakEndDate(brk.plan) : null;
  const due = (p: Progress) => (horizon ? p.fsrs.due.getTime() < horizon.getTime() : isDue(p, now));
  const fragileFirst = brk.phase === "after" && brk.plan ? (p: Progress) => (learnedJustBefore(p, brk.plan!) ? 0 : 1) : () => 0;
  return deck.cards
    .map((c) => progress.get(c.id))
    .filter((p): p is Progress => !!p && !exclude.has(p.id) && due(p) && !p.history.some((h) => h.d === day))
    .sort((a, b) => fragileFirst(a) - fragileFirst(b) || retrievability(a, now) - retrievability(b, now));
}

export function newCards(deck: DeckData, progress: Map<string, Progress>, exclude: Set<string> = new Set()) {
  return deck.cards.filter((c) => !progress.has(c.id) && !exclude.has(c.id));
}

export interface Batch {
  newIds: string[];
  reviewIds: string[];
  notice: string | null;
}

export function buildBatch(
  deck: DeckData,
  progress: Map<string, Progress>,
  settings: Settings,
  mode: "full" | "quick",
  seen: string[],
  brk: BreakState = { phase: "none", plan: null },
): Batch {
  const exclude = new Set(seen);
  const due = dueCards(deck, progress, exclude, brk);
  const capLeft = Math.max(0, settings.reviewCap - reviewsDoneToday(progress));
  let notice: string | null = null;
  if (mode === "quick") {
    return { newIds: [], reviewIds: due.slice(0, Math.min(15, capLeft)).map((p) => p.id), notice };
  }
  const reviewIds = due.slice(0, Math.min(settings.reviewPerBatch, capLeft)).map((p) => p.id);
  if (capLeft === 0 && due.length) notice = `오늘 복습 상한(${settings.reviewCap}장)에 닿아서 남은 복습은 내일로 넘겼어요.`;
  const overdue = due.filter((p) => isOverdue(p)).length;
  let newIds: string[] = [];
  if (brk.phase === "pre") {
    notice = "쉬는 기간 직전이라 신규는 쉬고, 쉬는 동안 돌아올 카드를 미리 복습해요.";
  } else if (overdue > settings.backlogStop) {
    notice = `밀린 복습이 ${overdue}장이라 신규는 잠시 멈췄어요. 복습부터 줄여요.`;
  } else {
    newIds = newCards(deck, progress, exclude).slice(0, settings.newPerBatch).map((c) => c.id);
  }
  return { newIds, reviewIds, notice };
}

export function startFromBatch(base: Omit<Session, "phase" | "queue" | "pos" | "revealed" | "batchNew" | "pending" | "retry">, b: Batch): Session {
  if (b.newIds.length) {
    return { ...base, phase: "preview", queue: b.newIds, pos: 0, revealed: true, batchNew: b.newIds, pending: b.reviewIds, retry: [] };
  }
  return { ...base, phase: "test", queue: shuffle(b.reviewIds), pos: 0, revealed: false, batchNew: [], pending: [], retry: [] };
}

export function deckCounts(deck: DeckData, progress: Map<string, Progress>): Record<Status, number> {
  const out: Record<Status, number> = { new: 0, learning: 0, shaky: 0, mastered: 0, leech: 0 };
  for (const c of deck.cards) out[cardStatus(progress.get(c.id))]++;
  return out;
}

/** Monday-based start of the current week, as a day key. */
export function weekStartKey(d = new Date()): string {
  const key = dayKey(d);
  const t = new Date(key + "T12:00:00");
  const dow = (t.getDay() + 6) % 7;
  t.setDate(t.getDate() - dow);
  return dayKey(new Date(t.getTime() + 6 * 3600_000));
}

export interface Pace {
  remaining: number;
  weeksLeft: number;
  perWeek: number;
  thisWeek: number;
  aheadWeeks: number; // positive = ahead of plan
  overdueTarget: boolean;
}

export function pace(
  deck: DeckData,
  progress: Map<string, Progress>,
  target: string,
  startedAt: string | null,
  plan: BreakPlan | null = null,
): Pace {
  const today = dayKey();
  const remaining = deck.cards.filter((c) => !progress.has(c.id)).length;
  const msLeft = new Date(target + "T23:59:59").getTime() - new Date(today + "T00:00:00").getTime();
  // planned days off between today and the target don't count as study time
  let offDays = 0;
  if (plan && plan.end >= today && plan.start <= target) {
    const s = plan.start > today ? plan.start : today;
    const e = plan.end < target ? plan.end : target;
    offDays = Math.max(0, daysBetween(s, e) + 1);
  }
  const weeksLeft = Math.max(0, (msLeft / 86400_000 - offDays) / 7);
  const perWeek = weeksLeft > 0 ? Math.ceil(remaining / weeksLeft) : remaining;
  const wk = weekStartKey();
  let thisWeek = 0;
  for (const c of deck.cards) {
    const p = progress.get(c.id);
    if (p && p.firstSeen >= wk) thisWeek++;
  }
  // plan: linear from start date (or today) to target
  let aheadWeeks = 0;
  if (startedAt) {
    const total = deck.cards.length;
    const span = new Date(target + "T23:59:59").getTime() - new Date(startedAt + "T00:00:00").getTime();
    const elapsed = new Date(today + "T23:59:59").getTime() - new Date(startedAt + "T00:00:00").getTime();
    const plannedDone = span > 0 ? Math.min(total, (total * elapsed) / span) : total;
    const done = total - remaining;
    const perWeekPlan = span > 0 ? (total / span) * 7 * 86400_000 : total;
    aheadWeeks = perWeekPlan > 0 ? (done - plannedDone) / perWeekPlan : 0;
  }
  return { remaining, weeksLeft, perWeek, thisWeek, aheadWeeks, overdueTarget: msLeft < 0 && remaining > 0 };
}
