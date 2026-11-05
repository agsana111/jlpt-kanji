import { useMemo, useState } from "react";
import type { AppData } from "../App";
import { STATUS_ORDER } from "../insights";
import { shuffle } from "../session";
import { cardStatus, STATUS_LABEL } from "../srs";
import type { Status } from "../types";
import type { PracticeSpec } from "./Practice";

interface Props {
  data: AppData;
  onBack: () => void;
  onStart: (spec: PracticeSpec) => void;
}

const COUNTS = [10, 20, 30, 50, 0];

export function FreeTest({ data, onBack, onStart }: Props) {
  const ready = data.index.filter((d) => data.decks[d.id]);
  const started = ready.filter((d) => data.deckStates[d.id].startedAt).map((d) => d.id);
  const [decks, setDecks] = useState<string[]>(started.length ? started : ready.slice(0, 1).map((d) => d.id));
  const [statuses, setStatuses] = useState<Status[]>(data.progress.size ? ["shaky", "learning", "leech"] : ["new"]);
  const [count, setCount] = useState(20);
  const [mode, setMode] = useState<"test" | "drill">("test");

  const pool = useMemo(() => {
    const out: string[] = [];
    for (const id of decks) {
      for (const c of data.decks[id].cards) if (statuses.includes(cardStatus(data.progress.get(c.id)))) out.push(c.id);
    }
    return out;
  }, [decks, statuses, data]);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="screen">
      <header className="top">
        <button className="text-btn" onClick={onBack}>
          ← 홈
        </button>
        <h1>자유 테스트</h1>
        <span />
      </header>
      <p className="muted">범위를 골라서 따로 테스트해요. 결과는 복습 스케줄에 영향을 주지 않아요.</p>

      <section className="panel">
        <h2>덱</h2>
        <div className="chips">
          {ready.map((d) => (
            <button key={d.id} className={decks.includes(d.id) ? "chip on" : "chip"} onClick={() => setDecks(toggle(decks, d.id))}>
              {d.name}
            </button>
          ))}
        </div>
        <h2>상태</h2>
        <div className="chips">
          {STATUS_ORDER.map((s) => (
            <button key={s} className={statuses.includes(s) ? "chip on" : "chip"} onClick={() => setStatuses(toggle(statuses, s))}>
              <span className={`dot st-${s}`} />
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <h2>장 수</h2>
        <div className="chips">
          {COUNTS.map((n) => (
            <button key={n} className={count === n ? "chip on" : "chip"} onClick={() => setCount(n)}>
              {n === 0 ? "전부" : `${n}장`}
            </button>
          ))}
        </div>
        <h2>방식</h2>
        <div className="chips">
          <button className={mode === "test" ? "chip on" : "chip"} onClick={() => setMode("test")}>
            한 번 쭉 보고 점수
          </button>
          <button className={mode === "drill" ? "chip on" : "chip"} onClick={() => setMode("drill")}>
            틀린 건 앎 될 때까지
          </button>
        </div>
      </section>

      <button
        className="primary wide"
        disabled={!pool.length}
        onClick={() =>
          onStart({
            title: "자유 테스트",
            ids: shuffle(pool).slice(0, count === 0 ? pool.length : count),
            mode,
          })
        }
      >
        {pool.length ? `시작 (${count === 0 ? pool.length : Math.min(count, pool.length)}장 / 범위 ${pool.length}장)` : "범위에 카드가 없어요"}
      </button>
    </div>
  );
}
