import type { AppData, Screen } from "../App";
import { breakState, daysBetween, extraLoad, forecast, STATUS_ORDER } from "../insights";
import { deckCounts, dueCards, pace, reviewsDoneToday } from "../session";
import { dayKey, STATUS_LABEL } from "../srs";
import type { Session } from "../types";

const EXAM = "2027-07-04";
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

interface Props {
  data: AppData;
  session: Session | null;
  onStart: (deck: string, mode: "full" | "quick") => void;
  onNav: (s: Screen) => void;
  onBackup: () => void;
}

export function Home({ data, session, onStart, onNav, onBackup }: Props) {
  const today = dayKey();
  const dDay = daysBetween(today, EXAM);
  const needBackup =
    data.progress.size > 0 && (!data.lastBackup || Date.now() - new Date(data.lastBackup).getTime() > 7 * 86400_000);
  const doneToday = reviewsDoneToday(data.progress);
  const brk = breakState(data.breakPlan, today);
  const active = new Set(data.index.filter((d) => data.deckStates[d.id]?.startedAt && !data.deckStates[d.id]?.graduatedAt).map((d) => d.id));
  const fc = forecast(data.progress, active);
  const extra = extraLoad(fc, data.settings.newPerBatch);
  const maxBar = Math.max(1, ...fc.existing.map((n, i) => n + (extra.add[i] ?? 0)));

  return (
    <div className="screen">
      <header className="top">
        <h1>JLPT 한자</h1>
        <div className="top-right">
          <span className="dday">시험 D-{dDay}</span>
          <button className="icon-btn" aria-label="설정" onClick={() => onNav("settings")}>
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

      {brk.phase !== "none" && brk.plan && (
        <div className={`banner brk-${brk.phase}`}>
          <span>
            {brk.phase === "pre" &&
              `쉬는 기간(${brk.plan.start.slice(5)}~${brk.plan.end.slice(5)})까지 ${daysBetween(today, brk.plan.start)}일. 쉬는 동안 돌아올 카드를 지금 미리 복습해요. 신규는 쉬어요.`}
            {brk.phase === "during" && `쉬는 중이에요 (~${brk.plan.end.slice(5)}). 시간 나면 5분 모드만 해도 좋아요.`}
            {brk.phase === "after" && "쉬는 기간이 끝났어요. 쉬기 직전에 배운 카드부터 복습해요."}
          </span>
        </div>
      )}

      {active.size > 0 && (
        <section className="forecast">
          <div className="fc-head">
            <b>앞으로 7일 복습 예상</b>
            <span className="muted">
              오늘 복습 {doneToday} / 상한 {data.settings.reviewCap}
            </span>
          </div>
          <div className="fc-bars" aria-hidden="true">
            {fc.existing.map((n, i) => {
              const add = extra.add[i] ?? 0;
              const d = new Date(Date.now() + i * 86400_000);
              return (
                <div key={i} className="fc-col">
                  <span className="fc-num">{n}</span>
                  <div className="fc-stack">
                    <div className="fc-add" style={{ height: `${(add / maxBar) * 100}%` }} />
                    <div className="fc-base" style={{ height: `${(n / maxBar) * 100}%` }} />
                  </div>
                  <span className="fc-day">{i === 0 ? "오늘" : WEEKDAY[d.getDay()]}</span>
                </div>
              );
            })}
          </div>
          <div className="muted small">
            오늘 신규 {data.settings.newPerBatch}장을 더 하면 → 내일 +{extra.tomorrow}장, 이후 하루 평균 +{extra.weekAvg}장 (연한 막대)
          </div>
        </section>
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
        const due = dueCards(deck, data.progress, new Set(), brk).length;
        const pc = pace(deck, data.progress, st.target, st.startedAt, data.breakPlan);
        const total = deck.cards.length;
        const resumable = session && session.deck === entry.id && session.day === today;
        const graduated = !!st.graduatedAt;
        const canGraduate = !graduated && st.startedAt && counts.mastered === total;
        return (
          <section key={entry.id} className={`deck ${graduated ? "deck-grad" : ""}`}>
            <div className="deck-head">
              <h2>{entry.name}</h2>
              <span className={`badge ${st.startedAt ? "on" : ""}`}>{graduated ? "졸업" : st.startedAt ? "진행 중" : "미시작"}</span>
            </div>
            <div className="deck-sub">
              한자 {deck.kanjiList.length}자 · 카드 {total}장{st.startedAt ? ` · ${st.startedAt.slice(5).replace("-", "/")} 시작` : ""}
            </div>

            <div className="bar" aria-hidden="true">
              {STATUS_ORDER.map((s) => (counts[s] ? <div key={s} className={`seg st-${s}`} style={{ width: `${(counts[s] / total) * 100}%` }} /> : null))}
            </div>
            <div className="legend">
              {STATUS_ORDER.map((s) => (
                <span key={s}>
                  <span className={`dot st-${s}`} />
                  {STATUS_LABEL[s]} {counts[s]}
                </span>
              ))}
            </div>

            {graduated ? (
              <div className="pace">졸업한 덱이에요. 사전과 자유 테스트에서 계속 볼 수 있어요.</div>
            ) : (
              <>
                {st.startedAt && (
                  <div className="today-row">
                    <div>
                      <div className="num">{due}</div>
                      <div className="lbl">{brk.phase === "pre" ? "미리 복습" : "복습 대기"}</div>
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
                          <em className="good">
                            {" "}
                            · 진도 저금 {pc.aheadWeeks.toFixed(1)}주 (그만큼 신규 없이 쉬어도 일정 OK)
                          </em>
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
                {canGraduate && <div className="good small">모든 카드가 마스터예요! 설정에서 이 덱을 졸업시킬 수 있어요.</div>}
              </>
            )}
          </section>
        );
      })}

      <nav className="nav-grid">
        <button onClick={() => onNav("search")}>
          <span>🔍</span>사전
        </button>
        <button onClick={() => onNav("freetest")}>
          <span>📝</span>자유 테스트
        </button>
        <button onClick={() => onNav("leech")}>
          <span>🎯</span>집중공략
        </button>
        <button onClick={() => onNav("kanji")}>
          <span>漢</span>한자표
        </button>
        <button onClick={() => onNav("report")}>
          <span>📋</span>리포트
        </button>
        <button onClick={() => onNav("settings")}>
          <span>⚙️</span>설정
        </button>
      </nav>
    </div>
  );
}
