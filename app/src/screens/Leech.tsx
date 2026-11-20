import { useMemo, useState } from "react";
import type { AppData } from "../App";
import { cardIndex, cardsWithKanji, kanjiRecentWrong, kanjiRecovered, kanjiTable, RECENT_DAYS } from "../insights";
import type { PracticeSpec } from "./Practice";

interface Props {
  data: AppData;
  onBack: () => void;
  onOpenCard: (id: string) => void;
  onOpenKanji: (k: string) => void;
  onDrill: (spec: PracticeSpec) => void;
}

// You press 모름 only for real blanks, so a few recent ones already mean a hole.
const KANJI_WRONG = 4;

export function Leech({ data, onBack, onOpenCard, onOpenKanji, onDrill }: Props) {
  const [tab, setTab] = useState<"cards" | "kanji">("cards");
  const [filter, setFilter] = useState<"all" | "manual" | "auto">("all");
  const index = useMemo(() => cardIndex(data.decks), [data.decks]);
  const table = useMemo(() => kanjiTable(data.decks), [data.decks]);

  const cards = useMemo(
    () =>
      [...data.progress.values()]
        .filter((p) => (p.leechManual || p.leechAuto) && index.has(p.id))
        .sort((a, b) => Number(b.leechManual) - Number(a.leechManual) || b.wrongTotal - a.wrongTotal),
    [data.progress, index],
  );
  const shown = cards.filter((p) => filter === "all" || (filter === "manual" ? p.leechManual : !p.leechManual));

  // kanji that are the real hole: a leech word, or several recent misses across its words.
  // Old misses age out after 30 days, and a kanji whose words are all back on a 앎 streak drops out.
  const kanji = useMemo(() => {
    const out: { k: string; wrong: number; leechWords: number }[] = [];
    for (const k of table.keys()) {
      const refs = cardsWithKanji(data.decks, k);
      const leechWords = refs.filter((r) => {
        const p = data.progress.get(r.card.id);
        return p && (p.leechManual || p.leechAuto);
      }).length;
      const wrong = kanjiRecentWrong(k, data.decks, data.progress);
      if (leechWords > 0 || (wrong >= KANJI_WRONG && !kanjiRecovered(k, data.decks, data.progress))) {
        out.push({ k, wrong, leechWords });
      }
    }
    return out.sort((a, b) => b.leechWords - a.leechWords || b.wrong - a.wrong);
  }, [table, data.decks, data.progress]);

  return (
    <div className="screen">
      <header className="top">
        <button className="text-btn" onClick={onBack}>
          ← 홈
        </button>
        <h1>집중공략</h1>
        <span className="muted">
          수동 {cards.filter((p) => p.leechManual).length} · 자동 {cards.filter((p) => !p.leechManual).length}
        </span>
      </header>
      <div className="seg-tabs">
        <button className={tab === "cards" ? "on" : ""} onClick={() => setTab("cards")}>
          단어 {cards.length}
        </button>
        <button className={tab === "kanji" ? "on" : ""} onClick={() => setTab("kanji")}>
          구멍 난 한자 {kanji.length}
        </button>
      </div>

      {tab === "cards" ? (
        <>
          <div className="chips">
            {(["all", "manual", "auto"] as const).map((f) => (
              <button key={f} className={filter === f ? "chip on" : "chip"} onClick={() => setFilter(f)}>
                {f === "all" ? "전체" : f === "manual" ? "내가 지정" : "자동"}
              </button>
            ))}
          </div>
          {!shown.length ? (
            <div className="center-msg">
              아직 없어요. 누적 오답 6회가 되면 자동으로 들어오고, 카드에서 🎯를 누르면 직접 넣을 수 있어요.
            </div>
          ) : (
            <ul className="report-list">
              {shown.map((p) => {
                const r = index.get(p.id)!;
                return (
                  <li key={p.id} onClick={() => onOpenCard(p.id)}>
                    <span className="rw">{r.card.w}</span>
                    <span className="rr">{r.card.r}</span>
                    <span className={`badge ${p.leechManual ? "st-leech" : ""}`}>{p.leechManual ? "내가 지정" : "자동"}</span>
                    <span className="flow muted">
                      오답 {p.wrongTotal}회 · {r.card.m}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {shown.length > 0 && (
            <button className="primary wide" onClick={() => onDrill({ title: "집중공략", ids: shown.map((p) => p.id), mode: "drill" })}>
              집중공략만 돌리기 ({shown.length}장)
            </button>
          )}
        </>
      ) : (
        <>
          <p className="muted">
            안 외워지는 단어가 있거나, 최근 {RECENT_DAYS}일 동안 그 한자가 들어간 단어들에서 합쳐 {KANJI_WRONG}번 이상 「모름」이 나온
            한자예요. 오래된 오답은 30일이 지나면 빠지고, 그 한자 단어들을 연속으로 맞히면 목록에서 사라져요.
          </p>
          {!kanji.length ? (
            <div className="center-msg">구멍 난 한자가 아직 없어요.</div>
          ) : (
            <div className="kanji-hits">
              {kanji.map(({ k, wrong, leechWords }) => (
                <button key={k} className="kanji-hit" onClick={() => onOpenKanji(k)}>
                  <span className="kh-char">{k}</span>
                  <span className="kh-info">
                    <b>{table.get(k)?.hun}</b>
                    <span className="muted">
                      최근 모름 {wrong}회{leechWords ? ` · 안 외워지는 단어 ${leechWords}` : ""}
                      {data.memos[k] ? " · 메모 있음" : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
