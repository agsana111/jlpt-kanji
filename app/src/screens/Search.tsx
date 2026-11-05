import { useMemo, useState } from "react";
import type { AppData } from "../App";
import { StatusDot } from "../components/CardView";
import { cardIndex, kanjiStatus, kanjiTable } from "../insights";
import { STATUS_LABEL } from "../srs";

interface Props {
  data: AppData;
  onBack: () => void;
  onOpenCard: (id: string) => void;
  onOpenKanji: (k: string) => void;
}

const KANJI_RE = /[一-鿿]/g;

function toHiragana(s: string) {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

export function Search({ data, onBack, onOpenCard, onOpenKanji }: Props) {
  const [q, setQ] = useState("");
  const cards = useMemo(() => [...cardIndex(data.decks).values()], [data.decks]);
  const table = useMemo(() => kanjiTable(data.decks), [data.decks]);

  const query = q.trim();
  const hira = toHiragana(query);
  const lower = query.toLowerCase();

  const kanjiHits = useMemo(() => {
    if (!query) return [];
    const ks = [...new Set(query.match(KANJI_RE) ?? [])].filter((k) => table.has(k));
    // also match by Korean hun-eum ("날 일", "일") when the query is Hangul
    if (!ks.length && /[가-힣]/.test(query)) {
      for (const [k, info] of table) if (info.hun && info.hun.split(" ").includes(query)) ks.push(k);
    }
    return ks.slice(0, 12);
  }, [query, table]);

  const hits = useMemo(() => {
    if (!query) return [];
    // exact word/reading or an exact Korean meaning item ranks first
    const exact = (c: { w: string; r: string; m: string }) =>
      Number(c.w === query || c.r === hira || c.m.split(/[;,]\s*/).some((x) => x.trim() === query));
    return cards
      .filter(({ card }) =>
        card.w.includes(query) ||
        (hira && card.r.includes(hira)) ||
        card.m.includes(query) ||
        (lower.length >= 2 && card.en.some((e) => e.toLowerCase().includes(lower))),
      )
      .sort((a, b) => exact(b.card) - exact(a.card))
      .slice(0, 150);
  }, [cards, query, hira, lower]);

  return (
    <div className="screen">
      <header className="top">
        <button className="text-btn" onClick={onBack}>
          ← 홈
        </button>
        <h1>사전</h1>
        <span />
      </header>
      <input
        className="search-input"
        type="search"
        autoFocus
        placeholder="한자, 읽기(ひらがな), 한국어 뜻, 영어"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {!query && (
        <p className="muted">
          N5·N4·N3 전체 {cards.length}장에서 찾아요. 시작하지 않은 덱의 카드도 나와요. 한자를 넣으면 그 한자 정보도 같이 보여요.
        </p>
      )}

      {kanjiHits.length > 0 && (
        <div className="kanji-hits">
          {kanjiHits.map((k) => {
            const info = table.get(k)!;
            const st = kanjiStatus(k, data.decks, data.progress);
            return (
              <button key={k} className="kanji-hit" onClick={() => onOpenKanji(k)}>
                <span className="kh-char">{k}</span>
                <span className="kh-info">
                  <b>{info.hun ?? info.en.join(", ")}</b>
                  <span className="muted">
                    N{info.lv} · <span className={`dot st-${st}`} />
                    {STATUS_LABEL[st]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {query && (
        <div className="muted">
          단어 {hits.length}
          {hits.length === 150 ? "+" : ""}개
        </div>
      )}
      <ul className="report-list">
        {hits.map(({ card, deck }) => (
          <li key={card.id} onClick={() => onOpenCard(card.id)}>
            <StatusDot p={data.progress.get(card.id)} />
            <span className="rw">{card.w}</span>
            <span className="rr">{card.r}</span>
            <span className="badge">{deck.name}</span>
            <span className="flow muted">{card.m}</span>
          </li>
        ))}
      </ul>
      {query && !hits.length && !kanjiHits.length && <div className="center-msg">찾는 단어가 없어요.</div>}
    </div>
  );
}
