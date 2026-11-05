import { useEffect } from "react";
import type { AppData } from "../App";
import { CardBack, CardFront } from "../components/CardView";
import { previewIntervals } from "../srs";
import type { Grade3, Session } from "../types";
import { newCards, dueCards } from "../session";

const PHASE_LABEL: Record<string, string> = {
  preview: "① 미리 보기",
  test: "② 테스트",
  retry: "③ 오답 반복",
  final: "④ 마무리 테스트",
};

interface Props {
  data: AppData;
  session: Session;
  onReveal: () => void;
  onNext: () => void;
  onGrade: (g: Grade3) => void;
  onNextBatch: () => void;
  onFinal: () => void;
  onToReport: () => void;
  onClose: () => void;
  onQuit: () => void;
  onToggleLeech: (id: string) => void;
  onOpenCard: (id: string) => void;
}

function days(n: number) {
  if (n <= 0) return "오늘";
  if (n < 30) return `${n}일`;
  if (n < 365) return `${Math.round(n / 30)}달`;
  return "1년";
}

export function Study(p: Props) {
  const { data, session: s } = p;
  const deck = data.decks[s.deck];

  useEffect(() => {
    if (s.phase === "report") p.onClose();
  }, [s.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (s.phase === "report") return null;

  if (s.phase === "batchEnd") {
    const seenSet = new Set(s.seen);
    const moreNew = newCards(deck, data.progress, seenSet).length;
    const moreDue = dueCards(deck, data.progress, seenSet).length;
    const wrongFirst = s.seen.filter((id) => (s.log[id] ?? [])[0] < 3).length;
    return (
      <div className="screen">
        <header className="top">
          <button className="text-btn" onClick={p.onQuit}>
            ← 홈
          </button>
          <span className="muted">{s.batches}번째 묶음 끝</span>
        </header>
        <div className="batch-end">
          <div className="big-num">{s.seen.length}</div>
          <div className="muted">오늘 본 카드 · 처음에 틀린 것 {wrongFirst}장</div>
          <p>
            남은 신규 {moreNew}장 · 남은 복습 {moreDue}장
          </p>
          {s.notice && <p className="warn">{s.notice}</p>}
          <div className="stack">
            <button className="primary" onClick={p.onFinal}>
              마무리 테스트 ({s.seen.length}장)
            </button>
            {(moreNew > 0 || moreDue > 0) && <button onClick={p.onNextBatch}>다음 묶음 하기</button>}
            <button className="text-btn" onClick={p.onToReport}>
              마무리 없이 끝내기
            </button>
          </div>
        </div>
      </div>
    );
  }

  const id = s.queue[s.pos];
  const card = deck.cards.find((c) => c.id === id)!;
  const prog = data.progress.get(id);
  const showBack = s.phase === "preview" || s.revealed;
  const iv = s.phase === "test" && showBack ? previewIntervals(prog, card, deck.id) : null;
  const leech = !!prog?.leechManual;

  return (
    <div className="screen study">
      <header className="top">
        <button className="text-btn" onClick={p.onQuit}>
          ← 여기서 끝내기
        </button>
        <span className="muted">
          {PHASE_LABEL[s.phase]} · {s.pos + 1}/{s.queue.length}
        </span>
        <button
          className={`icon-btn ${leech ? "on" : ""}`}
          aria-label="안 외워짐 지정"
          title="안 외워짐 지정"
          onClick={() => p.onToggleLeech(id)}
        >
          🎯
        </button>
      </header>
      <div className="progress-line">
        <div style={{ width: `${(s.pos / s.queue.length) * 100}%` }} />
      </div>
      {s.notice && s.pos === 0 && <div className="banner small">{s.notice}</div>}

      <div className="card-area" onClick={!showBack ? p.onReveal : undefined}>
        {showBack ? <CardBack card={card} deck={deck} progress={data.progress} onOpenCard={p.onOpenCard} /> : <CardFront card={card} />}
      </div>

      <div className="actions">
        {s.phase === "preview" ? (
          <button className="primary wide" onClick={p.onNext}>
            다음 {s.pos + 1 === s.queue.length ? "→ 테스트 시작" : ""}
          </button>
        ) : !showBack ? (
          <button className="wide" onClick={p.onReveal}>
            탭해서 정답 보기
          </button>
        ) : (
          <>
            <div className="rule">읽기가 한 글자라도 다르면(장음·탁음·촉음) 애매</div>
            <div className="grade3">
              <button className="g1" onClick={() => p.onGrade(1)}>
                모름{iv && <small>{days(iv[1])}</small>}
              </button>
              <button className="g2" onClick={() => p.onGrade(2)}>
                애매{iv && <small>{days(iv[2])}</small>}
              </button>
              <button className="g3" onClick={() => p.onGrade(3)}>
                앎{iv && <small>{days(iv[3])}</small>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
