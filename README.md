# JLPT 한자 (N5 · N4 · N3)

폰에서 쓰는 한자 단어 복습 앱(PWA). 설계는 [docs/DESIGN.md](docs/DESIGN.md).

## 구조

- `app/` — React + Vite PWA. 학습 기록은 폰 브라우저(IndexedDB)에만 저장.
- `pipeline/build_decks.py` — 사전 데이터에서 덱 단어·예문 선정 → `pipeline/out/`, 번역 목록 `pipeline/ko/todo-n*.json`
- `pipeline/ko/n*.json` — 한국어 뜻·훈·예문 번역, 후리가나 수정
- `pipeline/merge.py` — 합치면서 자동 검사 → `app/public/data/`

## 데이터 다시 만들기

```bash
python -m venv pipeline/.venv
pipeline/.venv/Scripts/python -m pip install fugashi unidic-lite
# pipeline/raw/ 에 원본 데이터 다운로드 (출처는 docs/DESIGN.md 8장)
pipeline/.venv/Scripts/python -I pipeline/build_decks.py
python -I pipeline/merge.py
```

## 앱 실행

```bash
cd app
npm install
npm run build
npm run preview
```

`main` 브랜치에 push하면 GitHub Actions가 GitHub Pages로 배포한다.

## 데이터 출처

JMdict / KANJIDIC2 / KRADFILE (EDRDG, CC BY-SA 4.0), jmdict-simplified, JmdictFurigana,
JLPT 레벨 목록 (Jonathan Waller, CC BY; yomitan-jlpt-vocab; kanji-data),
Tatoeba (CC BY 2.0 FR), Unicode Unihan. 한국어 번역 일부는 Claude가 작성.
