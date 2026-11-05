import { useRef, useState } from "react";
import type { AppData } from "../App";
import type { DeckState, Settings } from "../types";

interface Props {
  data: AppData;
  onSave: (s: Settings, d: Record<string, DeckState>) => void;
  onExport: () => void;
  onImport: (f: File) => void;
  onBack: () => void;
}

export function SettingsView({ data, onSave, onExport, onImport, onBack }: Props) {
  const [s, setS] = useState<Settings>(data.settings);
  const [decks, setDecks] = useState<Record<string, DeckState>>(data.deckStates);
  const fileRef = useRef<HTMLInputElement>(null);

  const num = (k: keyof Settings, min: number, max: number) => (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={s[k]}
      onChange={(e) => setS({ ...s, [k]: Math.max(min, Math.min(max, Number(e.target.value) || min)) })}
    />
  );

  return (
    <div className="screen">
      <header className="top">
        <button className="text-btn" onClick={onBack}>
          ← 홈
        </button>
        <h1>설정</h1>
        <span />
      </header>

      <section className="panel">
        <h2>학습량</h2>
        <label>
          묶음당 신규 {num("newPerBatch", 3, 30)}
        </label>
        <label>
          묶음당 복습 {num("reviewPerBatch", 5, 60)}
        </label>
        <label>
          하루 복습 상한 (전체 덱) {num("reviewCap", 20, 500)}
        </label>
        <label>
          밀린 복습이 이보다 많으면 신규 정지 {num("backlogStop", 10, 500)}
        </label>
      </section>

      <section className="panel">
        <h2>덱 목표일</h2>
        {data.index.map((d) => (
          <label key={d.id}>
            {d.name} 신규 완료
            <input
              type="date"
              value={decks[d.id].target}
              onChange={(e) => setDecks({ ...decks, [d.id]: { ...decks[d.id], target: e.target.value } })}
            />
          </label>
        ))}
      </section>

      <button className="primary wide" onClick={() => onSave(s, decks)}>
        저장
      </button>

      <section className="panel">
        <h2>백업</h2>
        <p className="muted">
          학습 기록은 이 폰 안에만 저장돼요. 크롬 데이터를 지우거나 폰을 바꾸면 사라지니까 가끔 파일로 내보내 두세요.
          {data.lastBackup && <> 마지막 백업: {new Date(data.lastBackup).toLocaleString("ko-KR")}</>}
        </p>
        <div className="stack">
          <button onClick={onExport}>백업 파일 내보내기</button>
          <button onClick={() => fileRef.current?.click()}>백업 파일 불러오기</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && confirm("지금 기록을 이 백업 파일 내용으로 바꿀까요? 되돌릴 수 없어요.")) onImport(f);
              e.target.value = "";
            }}
          />
        </div>
      </section>

      <section className="panel credits">
        <h2>데이터 출처</h2>
        <ul>
          <li>JMdict, KANJIDIC2, KRADFILE: Electronic Dictionary Research and Development Group (CC BY-SA 4.0)</li>
          <li>jmdict-simplified (scriptin), JmdictFurigana (Doublevil)</li>
          <li>JLPT 레벨 목록: Jonathan Waller, tanos.co.uk (CC BY), yomitan-jlpt-vocab, kanji-data</li>
          <li>예문: Tatoeba (CC BY 2.0 FR)</li>
          <li>한국 한자음: Unicode Unihan Database</li>
          <li>한국어 뜻·훈·예문 번역 일부는 Claude가 작성했어요.</li>
          <li>JLPT 공식 목록은 2010년 이후 공개되지 않아서 레벨 구분은 추정치예요.</li>
        </ul>
      </section>
    </div>
  );
}
