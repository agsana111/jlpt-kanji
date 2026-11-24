"""Check practical-deck candidates against JMdict and the JLPT decks.

Run from the project root:  python -I pipeline/check_practical.py
Reads pipeline/practical/candidates.tsv, writes pipeline/practical/candidates.json
(one row per word: reading, JMdict id, whether it is already a deck card, kanji outside N5-N2).
"""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent
KANJI_RE = re.compile(r"[一-鿿々]")

jm = json.load(open(ROOT / "raw" / "jmdict-examples-eng-3.6.2.json", encoding="utf-8"))
BY_FORM = {}
for e in jm["words"]:
    for k in e["kanji"]:
        BY_FORM.setdefault(k["text"], []).append(e)

DECK_WORDS, DECK_KANJI, LEVEL = {}, set(), {}
for n in (5, 4, 3, 2):
    d = json.load(open(ROOT / "out" / f"deck-n{n}.json", encoding="utf-8"))
    for c in d["cards"]:
        DECK_WORDS[c["word"]] = n
    for k in d["kanji_list"]:
        DECK_KANJI.add(k)
        LEVEL[k] = n


# set phrases that JMdict has no entry for (signs, labels): reading given by hand
MANUAL_READING = {
    "店内飲食": "てんないいんしょく", "温め": "あたため", "要冷凍": "ようれいとう", "開封後": "かいふうご",
    "口座開設": "こうざかいせつ", "振込先": "ふりこみさき", "時間指定": "じかんしてい", "足元注意": "あしもとちゅうい",
    "押": "おす", "清掃中": "せいそうちゅう", "点検中": "てんけんちゅう",
}


def best_entry(word):
    es = BY_FORM.get(word, [])
    if not es:
        return None
    # prefer an entry where this spelling is marked common
    es.sort(key=lambda e: not any(k["text"] == word and k["common"] for k in e["kanji"]))
    return es[0]


rows, seen = [], set()
for line in (ROOT / "practical" / "candidates.tsv").read_text(encoding="utf-8").splitlines():
    if not line.strip() or line.startswith("#"):
        continue
    cat, word, grade, ko = line.split("\t")
    if word in seen:
        continue
    seen.add(word)
    e = best_entry(word)
    reading = common = None
    gloss = ""
    if e:
        kana = [k for k in e["kana"] if "*" in k["appliesToKanji"] or word in k["appliesToKanji"]]
        kana.sort(key=lambda k: not k["common"])
        reading = kana[0]["text"] if kana else None
        common = any(k["text"] == word and k["common"] for k in e["kanji"])
        gloss = "; ".join(g["text"] for g in e["sense"][0]["gloss"][:3])
    if reading is None and word in MANUAL_READING:
        reading = MANUAL_READING[word]
    ks = KANJI_RE.findall(word)
    rows.append({
        "cat": cat, "w": word, "g": int(grade), "ko": ko,
        "r": reading, "id": e["id"] if e else None, "common": common, "en": gloss,
        "inDeck": DECK_WORDS.get(word),  # N level if this word is already a card
        "newKanji": [k for k in dict.fromkeys(ks) if k not in DECK_KANJI],
    })

(ROOT / "practical" / "candidates.json").write_text(json.dumps(rows, ensure_ascii=False, indent=0), encoding="utf-8")
print(f"{len(rows)} words: not in JMdict {sum(1 for r in rows if not r['id'])}, already deck cards {sum(1 for r in rows if r['inDeck'])}")
newk = {}
for r in rows:
    if not r["inDeck"]:
        for k in r["newKanji"]:
            newk.setdefault(k, []).append(r["w"])
print(f"new kanji ({len(newk)}):", " ".join(f"{k}({len(v)})" for k, v in sorted(newk.items(), key=lambda x: -len(x[1]))))
print("not in JMdict:", " ".join(r["w"] for r in rows if not r["id"]))
