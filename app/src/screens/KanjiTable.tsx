import { useMemo, useState } from "react";
import type { AppData } from "../App";
import { kanjiStatus, STATUS_ORDER } from "../insights";
import { STATUS_LABEL } from "../srs";
import type { Status } from "../types";

interface Props {
  data: AppData;
  onBack: () => void;
  onOpenKanji: (k: string) => void;
}

export function KanjiTable({ data, onBack, onOpenKanji }: Props) {
  const ready = data.index.filter((d) => data.decks[d.id]);
  const [deckId, setDeckId] = useState(ready[0]?.id ?? "n5");
  const [filter, setFilter] = useState<Status | "all">("all");
  const deck = data.decks[deckId];

  const rows = useMemo(
    () => deck.kanjiList.map((k) => ({ k, st: kanjiStatus(k, data.decks, data.progress), info: deck.kanji[k] })),
    [deck, data.decks, data.progress],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.st] = (c[r.st] ?? 0) + 1;
    return c;
  }, [rows]);
  const shown = filter === "all" ? rows : rows.filter((r) => r.st === filter);

  return (
    <div className="screen">
      <header className="top">
        <button className="text-btn" onClick={onBack}>
          ← 홈
        </button>
        <h1>한자표</h1>
        <span />
      </header>
      <div className="seg-tabs">
        {ready.map((d) => (
          <button key={d.id} className={d.id === deckId ? "on" : ""} onClick={() => setDeckId(d.id)}>
            {d.name}
          </button>
        ))}
      </div>
      <p className="muted">한자 상태는 그 한자가 들어간 단어 카드들의 결과로 정해져요. 탭하면 자세히 볼 수 있어요.</p>
      <div className="chips">
        <button className={filter === "all" ? "chip on" : "chip"} onClick={() => setFilter("all")}>
          전체 {rows.length}
        </button>
        {STATUS_ORDER.map((s) => (
          <button key={s} className={filter === s ? "chip on" : "chip"} onClick={() => setFilter(s)}>
            <span className={`dot st-${s}`} />
            {STATUS_LABEL[s]} {counts[s] ?? 0}
          </button>
        ))}
      </div>
      <div className="kanji-grid">
        {shown.map(({ k, st, info }) => (
          <button key={k} className={`kg-cell kg-${st}`} onClick={() => onOpenKanji(k)} title={info?.hun ?? ""}>
            <span className="kg-char">{k}</span>
            <span className="kg-hun">{info?.hun?.split(" ").slice(-1)[0] ?? ""}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
