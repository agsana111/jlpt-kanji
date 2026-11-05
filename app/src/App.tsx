import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as db from "./db";
import { applyFirstEval, dayKey, newProgress, pullToTomorrow } from "./srs";
import { buildBatch, shuffle, startFromBatch } from "./session";
import type { DayReport, DeckData, DeckIndexEntry, DeckState, Grade3, Progress, Session, Settings } from "./types";
import { Home } from "./screens/Home";
import { Study } from "./screens/Study";
import { ReportView } from "./screens/Report";
import { SettingsView } from "./screens/Settings";
import { CardModal } from "./screens/CardModal";
import { KanjiModal } from "./screens/KanjiModal";
import { Search } from "./screens/Search";
import { KanjiTable } from "./screens/KanjiTable";
import { FreeTest } from "./screens/FreeTest";
import { Leech } from "./screens/Leech";
import { Practice, type PracticeSpec } from "./screens/Practice";
import { UpdateBanner } from "./components/UpdateBanner";
import { breakState } from "./insights";
import type { BreakPlan } from "./types";

export type Screen = "home" | "study" | "report" | "settings" | "search" | "freetest" | "leech" | "kanji" | "practice";

export interface AppData {
  index: DeckIndexEntry[];
  decks: Record<string, DeckData>;
  progress: Map<string, Progress>;
  deckStates: Record<string, DeckState>;
  settings: Settings;
  lastBackup: string | null;
  memos: Record<string, string>;
  breakPlan: BreakPlan | null;
}

type Modal = { type: "card"; id: string } | { type: "kanji"; k: string };

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [reportDay, setReportDay] = useState<string>(dayKey());
  const [modals, setModals] = useState<Modal[]>([]);
  const [practice, setPractice] = useState<PracticeSpec | null>(null);
  const [practiceFrom, setPracticeFrom] = useState<Screen>("home");
  const [toast, setToast] = useState<string | null>(null);

  // modals stack, so card -> kanji -> card can be walked back with ✕
  const openCard = useCallback((id: string) => setModals((m) => [...m, { type: "card" as const, id }].slice(-6)), []);
  const openKanji = useCallback((k: string) => setModals((m) => [...m, { type: "kanji" as const, k }].slice(-6)), []);
  const closeModal = useCallback(() => setModals((m) => m.slice(0, -1)), []);

  // ------------------------------------------------------------ load
  useEffect(() => {
    (async () => {
      try {
        navigator.storage?.persist?.().catch(() => {});
        const index: DeckIndexEntry[] = await fetch("data/decks.json").then((r) => r.json());
        const decks: Record<string, DeckData> = {};
        for (const d of index.filter((d) => d.ready)) {
          decks[d.id] = await fetch(`data/${d.id}.json`).then((r) => r.json());
        }
        const progress = new Map((await db.allProgress()).map((p) => [p.id, p]));
        const deckStates = await db.getDeckStates(index.map((d) => d.id));
        const settings = await db.getSettings();
        const lastBackup = (await db.getMeta<string>("lastBackup")) ?? null;
        const memos = (await db.getMeta<Record<string, string>>("memos")) ?? {};
        const breakPlan = (await db.getMeta<BreakPlan | null>("breakPlan")) ?? null;
        setData({ index, decks, progress, deckStates, settings, lastBackup, memos, breakPlan });
        const s = await db.getSession();
        if (s && s.day === dayKey() && s.phase !== "report") {
          sessionRef.current = s;
          setSession(s);
        } else if (s) await db.saveSession(null);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Refs hold the latest state so quick taps never act on a stale session.
  const sessionRef = useRef<Session | null>(null);
  const dataRef = useRef<AppData | null>(null);
  dataRef.current = data;

  const persistSession = useCallback(async (s: Session | null) => {
    sessionRef.current = s;
    setSession(s);
    await db.saveSession(s);
  }, []);

  const updateProgress = useCallback(async (p: Progress) => {
    await db.putProgress(p);
    setData((d) => {
      if (!d) return d;
      const progress = new Map(d.progress);
      progress.set(p.id, p);
      return { ...d, progress };
    });
  }, []);

  // report writes are read-modify-write on one record, so run them one at a time
  const reportQueue = useRef<Promise<void>>(Promise.resolve());
  const logReport = useCallback((id: string, deck: string, grade: number) => {
    reportQueue.current = reportQueue.current.then(async () => {
      const day = dayKey();
      const r: DayReport = (await db.getReport(day)) ?? { day, entries: {} };
      const e = r.entries[id] ?? { deck, grades: [] };
      e.grades.push(grade);
      r.entries[id] = e;
      await db.putReport(r);
    });
    return reportQueue.current;
  }, []);

  // ------------------------------------------------------------ session actions
  const start = useCallback(
    async (deckId: string, mode: "full" | "quick") => {
      if (!data) return;
      if (session && session.deck === deckId && session.day === dayKey()) {
        setScreen("study");
        return;
      }
      const deck = data.decks[deckId];
      const b = buildBatch(deck, data.progress, data.settings, mode, [], breakState(data.breakPlan));
      if (!b.newIds.length && !b.reviewIds.length) {
        setToast(b.notice ?? (mode === "quick" ? "지금 급한 복습이 없어요." : "오늘 이 덱에서 할 카드가 없어요."));
        return;
      }
      const s = startFromBatch(
        { day: dayKey(), deck: deckId, mode, seen: [], log: {}, batches: 1, notice: b.notice },
        b,
      );
      setScreen("study");
      await persistSession(s);
    },
    [data, session, persistSession],
  );

  const advance = useCallback(
    async (s: Session) => {
      // called when pos reached the end of the queue
      if (s.phase === "preview") {
        return persistSession({ ...s, phase: "test", queue: shuffle([...s.batchNew, ...s.pending]), pos: 0, revealed: false, pending: [] });
      }
      if (s.phase === "test" || s.phase === "retry") {
        if (s.mode === "quick" && s.phase === "test" && !s.retry.length) return persistSession({ ...s, phase: "report" });
        if (s.retry.length) {
          return persistSession({ ...s, phase: "retry", queue: shuffle(s.retry), retry: [], pos: 0, revealed: false });
        }
        if (s.mode === "quick") return persistSession({ ...s, phase: "report" });
        return persistSession({ ...s, phase: "batchEnd" });
      }
      if (s.phase === "final") return persistSession({ ...s, phase: "report" });
    },
    [persistSession],
  );

  const next = useCallback(async () => {
    const cur = sessionRef.current;
    if (!cur || cur.phase !== "preview") return;
    const s = { ...cur, pos: cur.pos + 1, revealed: true };
    if (s.pos >= s.queue.length) return advance(s);
    await persistSession(s);
  }, [advance, persistSession]);

  const reveal = useCallback(() => {
    const cur = sessionRef.current;
    if (cur && !cur.revealed) persistSession({ ...cur, revealed: true });
  }, [persistSession]);

  const grade = useCallback(
    async (g: Grade3) => {
      const cur = sessionRef.current;
      const d = dataRef.current;
      if (!cur || !d || !cur.revealed || !["test", "retry", "final"].includes(cur.phase)) return;
      const phase = cur.phase;
      const id = cur.queue[cur.pos];
      const deck = d.decks[cur.deck];
      const card = deck.cards.find((c) => c.id === id)!;
      const log = { ...cur.log, [id]: [...(cur.log[id] ?? []), phase === "final" ? 10 + g : g] };
      const retry = phase !== "final" && g < 3 ? [...cur.retry, id] : cur.retry;
      const seen = cur.seen.includes(id) ? cur.seen : [...cur.seen, id];

      // 1) move the screen on right away
      const s: Session = { ...cur, log, retry, seen, pos: cur.pos + 1, revealed: false };
      const saving = s.pos >= s.queue.length ? advance(s) : persistSession(s);

      // 2) then write progress and the report
      if (phase === "test") {
        const prev = d.progress.get(id) ?? newProgress(card, deck.id);
        if (!prev.history.some((h) => h.d === dayKey())) await updateProgress(applyFirstEval(prev, g));
        if (!d.deckStates[deck.id].startedAt) {
          const deckStates = { ...d.deckStates, [deck.id]: { ...d.deckStates[deck.id], startedAt: dayKey() } };
          await db.saveDeckStates(deckStates);
          setData((x) => (x ? { ...x, deckStates } : x));
        }
      } else if (phase === "final" && g === 1) {
        const p = d.progress.get(id);
        if (p) await updateProgress(pullToTomorrow(p));
      }
      await logReport(id, deck.id, phase === "final" ? 10 + g : g);
      await saving;
    },
    [updateProgress, logReport, advance, persistSession],
  );

  const nextBatch = useCallback(async () => {
    const session = sessionRef.current;
    const data = dataRef.current;
    if (!session || !data) return;
    const deck = data.decks[session.deck];
    const b = buildBatch(deck, data.progress, data.settings, "full", session.seen, breakState(data.breakPlan));
    if (!b.newIds.length && !b.reviewIds.length) {
      setToast(b.notice ?? "이 덱에서 오늘 더 할 카드가 없어요. 마무리 테스트로 가요.");
      return;
    }
    const s = startFromBatch(
      { day: session.day, deck: session.deck, mode: "full", seen: session.seen, log: session.log, batches: session.batches + 1, notice: b.notice },
      b,
    );
    await persistSession(s);
  }, [persistSession]);

  const finalTest = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || session.phase !== "batchEnd") return;
    await persistSession({ ...session, phase: "final", queue: shuffle(session.seen), pos: 0, revealed: false });
  }, [persistSession]);

  const toReport = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    await persistSession({ ...session, phase: "report" });
  }, [persistSession]);

  const closeSession = useCallback(async () => {
    setReportDay(dayKey());
    await persistSession(null);
    setScreen("report");
  }, [persistSession]);

  const setLeech = useCallback(
    async (id: string, on: boolean) => {
      const d = dataRef.current;
      if (!d) return;
      const deckId = Object.keys(d.decks).find((x) => d.decks[x].cards.some((c) => c.id === id))!;
      const card = d.decks[deckId].cards.find((c) => c.id === id)!;
      const p = d.progress.get(id) ?? newProgress(card, deckId);
      await updateProgress({ ...p, leechManual: on });
    },
    [updateProgress],
  );

  const toggleLeech = useCallback(
    async (id: string) => {
      const on = !dataRef.current?.progress.get(id)?.leechManual;
      await setLeech(id, on);
      setToast(on ? "안 외워짐 목록에 넣었어요. 직접 풀기 전까지 유지돼요." : "안 외워짐 지정을 풀었어요.");
    },
    [setLeech],
  );

  const addLeech = useCallback(
    async (ids: string[]) => {
      for (const id of ids) await setLeech(id, true);
      setToast(`${ids.length}장을 집중공략에 넣었어요.`);
    },
    [setLeech],
  );

  const saveMemo = useCallback(async (k: string, memo: string) => {
    const memos = { ...(dataRef.current?.memos ?? {}), [k]: memo.trim() };
    if (!memo.trim()) delete memos[k];
    await db.setMeta("memos", memos);
    setData((d) => (d ? { ...d, memos } : d));
    setToast("메모를 저장했어요.");
  }, []);

  const saveBreak = useCallback(async (breakPlan: BreakPlan | null) => {
    await db.setMeta("breakPlan", breakPlan);
    setData((d) => (d ? { ...d, breakPlan } : d));
    setToast(breakPlan ? "쉬는 기간을 저장했어요." : "쉬는 기간을 지웠어요.");
  }, []);

  const startPractice = useCallback(
    (spec: PracticeSpec) => {
      setPracticeFrom(screen === "practice" ? "home" : screen);
      setModals([]);
      setPractice(spec);
      setScreen("practice");
    },
    [screen],
  );

  // ------------------------------------------------------------ settings / backup
  const saveSettings = useCallback(async (settings: Settings, deckStates: Record<string, DeckState>) => {
    await db.setMeta("settings", settings);
    await db.saveDeckStates(deckStates);
    setData((d) => (d ? { ...d, settings, deckStates } : d));
    setToast("저장했어요.");
  }, []);

  const doExport = useCallback(async () => {
    const json = await db.exportAll();
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kanji-backup-${dayKey().replaceAll("-", "")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    const now = new Date().toISOString();
    await db.setMeta("lastBackup", now);
    setData((d) => (d ? { ...d, lastBackup: now } : d));
  }, []);

  const doImport = useCallback(async (file: File) => {
    try {
      await db.importAll(await file.text());
      location.reload();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "불러오기에 실패했어요.");
    }
  }, []);

  const top = modals[modals.length - 1] ?? null;
  const modalCard = useMemo(() => {
    if (!top || top.type !== "card" || !data) return null;
    for (const d of Object.values(data.decks)) {
      const c = d.cards.find((x) => x.id === top.id);
      if (c) return { card: c, deck: d };
    }
    return null;
  }, [top, data]);

  if (error) return <div className="center-msg">불러오기 실패: {error}</div>;
  if (!data) return <div className="center-msg">불러오는 중…</div>;

  return (
    <div className="app">
      <UpdateBanner />
      {screen === "home" && (
        <Home
          data={data}
          session={session}
          onStart={start}
          onNav={(s) => {
            if (s === "report") setReportDay(dayKey());
            setScreen(s);
          }}
          onBackup={doExport}
        />
      )}
      {screen === "search" && <Search data={data} onBack={() => setScreen("home")} onOpenCard={openCard} onOpenKanji={openKanji} />}
      {screen === "kanji" && <KanjiTable data={data} onBack={() => setScreen("home")} onOpenKanji={openKanji} />}
      {screen === "freetest" && <FreeTest data={data} onBack={() => setScreen("home")} onStart={startPractice} />}
      {screen === "leech" && (
        <Leech data={data} onBack={() => setScreen("home")} onOpenCard={openCard} onOpenKanji={openKanji} onDrill={startPractice} />
      )}
      {screen === "practice" && practice && (
        <Practice
          key={practice.title + practice.ids.length}
          data={data}
          spec={practice}
          onExit={() => {
            setPractice(null);
            setScreen(practiceFrom);
          }}
          onAddLeech={addLeech}
          onOpenCard={openCard}
          onOpenKanji={openKanji}
        />
      )}
      {screen === "study" && session && (
        <Study
          data={data}
          session={session}
          onReveal={reveal}
          onNext={next}
          onGrade={grade}
          onNextBatch={nextBatch}
          onFinal={finalTest}
          onToReport={toReport}
          onClose={closeSession}
          onQuit={() => setScreen("home")}
          onToggleLeech={toggleLeech}
          onOpenCard={openCard}
          onOpenKanji={openKanji}
        />
      )}
      {screen === "report" && (
        <ReportView data={data} day={reportDay} onDay={setReportDay} onBack={() => setScreen("home")} onOpenCard={openCard} />
      )}
      {screen === "settings" && (
        <SettingsView
          data={data}
          onSave={saveSettings}
          onSaveBreak={saveBreak}
          onExport={doExport}
          onImport={doImport}
          onBack={() => setScreen("home")}
        />
      )}
      {modalCard && (
        <CardModal
          card={modalCard.card}
          deck={modalCard.deck}
          data={data}
          onClose={closeModal}
          onToggleLeech={toggleLeech}
          onOpenCard={openCard}
          onOpenKanji={openKanji}
        />
      )}
      {top?.type === "kanji" && (
        <KanjiModal
          k={top.k}
          data={data}
          onClose={closeModal}
          onOpenCard={openCard}
          onOpenKanji={openKanji}
          onSaveMemo={saveMemo}
          onDrill={(ids, title) => startPractice({ ids, title, mode: "drill" })}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
