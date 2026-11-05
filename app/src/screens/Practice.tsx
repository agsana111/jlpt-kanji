import { useMemo, useState } from "react";
import type { AppData } from "../App";
import { CardBack, CardFront, StatusDot } from "../components/CardView";
import { cardIndex } from "../insights";
import { shuffle } from "../session";
import type { Grade3 } from "../types";

export interface PracticeSpec {
  title: string;
  ids: string[];
  /** test: one pass then a score; drill: repeat misses until everything is 앎 */
  mode: "test" | "drill";
}

interface Props {
  data: AppData;
  spec: PracticeSpec;
  onExit: () => void;
  onAddLeech: (ids: string[]) => void;
  onOpenCard: (id: string) => void;
  onOpenKanji: (k: string) => void;
}

const G = ["", "모름", "애매", "앎"];

/** Practice never touches the review schedule. */
export function Practice({ data, spec, onExit, onAddLeech, onOpenCard, onOpenKanji }: Props) {
  const index = useMemo(() => cardIndex(data.decks), [data.decks]);
  const [queue, setQueue] = useState(() => shuffle(spec.ids));
  const [pos, setPos] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [round, setRound] = useState(1);
  const [first, setFirst] = useState<Record<string, Grade3>>({});
  const [missed, setMissed] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [added, setAdded] = useState(false);

  const grade = (g: Grade3) => {
    if (!revealed) return;
    const id = queue[pos];
    const nextFirst = id in first ? first : { ...first, [id]: g };
    const nextMissed = g < 3 ? [...missed, id] : missed;
    setFirst(nextFirst);
    setRevealed(false);
    if (pos + 1 < queue.length) {
      setMissed(nextMissed);
      setPos(pos + 1);
      return;
    }
    if (spec.mode === "drill" && nextMissed.length) {
      setQueue(shuffle(nextMissed));
      setMissed([]);
      setPos(0);
      setRound(round + 1);
      return;
    }
    setMissed(nextMissed);
    setDone(true);
  };

  if (!spec.ids.length) {
    return (
      <div className="screen">
        <header className="top">
          <button className="text-btn" onClick={onExit}>
            ← 돌아가기
          </button>
        </header>
        <div className="center-msg">고른 범위에 카드가 없어요.</div>
      </div>
    );
  }

  if (done) {
    const ids = Object.keys(first);
    const wrong = ids.filter((id) => first[id] < 3);
    const known = ids.length - wrong.length;
    return (
      <div className="screen">
        <header className="top">
          <button className="text-btn" onClick={onExit}>
            ← 끝내기
          </button>
          <h1>{spec.title}</h1>
          <span />
        </header>
        <div className="batch-end">
          <div className="big-num">
            {known}/{ids.length}
          </div>
          <div className="muted">
            첫 시도에 앎 {Math.round((known / ids.length) * 100)}%{spec.mode === "drill" ? ` · ${round}바퀴 만에 전부 앎` : ""}
          </div>
          <p className="muted small">연습 결과는 복습 스케줄에 영향을 주지 않아요.</p>
        </div>
        {wrong.length > 0 && (
          <>
            <ul className="report-list">
              {wrong.map((id) => {
                const r = index.get(id)!;
                return (
                  <li key={id} onClick={() => onOpenCard(id)}>
                    <StatusDot p={data.progress.get(id)} />
                    <span className="rw">{r.card.w}</span>
                    <span className="rr">{r.card.r}</span>
                    <span className={`gchip g${first[id]}`}>{G[first[id]]}</span>
                    <span className="flow muted">{r.card.m}</span>
                  </li>
                );
              })}
            </ul>
            <button
              className="wide"
              disabled={added}
              onClick={() => {
                onAddLeech(wrong);
                setAdded(true);
              }}
            >
              {added ? "집중공략에 넣었어요" : `틀린 ${wrong.length}장 집중공략에 넣기`}
            </button>
          </>
        )}
        <button className="primary wide" onClick={onExit}>
          끝내기
        </button>
      </div>
    );
  }

  const ref = index.get(queue[pos])!;
  return (
    <div className="screen study">
      <header className="top">
        <button className="text-btn" onClick={onExit}>
          ← 그만하기
        </button>
        <span className="muted">
          {spec.title}
          {round > 1 ? ` · ${round}바퀴` : ""} · {pos + 1}/{queue.length}
        </span>
        <span />
      </header>
      <div className="progress-line practice">
        <div style={{ width: `${(pos / queue.length) * 100}%` }} />
      </div>
      <div className="card-area" onClick={!revealed ? () => setRevealed(true) : undefined}>
        {revealed ? (
          <CardBack card={ref.card} deck={ref.deck} progress={data.progress} onOpenCard={onOpenCard} onOpenKanji={onOpenKanji} />
        ) : (
          <CardFront card={ref.card} />
        )}
      </div>
      <div className="actions">
        {!revealed ? (
          <button className="wide" onClick={() => setRevealed(true)}>
            탭해서 정답 보기
          </button>
        ) : (
          <div className="grade3">
            <button className="g1" onClick={() => grade(1)}>
              모름
            </button>
            <button className="g2" onClick={() => grade(2)}>
              애매
            </button>
            <button className="g3" onClick={() => grade(3)}>
              앎
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
