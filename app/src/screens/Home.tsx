import type { AppData } from "../App";
import { deckCounts, dueCards, pace, reviewsDoneToday } from "../session";
import { dayKey, STATUS_LABEL } from "../srs";
import type { Session, Status } from "../types";

const ORDER: Status[] = ["mastered", "shaky", "learning", "leech", "new"];
const EXAM = "2027-07-04";

interface Props {
  data: AppData;
  session: Session | null;
  onStart: (deck: string, mode: "full" | "quick") => void;
  onReport: () => void;
  onSettings: () => void;
  onBackup: () => void;
}

export function Home({ data, session, onStart, onReport, onSettings, onBackup }: Props) {
  const today = dayKey();
  const dDay = Math.ceil((new Date(EXAM + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86400_000);
  const needBackup =
    data.progress.size > 0 && (!data.lastBackup || Date.now() - new Date(data.lastBackup).getTime() > 7 * 86400_000);
  const doneToday = reviewsDoneToday(data.progress);

  return (
    <div className="screen">
      <header className="top">
        <h1>JLPT 한자</h1>
        <div className="top-right">
          <span className="dday">시험 D-{dDay}</span>
          <button className="icon-btn" aria-label="설정" onClick={onSettings}>
            ⚙️
          </button>
        </div>
      </header>

      {needBackup && (
        <div className="banner">
          <span>{data.lastBackup ? "마지막 백업 후 1주일이 지났어요." : "아직 백업한 적이 없어요."}</span>
          <button onClick={onBackup}>지금 백업</button>
        </div>
      )}

      {data.index.map((entry) => {
        const deck = data.decks[entry.id];
        if (!deck) {
          return (
            <section key={entry.id} className="deck deck-off">
              <div className="deck-head">
                <h2>{entry.name}</h2>
                <span className="badge">준비 중</span>
              </div>
            </section>
          );
        }
        const st = data.deckStates[entry.id];
        const counts = deckCounts(deck, data.progress);
        const due = dueCards(deck, data.progress).length;
        const pc = pace(deck, data.progress, st.target, st.startedAt);
        const total = deck.cards.length;
        const resumable = session && session.deck === entry.id && session.day === today;
        return (
          <section key={entry.id} className="deck">
            <div className="deck-head">
              <h2>{entry.name}</h2>
              <span className={`badge ${st.startedAt ? "on" : ""}`}>{st.startedAt ? "진행 중" : "미시작"}</span>
            </div>
            <div className="deck-sub">
              한자 {deck.kanjiList.length}자 · 카드 {total}장
            </div>

            <div className="bar" aria-hidden="true">
              {ORDER.map((s) => (counts[s] ? <div key={s} className={`seg st-${s}`} style={{ width: `${(counts[s] / total) * 100}%` }} /> : null))}
            </div>
            <div className="legend">
              {ORDER.map((s) => (
                <span key={s}>
                  <span className={`dot st-${s}`} />
                  {STATUS_LABEL[s]} {counts[s]}
                </span>
              ))}
            </div>

            {st.startedAt && (
              <div className="today-row">
                <div>
                  <div className="num">{due}</div>
                  <div className="lbl">복습 대기</div>
                </div>
                <div>
                  <div className="num">{pc.remaining}</div>
                  <div className="lbl">남은 신규</div>
                </div>
                <div>
                  <div className="num">{pc.thisWeek}</div>
                  <div className="lbl">이번 주 신규</div>
                </div>
              </div>
            )}

            <div className="pace">
              {pc.remaining === 0 ? (
                <span>신규 카드 전부 시작했어요. 이제 복습만 하면 돼요.</span>
              ) : pc.overdueTarget ? (
                <span className="warn">목표일({st.target})이 지났어요. 남은 {pc.remaining}장.</span>
              ) : (
                <span>
                  목표 {st.target.slice(5).replace("-", "/")}까지 주 <b>{pc.perWeek}장</b> 필요
                  {st.startedAt &&
                    (pc.aheadWeeks >= 0.5 ? (
                      <em className="good"> · 계획보다 {pc.aheadWeeks.toFixed(1)}주 앞서감</em>
                    ) : pc.aheadWeeks <= -0.5 ? (
                      <em className="warn"> · {(-pc.aheadWeeks).toFixed(1)}주 늦음</em>
                    ) : (
                      <em> · 계획대로</em>
                    ))}
                </span>
              )}
            </div>

            <div className="deck-actions">
              <button className="primary" onClick={() => onStart(entry.id, resumable ? session!.mode : "full")}>
                {resumable ? "이어하기" : st.startedAt ? "학습 시작" : "시작하기"}
              </button>
              {st.startedAt && !resumable && (
                <button onClick={() => onStart(entry.id, "quick")} disabled={due === 0}>
                  5분 모드
                </button>
              )}
            </div>
          </section>
        );
      })}

      <div className="foot-links">
        <button onClick={onReport}>오늘 리포트</button>
        <span className="muted">오늘 복습 {doneToday} / 상한 {data.settings.reviewCap}</span>
      </div>
    </div>
  );
}
