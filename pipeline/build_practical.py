"""Build the practical ("실전") deck source from the picked candidate words.

Run from the project root:  pipeline/.venv/Scripts/python.exe -I pipeline/build_practical.py
Reads pipeline/practical/candidates.json (from check_practical.py) and pipeline/practical/picks.json
(the words picked on the checklist page; missing = every candidate not already a deck card),
writes pipeline/out/deck-life.json and pipeline/ko/todo-life.json.

Card order: grade 1 (필수) first, then 2 (매일), then 3 (편리); inside a grade by situation,
so the words of one situation come together.
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import fugashi

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent
RAW, OUT, KO = ROOT / "raw", ROOT / "out", ROOT / "ko"
KANJI_RE = re.compile(r"[一-鿿]")


def kata_to_hira(s):
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def kanji_of(text):
    return [c for c in text if KANJI_RE.match(c)]


cands = json.load(open(ROOT / "practical" / "candidates.json", encoding="utf-8"))
picks_p = ROOT / "practical" / "picks.json"
picks = json.load(open(picks_p, encoding="utf-8")) if picks_p.exists() else None
cats = list(dict.fromkeys(c["cat"] for c in cands))
words = [c for c in cands if not c["inDeck"] and (picks is None or c["w"] in picks["sel"])]
words.sort(key=lambda c: (c["g"], cats.index(c["cat"])))

# kanji already taught by the JLPT decks
DECK_LEVEL, DECK_IDS = {}, set()
for n in (5, 4, 3, 2):
    d = json.load(open(OUT / f"deck-n{n}.json", encoding="utf-8"))
    for k in d["kanji_list"]:
        DECK_LEVEL[k] = n
    DECK_IDS |= {c["id"] for c in d["cards"]}

kdata = json.load(open(RAW / "kanji-data.json", encoding="utf-8"))
kd = json.load(open(RAW / "kanjidic2-en-3.6.2.json", encoding="utf-8"))
KDIC = {c["literal"]: c for c in kd["characters"]}
KRAD = json.load(open(RAW / "kradfile-3.6.2.json", encoding="utf-8"))["kanji"]
HANGUL = {}
with open(RAW / "Unihan_Readings.txt", encoding="utf-8") as f:
    for line in f:
        if "\tkHangul\t" in line:
            cp, _, val = line.rstrip("\n").split("\t")
            HANGUL[chr(int(cp[2:], 16))] = [v.split(":")[0] for v in val.split()]
FURI = {}
for x in json.load(open(RAW / "JmdictFurigana.json", encoding="utf-8-sig")):
    FURI[(x["text"], x["reading"])] = [[s["ruby"], s.get("rt")] for s in x["furigana"]]
jm = {e["id"]: e for e in json.load(open(RAW / "jmdict-examples-eng-3.6.2.json", encoding="utf-8"))["words"]}

JPN, KOR, J2K = {}, {}, {}
with open(RAW / "jpn_sentences.tsv", encoding="utf-8") as f:
    for line in f:
        sid, _, text = line.rstrip("\n").split("\t", 2)
        JPN[sid] = text
with open(RAW / "kor_sentences.tsv", encoding="utf-8") as f:
    for line in f:
        sid, _, text = line.rstrip("\n").split("\t", 2)
        KOR[sid] = text
with open(RAW / "jpn-kor_links.tsv", encoding="utf-8") as f:
    for line in f:
        a, b = line.split()
        if b in KOR:
            J2K.setdefault(a, KOR[b])
SENT_BY_KANJI = defaultdict(list)
for sid, text in JPN.items():
    for c in set(kanji_of(text)):
        SENT_BY_KANJI[c].append(sid)

LIFE_KANJI = {k for c in words for k in kanji_of(c["w"])}
KNOWN = set(DECK_LEVEL) | LIFE_KANJI


def align(word, reading):
    """Furigana by matching the kana parts of the word inside the reading (温め/あたため -> 温[あたた]め)."""
    parts = re.findall(r"[一-鿿々]+|[^一-鿿々]+", word)
    pat = "".join("(.+?)" if KANJI_RE.match(p[0]) or p[0] == "々" else "(" + re.escape(p) + ")" for p in parts)
    m = re.fullmatch(pat, reading)
    if not m:
        return [[word, reading]]
    return [[p, g] if (KANJI_RE.match(p[0]) or p[0] == "々") else [p, None] for p, g in zip(parts, m.groups())]


TAGGER = fugashi.Tagger()
READING_FIX = {"日本": "にほん", "私": "わたし", "私たち": "わたしたち"}


def ruby_tokens(toks):
    out = []
    for w in toks:
        surf = w.surface
        kana = getattr(w.feature, "kana", None) or ""
        if surf in READING_FIX:
            out.append([surf, READING_FIX[surf]])
            continue
        if not kanji_of(surf) or not kana or kana == "*":
            out.append([surf, None])
            continue
        rt = kata_to_hira(kana)
        head, tail, s, r = "", "", surf, rt
        while s and r and s[-1] == r[-1] and not KANJI_RE.match(s[-1]):
            tail, s, r = s[-1] + tail, s[:-1], r[:-1]
        while s and r and s[0] == r[0] and not KANJI_RE.match(s[0]):
            head, s, r = head + s[0], s[1:], r[1:]
        if head:
            out.append([head, None])
        out.append([s, r])
        if tail:
            out.append([tail, None])
    return out


def sentence_ruby(text, card):
    toks = list(TAGGER(text))
    word, segs, i = card["word"], [], 0
    while i < len(toks):
        surf, j = "", i
        while j < len(toks) and len(surf) < len(word):
            surf += toks[j].surface
            j += 1
        if surf == word:
            segs += [list(s) for s in card["furigana"]]
            i = j
            continue
        segs += ruby_tokens([toks[i]])
        i += 1
    return segs


def word_used_as(text, word, reading):
    toks = list(TAGGER(text))
    for i, t in enumerate(toks):
        base, kb = getattr(t.feature, "orthBase", None), getattr(t.feature, "kanaBase", None)
        if base == word and kb and kata_to_hira(kb) == reading:
            return True
        surf, kana = "", ""
        for t2 in toks[i:i + 5]:
            surf += t2.surface
            kana += kata_to_hira(getattr(t2.feature, "kana", None) or "")
            if surf == word:
                if kana == reading:
                    return True
                break
            if len(surf) >= len(word):
                break
    return False


def sentence_ok(text):
    ks = kanji_of(text)
    return bool(ks) and all(k in KNOWN for k in ks) and 6 <= len(text) <= 32


def pick_example(word, reading):
    ks = kanji_of(word)
    rarest = min(ks, key=lambda c: len(SENT_BY_KANJI[c]))
    cands_ = [((sid not in J2K, abs(len(JPN[sid]) - 16)), sid) for sid in SENT_BY_KANJI[rarest]
              if word in JPN[sid] and sentence_ok(JPN[sid])]
    for _, sid in sorted(cands_)[:60]:
        if word_used_as(JPN[sid], word, reading):
            return sid
    return None


cards, problems = [], []
for c in words:
    w, r = c["w"], c["r"]
    if not r:
        problems.append(f"{w}: no reading")
        continue
    cid = "j" + c["id"] if c["id"] else "p" + "".join(f"{ord(ch):x}" for ch in w)
    if cid in DECK_IDS:
        problems.append(f"{w}: id {cid} is already a JLPT deck card")
        continue
    furi = FURI.get((w, r)) or align(w, r)
    joined = "".join(rt or rb for rb, rt in furi)
    if joined != r and kata_to_hira(joined) == r:
        r = joined  # 燃えるゴミ: keep the katakana ゴミ in the reading too
    e = jm.get(c["id"]) if c["id"] else None
    gloss = [c["en"]] if c["en"] else []
    pos = e["sense"][0]["partOfSpeech"] if e else ["exp"]
    card = {"id": cid, "word": w, "reading": r, "furigana": furi, "kanji": kanji_of(w),
            "pos": pos, "gloss_en": gloss, "grade": c["g"], "cat": c["cat"], "ko_draft": c["ko"]}
    sid = pick_example(w, r)
    card["example"] = None if sid is None else {
        "tid": sid, "ja": JPN[sid], "ruby": sentence_ruby(JPN[sid], card), "en": None, "ko_tatoeba": J2K.get(sid)}
    cards.append(card)

used = sorted({k for c in cards for k in c["kanji"]})
kanji = {}
for k in used:
    rm = KDIC[k]["readingMeaning"]["groups"][0] if KDIC.get(k) and KDIC[k].get("readingMeaning") else {"readings": [], "meanings": []}
    lv = DECK_LEVEL.get(k) or (1 if kdata.get(k, {}).get("jlpt_new") == 1 else 0)
    kanji[k] = {
        "level": lv,
        "on": [kata_to_hira(x["value"]) for x in rm["readings"] if x["type"] == "ja_on"],
        "kun": [x["value"] for x in rm["readings"] if x["type"] == "ja_kun"],
        "meaning_en": [m["value"] for m in rm["meanings"] if m["lang"] == "en"][:4],
        "eum": HANGUL.get(k) or [x["value"] for x in rm["readings"] if x["type"] == "korean_h"],
        "strokes": KDIC[k]["misc"]["strokeCounts"][0] if KDIC.get(k) else None,
        "parts": [p for p in KRAD.get(k, []) if p != k],
    }
# the deck's own kanji = the ones no JLPT deck teaches, in order of first appearance
new_list = list(dict.fromkeys(k for c in cards for k in c["kanji"] if k not in DECK_LEVEL))
deck = {"deck": "실전", "kanji_list": new_list, "kanji": kanji, "cards": cards}
json.dump(deck, open(OUT / "deck-life.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
todo = {
    "cards": [{"id": c["id"], "word": c["word"], "reading": c["reading"], "ko": c["ko_draft"], "en": c["gloss_en"]} for c in cards],
    "kanji": [{"k": k, "eum": kanji[k]["eum"], "en": kanji[k]["meaning_en"]} for k in new_list],
    "sentences": [{"id": c["id"], "word": c["word"], "ja": c["example"]["ja"], "ko_tatoeba": c["example"]["ko_tatoeba"]}
                  for c in cards if c["example"]],
}
json.dump(todo, open(KO / "todo-life.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
ex = [c for c in cards if c["example"]]
print(f"{len(cards)} cards, {len(new_list)} new kanji, {len(ex)} with examples "
      f"({sum(1 for c in ex if c['example']['ko_tatoeba'])} with a Tatoeba Korean translation)")
for p in problems:
    print("problem:", p)
