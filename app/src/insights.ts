import { createEmptyCard, fsrs, generatorParameters, Rating } from "ts-fsrs";
import { cardStatus, dayKey, endOfDay } from "./srs";
import type { BreakPlan, CardData, DeckData, KanjiInfo, Progress, Status } from "./types";

// ---------------------------------------------------------------- lookups across decks

export interface CardRef {
  card: CardData;
  deck: DeckData;
}

export function cardIndex(decks: Record<string, DeckData>): Map<string, CardRef> {
  const m = new Map<string, CardRef>();
  for (const deck of Object.values(decks)) for (const card of deck.cards) m.set(card.id, { card, deck });
  return m;
}

/** Every kanji the app knows about, with the deck that teaches it (its JLPT level). */
export function kanjiTable(decks: Record<string, DeckData>): Map<string, KanjiInfo> {
  const m = new Map<string, KanjiInfo>();
  for (const deck of Object.values(decks)) {
    for (const [k, info] of Object.entries(deck.kanji)) {
      const prev = m.get(k);
      if (!prev || (!prev.hun && info.hun)) m.set(k, info);
    }
  }
  return m;
}

export function cardsWithKanji(decks: Record<string, DeckData>, k: string): CardRef[] {
  const out: CardRef[] = [];
  for (const deck of Object.values(decks)) for (const card of deck.cards) if (card.k.includes(k)) out.push({ card, deck });
  return out;
}

// ---------------------------------------------------------------- kanji status

/** A kanji's status is derived from every word card that contains it. */
/** Level badge of a kanji: N5-N2, or 실전 for kanji only the practical deck teaches (lv 0/1). */
export function lvLabel(lv: number): string {
  return lv >= 2 ? `N${lv}` : "실전";
}

export function kanjiStatus(k: string, decks: Record<string, DeckData>, progress: Map<string, Progress>): Status {
  const sts = cardsWithKanji(decks, k).map((r) => cardStatus(progress.get(r.card.id)));
  if (!sts.length) return "new";
  if (sts.includes("leech")) return "leech";
  if (sts.every((s) => s === "mastered")) return "mastered";
  if (sts.every((s) => s === "new")) return "new";
  if (sts.includes("shaky")) return "shaky";
  return "learning";
}

/** Kanji that keep tripping you up: total wrong answers across its words (all time). */
export function kanjiWrongTotal(k: string, decks: Record<string, DeckData>, progress: Map<string, Progress>): number {
  return cardsWithKanji(decks, k).reduce((n, r) => n + (progress.get(r.card.id)?.wrongTotal ?? 0), 0);
}

export const RECENT_DAYS = 30;

/** 모름 answers (day's first evaluation) across the kanji's words in the last 30 days. */
export function kanjiRecentWrong(k: string, decks: Record<string, DeckData>, progress: Map<string, Progress>): number {
  const since = new Date(Date.now() - RECENT_DAYS * 86400_000).toISOString().slice(0, 10);
  let n = 0;
  for (const r of cardsWithKanji(decks, k)) {
    for (const h of progress.get(r.card.id)?.history ?? []) if (h.g === 1 && h.d >= since) n++;
  }
  return n;
}

/** Every studied word with this kanji is currently on a 앎 streak (≥2) -> the hole is closed. */
export function kanjiRecovered(k: string, decks: Record<string, DeckData>, progress: Map<string, Progress>): boolean {
  const ps = cardsWithKanji(decks, k)
    .map((r) => progress.get(r.card.id))
    .filter((p): p is Progress => !!p);
  return ps.length > 0 && ps.every((p) => p.goodStreak >= 2 && !p.leechManual && !p.leechAuto);
}

// ---------------------------------------------------------------- look-alike kanji

/** Kanji sharing most of their components (KRADFILE parts), e.g. 待・持・特. */
export function similarKanji(k: string, table: Map<string, KanjiInfo>, limit = 5): string[] {
  const me = table.get(k);
  if (!me || me.parts.length < 2) return [];
  const mine = new Set(me.parts);
  const scored: [string, number][] = [];
  for (const [other, info] of table) {
    if (other === k || info.parts.length < 2) continue;
    const shared = info.parts.filter((p) => mine.has(p)).length;
    if (shared < 2) continue;
    const score = shared / Math.max(mine.size, info.parts.length);
    const strokeGap = Math.abs((info.st ?? 0) - (me.st ?? 0));
    if (score >= 0.5 && strokeGap <= 4) scored.push([other, score - strokeGap * 0.02]);
  }
  return scored
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([o]) => o);
}

// ---------------------------------------------------------------- review forecast

const sim = fsrs(generatorParameters({ enable_fuzz: false, enable_short_term: false, request_retention: 0.9 }));
const FAIL_RATE = 0.2;

/** Expected reviews per day (index 0 = today) caused by learning ONE new card today. */
const NEW_CARD_LOAD: number[] = (() => {
  const days = 8;
  const load = new Array(days).fill(0);
  let card = createEmptyCard(new Date(2026, 0, 1, 12));
  let t = new Date(2026, 0, 1, 12);
  card = sim.next(card, t, Rating.Good).card;
  card = { ...card, due: new Date(2026, 0, 2, 12), scheduled_days: 1 }; // new cards always return the next day
  for (let i = 0; i < 6; i++) {
    const offset = Math.round((card.due.getTime() - new Date(2026, 0, 1, 12).getTime()) / 86400_000);
    if (offset >= days) break;
    load[offset] += 1 - FAIL_RATE;
    t = card.due;
    card = sim.next(card, t, Rating.Good).card;
  }
  load[1] += FAIL_RATE; // day-1 review happens either way
  load[2] += FAIL_RATE; // forgotten on day 1 -> back on day 2
  return load;
})();

export interface Forecast {
  existing: number[]; // reviews already scheduled for the next 7 days (0 = today, overdue included)
  perNewCard: number[];
}

export function forecast(progress: Map<string, Progress>, activeDecks: Set<string>, days = 7): Forecast {
  const existing = new Array(days).fill(0);
  const today0 = endOfDay().getTime() - 86400_000;
  const todayKey = dayKey();
  for (const p of progress.values()) {
    if (!activeDecks.has(p.deck)) continue;
    const off = Math.floor((p.fsrs.due.getTime() - today0) / 86400_000);
    if (off >= days) continue;
    if (off <= 0 && p.history.some((h) => h.d === todayKey)) continue; // already reviewed today
    existing[Math.max(0, off)] += 1;
  }
  return { existing, perNewCard: NEW_CARD_LOAD.slice(0, days) };
}

/** Extra reviews over the next week if `n` new cards are learned today. */
export function extraLoad(f: Forecast, n: number) {
  const add = f.perNewCard.map((x) => x * n);
  const tomorrow = Math.round(add[1] ?? 0);
  const weekAvg = Math.round(add.slice(1).reduce((a, b) => a + b, 0) / Math.max(1, add.length - 1));
  return { tomorrow, weekAvg, add };
}

// ---------------------------------------------------------------- break periods

export type BreakPhase = "none" | "pre" | "during" | "after";

export interface BreakState {
  phase: BreakPhase;
  plan: BreakPlan | null;
}

const PRE_DAYS = 3;
const AFTER_DAYS = 7;

function addDays(key: string, n: number): string {
  const d = new Date(key + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function breakState(plan: BreakPlan | null, today = dayKey()): BreakState {
  if (!plan) return { phase: "none", plan };
  if (today >= addDays(plan.start, -PRE_DAYS) && today < plan.start) return { phase: "pre", plan };
  if (today >= plan.start && today <= plan.end) return { phase: "during", plan };
  if (today > plan.end && today <= addDays(plan.end, AFTER_DAYS)) return { phase: "after", plan };
  return { phase: "none", plan };
}

/** End of the break as a Date (cards due before this are pulled forward before a break). */
export function breakEndDate(plan: BreakPlan): Date {
  return new Date(addDays(plan.end, 1) + "T04:00:00");
}

/** Cards first learned in the two weeks before the break are the most fragile afterwards. */
export function learnedJustBefore(p: Progress, plan: BreakPlan): boolean {
  return p.firstSeen >= addDays(plan.start, -14) && p.firstSeen <= plan.end;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 86400_000);
}

export const STATUS_ORDER: Status[] = ["mastered", "shaky", "learning", "leech", "new"];
