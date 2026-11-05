import { openDB, type IDBPDatabase } from "idb";
import type { DayReport, DeckState, Progress, Session, Settings } from "./types";

const DB_NAME = "kanji-app";
let dbp: Promise<IDBPDatabase> | null = null;

function db() {
  if (!dbp) {
    dbp = openDB(DB_NAME, 1, {
      upgrade(d) {
        d.createObjectStore("progress", { keyPath: "id" });
        d.createObjectStore("meta");
        d.createObjectStore("reports", { keyPath: "day" });
      },
    });
  }
  return dbp;
}

export const DEFAULT_SETTINGS: Settings = {
  newPerBatch: 10,
  reviewPerBatch: 20,
  reviewCap: 100,
  backlogStop: 60,
};

export const DEFAULT_TARGETS: Record<string, string> = {
  n5: "2026-12-10",
  n4: "2027-01-31",
  n3: "2027-05-31",
};

export async function allProgress(): Promise<Progress[]> {
  return (await db()).getAll("progress");
}

export async function putProgress(p: Progress) {
  await (await db()).put("progress", p);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db()).get("meta", key);
}

export async function setMeta(key: string, value: unknown) {
  await (await db()).put("meta", value, key);
}

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await getMeta<Settings>("settings")) ?? {}) };
}

export async function getDeckStates(ids: string[]): Promise<Record<string, DeckState>> {
  const saved = (await getMeta<Record<string, DeckState>>("decks")) ?? {};
  const out: Record<string, DeckState> = {};
  for (const id of ids) {
    out[id] = saved[id] ?? { id, startedAt: null, graduatedAt: null, target: DEFAULT_TARGETS[id] ?? "2027-05-31" };
  }
  return out;
}

export async function saveDeckStates(states: Record<string, DeckState>) {
  await setMeta("decks", states);
}

export async function getSession(): Promise<Session | undefined> {
  return getMeta<Session>("session");
}

export async function saveSession(s: Session | null) {
  await setMeta("session", s);
}

export async function getReport(day: string): Promise<DayReport | undefined> {
  return (await db()).get("reports", day);
}

export async function allReports(): Promise<DayReport[]> {
  return (await db()).getAll("reports");
}

export async function putReport(r: DayReport) {
  await (await db()).put("reports", r);
}

// ---------------------------------------------------------------- backup

export async function exportAll(): Promise<string> {
  const d = await db();
  const meta: Record<string, unknown> = {};
  for (const key of await d.getAllKeys("meta")) meta[String(key)] = await d.get("meta", key);
  return JSON.stringify({
    app: "kanji-app",
    version: 1,
    exportedAt: new Date().toISOString(),
    progress: await d.getAll("progress"),
    reports: await d.getAll("reports"),
    meta,
  });
}

function reviveDates(p: Progress): Progress {
  const f = p.fsrs as unknown as Record<string, unknown>;
  f.due = new Date(f.due as string);
  if (f.last_review) f.last_review = new Date(f.last_review as string);
  return p;
}

export async function importAll(json: string) {
  const data = JSON.parse(json);
  if (data.app !== "kanji-app" || !Array.isArray(data.progress)) throw new Error("백업 파일 형식이 아니에요.");
  const d = await db();
  const tx = d.transaction(["progress", "meta", "reports"], "readwrite");
  await tx.objectStore("progress").clear();
  await tx.objectStore("meta").clear();
  await tx.objectStore("reports").clear();
  for (const p of data.progress) await tx.objectStore("progress").put(reviveDates(p));
  for (const r of data.reports ?? []) await tx.objectStore("reports").put(r);
  for (const [k, v] of Object.entries(data.meta ?? {})) await tx.objectStore("meta").put(v, k);
  await tx.done;
}
