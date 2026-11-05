import { useEffect, useState } from "react";
import type { AppData } from "../App";
import * as db from "../db";
import { StatusDot } from "../components/CardView";
import type { CardData, DayReport } from "../types";

interface Props {
  data: AppData;
  day: string;
  onDay: (d: string) => void;
  onBack: () => void;
  onOpenCard: (id: string) => void;
}

const G = ["", "모름", "애매", "앎"];

export function ReportView({ data, day, onDay, onBack, onOpenCard }: Props) {
  const [report, setReport] = useState<DayReport | null>(null);
  const [days, setDays] = useState<string[]>([]);

  useEffect(() => {
    db.getReport(day).then((r) => setReport(r ?? null));
    db.allReports().then((all) => setDays(all.map((r) => r.day).sort().reverse()));
  }, [day]);

  const cards = new Map<string, CardData>();
  for (const d of Object.values(data.decks)) for (const c of d.cards) cards.set(c.id, c);

  const entries = Object.entries(report?.entries ?? {})
    .map(([id, e]) => ({ id, ...e, card: cards.get(id) }))
    .filter((e) => e.card);
  const firstWrong = entries.filter((e) => e.grades[0] < 3);
  const finalWrong = entries.filter((e) => e.grades.includes(11));
  // trouble first: failed in final, then many retries, then first-wrong
  entries.sort((a, b) => score(b.grades) - score(a.grades));

  return (
    <div className="screen">
      <header className="top">
        <button className="text-btn" onClick={onBack}>
          ← 홈
        </button>
        <h1>리포트</h1>
        <select value={day} onChange={(e) => onDay(e.target.value)} aria-label="날짜">
          {(days.includes(day) ? days : [day, ...days]).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </header>

      {!entries.length ? (
        <div className="center-msg">이 날은 공부 기록이 없어요.</div>
      ) : (
        <>
          <div className="today-row">
            <div>
              <div className="num">{entries.length}</div>
              <div className="lbl">본 카드</div>
            </div>
            <div>
              <div className="num">{firstWrong.length}</div>
              <div className="lbl">처음에 틀림</div>
            </div>
            <div>
              <div className="num warn">{finalWrong.length}</div>
              <div className="lbl">마무리에서도 모름</div>
            </div>
          </div>
          <ul className="report-list">
            {entries.map((e) => (
              <li key={e.id} onClick={() => onOpenCard(e.id)}>
                <StatusDot p={data.progress.get(e.id)} />
                <span className="rw">{e.card!.w}</span>
                <span className="rr">{e.card!.r}</span>
                <span className="flow">
                  {e.grades.map((g, i) => (
                    <span key={i} className={`gchip g${g % 10} ${g > 10 ? "fin" : ""}`}>
                      {g > 10 ? "마 " : ""}
                      {G[g % 10]}
                    </span>
                  ))}
                </span>
                {e.grades.includes(11) && <span className="flag">집중공략 후보</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function score(g: number[]) {
  return (g.includes(11) ? 100 : 0) + g.filter((x) => x === 1 || x === 2).length * 10 + (g[0] < 3 ? 5 : 0);
}
