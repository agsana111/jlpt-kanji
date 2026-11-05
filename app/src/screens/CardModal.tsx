import type { AppData } from "../App";
import { CardBack } from "../components/CardView";
import { cardStatus, STATUS_LABEL } from "../srs";
import type { CardData, DeckData } from "../types";

interface Props {
  card: CardData;
  deck: DeckData;
  data: AppData;
  onClose: () => void;
  onToggleLeech: (id: string) => void;
  onOpenCard: (id: string) => void;
  onOpenKanji: (k: string) => void;
}

export function CardModal({ card, deck, data, onClose, onToggleLeech, onOpenCard, onOpenKanji }: Props) {
  const p = data.progress.get(card.id);
  const st = cardStatus(p);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className={`badge st-${st}`}>{STATUS_LABEL[st]}</span>
          {p && (
            <span className="muted">
              오답 {p.wrongTotal}회 · 다음 복습 {p.fsrs.due.toLocaleDateString("ko-KR")}
            </span>
          )}
          <button className="icon-btn" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </div>
        <CardBack card={card} deck={deck} progress={data.progress} onOpenCard={onOpenCard} onOpenKanji={onOpenKanji} />
        <button className={`wide ${p?.leechManual ? "on" : ""}`} onClick={() => onToggleLeech(card.id)}>
          {p?.leechManual ? "🎯 안 외워짐 지정 풀기" : "🎯 안 외워짐으로 지정"}
        </button>
      </div>
    </div>
  );
}
