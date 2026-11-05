import { useEffect, useMemo, useState } from "react";
import type { AppData } from "../App";
import { StatusDot } from "../components/CardView";
import { cardsWithKanji, kanjiStatus, kanjiTable, kanjiWrongTotal, similarKanji } from "../insights";
import { STATUS_LABEL } from "../srs";

interface Props {
  k: string;
  data: AppData;
  onClose: () => void;
  onOpenCard: (id: string) => void;
  onOpenKanji: (k: string) => void;
  onSaveMemo: (k: string, memo: string) => void;
  onDrill: (ids: string[], title: string) => void;
}

function kunList(kun: string[]) {
  const out: string[] = [];
  for (const x of kun) {
    const [stem, oku] = x.replace(/^-|-$/g, "").split(".");
    const s = oku ? `${stem}(${oku})` : stem;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

export function KanjiModal({ k, data, onClose, onOpenCard, onOpenKanji, onSaveMemo, onDrill }: Props) {
  const table = useMemo(() => kanjiTable(data.decks), [data.decks]);
  const info = table.get(k);
  const refs = useMemo(() => cardsWithKanji(data.decks, k), [data.decks, k]);
  const similar = useMemo(() => similarKanji(k, table), [k, table]);
  const st = kanjiStatus(k, data.decks, data.progress);
  const wrong = kanjiWrongTotal(k, data.decks, data.progress);
  const [memo, setMemo] = useState(data.memos[k] ?? "");
  useEffect(() => setMemo(data.memos[k] ?? ""), [k, data.memos]);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className={`badge st-${st}`}>{STATUS_LABEL[st]}</span>
          {info && <span className="muted">N{info.lv} · {info.st}획 · 오답 합계 {wrong}회</span>}
          <button className="icon-btn" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="kanji-hero">
          <div className="kanji-big">{k}</div>
          <div>
            <div className="kanji-hun big">{info?.hun ?? "-"}</div>
            {info && (
              <div className="kanji-read">
                {info.on.length > 0 && <span>음 {info.on.join("・")}</span>}
                {info.kun.length > 0 && <span>훈 {kunList(info.kun).join("・")}</span>}
              </div>
            )}
            {info && <div className="muted">{info.en.join(", ")}</div>}
          </div>
        </div>

        {info && info.parts.length > 0 && (
          <section className="kanji-sec">
            <h3>부품 분해</h3>
            <div className="parts">
              {info.parts.map((p) => (
                <span key={p} className="part">
                  {p}
                  {table.get(p)?.hun && <small>{table.get(p)!.hun}</small>}
                </span>
              ))}
            </div>
          </section>
        )}

        {similar.length > 0 && (
          <section className="kanji-sec">
            <h3>헷갈리기 쉬운 비슷한 한자</h3>
            <div className="similar">
              {similar.map((s) => (
                <button key={s} className="sim" onClick={() => onOpenKanji(s)}>
                  <span className="sim-char">{s}</span>
                  <small>{table.get(s)?.hun ?? ""}</small>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="kanji-sec">
          <h3>내 연상 메모</h3>
          <textarea
            className="memo"
            rows={2}
            placeholder="예: 待 = 길(彳)에서 절(寺) 앞에 서서 기다린다"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            onBlur={() => memo !== (data.memos[k] ?? "") && onSaveMemo(k, memo)}
          />
          {memo !== (data.memos[k] ?? "") && (
            <button className="memo-save" onClick={() => onSaveMemo(k, memo)}>
              메모 저장
            </button>
          )}
        </section>

        <section className="kanji-sec">
          <h3>이 한자가 들어간 단어 {refs.length}개</h3>
          <ul className="report-list">
            {refs.map(({ card, deck }) => (
              <li key={card.id} onClick={() => onOpenCard(card.id)}>
                <StatusDot p={data.progress.get(card.id)} />
                <span className="rw">{card.w}</span>
                <span className="rr">{card.r}</span>
                <span className="badge">{deck.name}</span>
                <span className="flow muted">{card.m}</span>
              </li>
            ))}
          </ul>
        </section>

        <button className="primary wide" onClick={() => onDrill(refs.map((r) => r.card.id), `「${k}」 집중 연습`)}>
          이 한자 단어만 연습하기
        </button>
      </div>
    </div>
  );
}
