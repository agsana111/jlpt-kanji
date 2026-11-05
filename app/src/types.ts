import type { Card as FsrsCard } from "ts-fsrs";

export type Seg = [string, string | null];

export interface KanjiInfo {
  lv: number;
  on: string[];
  kun: string[];
  hun: string | null;
  en: string[];
  st: number | null;
  parts: string[];
}

export interface Example {
  ja: string;
  ruby: Seg[];
  ko: string;
  src: string;
}

export interface CardData {
  id: string;
  w: string;
  r: string;
  f: Seg[];
  k: string[];
  m: string;
  en: string[];
  ex: Example | null;
}

export interface DeckData {
  id: string;
  name: string;
  kanjiList: string[];
  kanji: Record<string, KanjiInfo>;
  cards: CardData[];
}

export interface DeckIndexEntry {
  id: string;
  name: string;
  ready: boolean;
  cards?: number;
  kanji?: number;
}

/** 1 = 모름, 2 = 애매, 3 = 앎 */
export type Grade3 = 1 | 2 | 3;

export interface Progress {
  id: string;
  deck: string;
  fsrs: FsrsCard;
  goodStreak: number;
  wrongTotal: number;
  lastGrade: Grade3;
  leechAuto: boolean;
  leechManual: boolean;
  firstSeen: string; // day key
  history: { d: string; g: Grade3 }[];
}

export interface DeckState {
  id: string;
  startedAt: string | null;
  graduatedAt: string | null;
  target: string; // YYYY-MM-DD
}

export interface Settings {
  newPerBatch: number;
  reviewPerBatch: number;
  reviewCap: number;
  backlogStop: number;
}

export type Phase = "preview" | "test" | "retry" | "batchEnd" | "final" | "report";

export interface Session {
  day: string;
  deck: string;
  mode: "full" | "quick";
  phase: Phase;
  queue: string[];
  pos: number;
  revealed: boolean;
  batchNew: string[];
  pending: string[]; // reviews waiting for the test after the preview
  retry: string[];
  seen: string[];
  log: Record<string, number[]>; // grades per card today: test, retry..., final (final stored as 10+g)
  batches: number;
  notice: string | null;
}

export interface DayReport {
  day: string;
  entries: Record<string, { deck: string; grades: number[] }>;
}

export type Status = "new" | "learning" | "shaky" | "mastered" | "leech";
