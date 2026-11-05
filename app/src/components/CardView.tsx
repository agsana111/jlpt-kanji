import type { CardData, DeckData, Progress, Seg } from "../types";
import { cardStatus, STATUS_LABEL } from "../srs";

export function speak(text: string) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.rate = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {
    /* TTS not available */
  }
}

/** KANJIDIC kun readings: "-ごと.に" -> "ごと(に)", drop affix-only duplicates. */
function kunList(kun: string[]): string[] {
  const out: string[] = [];
  for (const k of kun) {
    const [stem, oku] = k.replace(/^-|-$/g, "").split(".");
    const s = oku ? `${stem}(${oku})` : stem;
    if (!out.includes(s)) out.push(s);
  }
  return out.slice(0, 4);
}

export function Ruby({ segs }: { segs: Seg[] }) {
  return (
    <>
      {segs.map(([base, rt], i) =>
        rt ? (
          <ruby key={i}>
            {base}
            <rt>{rt}</rt>
          </ruby>
        ) : (
          <span key={i}>{base}</span>
        ),
      )}
    </>
  );
}

export function StatusDot({ p }: { p: Progress | undefined }) {
  const s = cardStatus(p);
  return <span className={`dot st-${s}`} title={STATUS_LABEL[s]} />;
}

export function CardFront({ card }: { card: CardData }) {
  return (
    <div className="card-front">
      <div className="word-big">{card.w}</div>
      <div className="hint">읽기와 뜻을 떠올려 보세요</div>
    </div>
  );
}

interface BackProps {
  card: CardData;
  deck: DeckData;
  progress: Map<string, Progress>;
  onOpenCard?: (id: string) => void;
}

export function CardBack({ card, deck, progress, onOpenCard }: BackProps) {
  const uniq = [...new Set(card.k)];
  return (
    <div className="card-back">
      <div className="word-head">
        <div className="word-ruby">
          <Ruby segs={card.f} />
        </div>
        <button className="icon-btn" aria-label="발음 듣기" onClick={() => speak(card.r)}>
          🔊
        </button>
      </div>
      <div className="reading">{card.r}</div>
      <div className="meaning">{card.m}</div>
      <details className="en">
        <summary>영어 원문 뜻</summary>
        <ol>
          {card.en.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ol>
      </details>

      <div className="kanji-list">
        {uniq.map((k) => {
          const info = deck.kanji[k];
          const others = deck.cards.filter((c) => c.id !== card.id && c.k.includes(k)).slice(0, 4);
          return (
            <div className="kanji-row" key={k}>
              <div className="kanji-char">{k}</div>
              <div className="kanji-info">
                <div className="kanji-hun">
                  {info?.hun ?? info?.en.join(", ")}
                  {info && info.lv !== Number(deck.id.slice(1)) && <span className="lv">N{info.lv}</span>}
                </div>
                {info && (
                  <div className="kanji-read">
                    {info.on.length > 0 && <span>음 {info.on.join("・")}</span>}
                    {info.kun.length > 0 && <span>훈 {kunList(info.kun).join("・")}</span>}
                  </div>
                )}
                {info && info.parts.length > 0 && <div className="kanji-parts">부품 {info.parts.join(" ")}</div>}
                {others.length > 0 && (
                  <div className="kanji-others">
                    {others.map((o) => (
                      <button key={o.id} className="chip-btn" onClick={() => onOpenCard?.(o.id)}>
                        <StatusDot p={progress.get(o.id)} />
                        {o.w}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {card.ex && (
        <div className="example">
          <div className="ex-ja">
            <ExampleRuby card={card} progress={progress} deck={deck} />
            <button className="icon-btn small" aria-label="예문 듣기" onClick={() => speak(card.ex!.ja)}>
              🔊
            </button>
          </div>
          <div className="ex-ko">{card.ex.ko}</div>
        </div>
      )}
    </div>
  );
}

/** Example sentence; the card's own word is highlighted, words already mastered are underlined. */
function ExampleRuby({ card, deck, progress }: { card: CardData; deck: DeckData; progress: Map<string, Progress> }) {
  const segs = card.ex!.ruby;
  const known = new Set(
    deck.cards.filter((c) => c.id !== card.id && cardStatus(progress.get(c.id)) === "mastered").map((c) => c.w),
  );
  // mark positions of the target word and known words in the plain text
  const text = segs.map((s) => s[0]).join("");
  const mark: ("t" | "k" | null)[] = new Array(text.length).fill(null);
  const paint = (w: string, m: "t" | "k") => {
    let i = text.indexOf(w);
    while (i >= 0) {
      for (let j = i; j < i + w.length; j++) if (!mark[j]) mark[j] = m;
      i = text.indexOf(w, i + w.length);
    }
  };
  paint(card.w, "t");
  for (const w of known) paint(w, "k");
  let pos = 0;
  return (
    <span>
      {segs.map(([base, rt], i) => {
        const m = mark[pos];
        pos += base.length;
        const cls = m === "t" ? "hl-target" : m === "k" ? "hl-known" : undefined;
        return rt ? (
          <ruby key={i} className={cls}>
            {base}
            <rt>{rt}</rt>
          </ruby>
        ) : (
          <span key={i} className={cls}>
            {base}
          </span>
        );
      })}
    </span>
  );
}
