import type { CardData, DeckData, KanjiStructure, Progress, Seg } from "../types";
import { cardStatus, STATUS_LABEL } from "../srs";
import { kanjiStatus } from "../insights";

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
  /** all decks, so look-alike kanji from other decks show their status */
  decks?: Record<string, DeckData>;
  onOpenCard?: (id: string) => void;
  onOpenKanji?: (k: string) => void;
}

const ENCLOSE = new Set("門囗广疒尸厂辶气行勹匚冂");

/** Meaning part + sound part, then up to 4 look-alikes (ones already studied first). */
function KanjiStruct({ sx, decks, progress, onOpenKanji }: {
  sx: KanjiStructure;
  decks: Record<string, DeckData>;
  progress: Map<string, Progress>;
  onOpenKanji?: (k: string) => void;
}) {
  const fam = sx.f
    ? sx.f.k
        .map((item) => ({ item, st: kanjiStatus(item[0], decks, progress) }))
        .sort((a, b) => Number(a.st === "new") - Number(b.st === "new"))
        .slice(0, 4)
    : [];
  const famLabel = !sx.f
    ? ""
    : sx.f.t === "s"
      ? `${sx.f.by} 소리 가족`
      : ENCLOSE.has(sx.f.by)
        ? `${sx.f.by} 틀이 같은 한자 · 안쪽으로 구분`
        : `${sx.f.by}이(가) 들어간 한자`;
  return (
    <div className="kx">
      {sx.p.length > 0 && (
        <div className="kx-parts">
          {sx.p.map(([ch, role, label], i) => (
            <span key={i} style={{ display: "contents" }}>
              {i > 0 && <span className="kx-plus">+</span>}
              <span className={`kx-part ${role}`}>
                <b>{ch}</b>
                {role === "m" ? `뜻 · ${label}` : role === "s" ? `소리 · ${label}` : label}
              </span>
            </span>
          ))}
        </div>
      )}
      {fam.length > 0 && (
        <>
          <div className="kx-fam-label">{famLabel}</div>
          <div className="kx-fam">
            {fam.map(({ item: [k, note, exc], st }) => (
              <button key={k} className={`chip-btn ${st === "new" ? "unseen" : ""}`} onClick={() => onOpenKanji?.(k)}>
                <span className={`dot st-${st}`} title={STATUS_LABEL[st]} />
                {k}
                {note && <span className="kx-note">{note}</span>}
                {exc === 1 && <span className="kx-exc">예외</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function CardBack({ card, deck, progress, decks, onOpenCard, onOpenKanji }: BackProps) {
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
              <button className="kanji-char" aria-label={`${k} 한자 자세히`} onClick={() => onOpenKanji?.(k)}>
                {k}
              </button>
              <div className="kanji-info">
                <div className="kanji-hun">
                  {info?.hun ?? info?.en.join(", ")}
                  {info && info.lv >= 2 && info.lv !== Number(deck.id.slice(1)) && <span className="lv">N{info.lv}</span>}
                </div>
                {info && (
                  <div className="kanji-read">
                    {info.on.length > 0 && <span><i>음</i>{info.on.join("・")}</span>}
                    {info.kun.length > 0 && <span><i>훈</i>{kunList(info.kun).join("・")}</span>}
                  </div>
                )}
                {info && !info.sx?.p.length && info.parts.length > 0 && <div className="kanji-parts">부품 {info.parts.join(" ")}</div>}
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
                {info?.sx && (
                  <KanjiStruct sx={info.sx} decks={decks ?? { [deck.id]: deck }} progress={progress} onOpenKanji={onOpenKanji} />
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
