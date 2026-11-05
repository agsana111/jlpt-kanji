"""Build deck source data (before Korean translation) from verified dictionaries.

Run from the project root:  python -I pipeline/build_decks.py
Reads pipeline/raw/*, writes pipeline/out/deck-n{5,4,3}.json
and pipeline/ko/todo-n{5,4,3}.json (items that need Korean text).
"""
import csv
import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
OUT = ROOT / "out"
KO = ROOT / "ko"
OUT.mkdir(exist_ok=True)
KO.mkdir(exist_ok=True)

KANJI_RE = re.compile(r"[一-鿿]")
BAD_FORM_TAGS = {"rK", "sK", "iK", "oK", "ateji"}
BAD_KANA_TAGS = {"ok", "rk", "sk", "ik"}
BAD_SENSE_MISC = {"arch", "obs", "rare", "obsc", "dated", "vulg", "X", "derog"}
# hand-reviewed: JMdict entries that are poor study items (technical senses etc.)
EXCLUDE = {
    "1376600",  # 正 せい (logical true; 10^40)
    "1252050",  # 計 けい (meter; total)
    "1376590",  # 正 せい (logical true)
    "1430580",  # 直 なお (ordinary; doing nothing)
    "1207600",  # 掛け かけ (credit; money owed)
}


def kata_to_hira(s: str) -> str:
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def kanji_of(text: str):
    return [c for c in text if KANJI_RE.match(c)]


# ---------------------------------------------------------------- load sources
print("loading kanji levels")
kdata = json.load(open(RAW / "kanji-data.json", encoding="utf-8"))
LEVEL = {k: v["jlpt_new"] for k, v in kdata.items() if v.get("jlpt_new") in (3, 4, 5)}
KFREQ = {k: (v.get("freq") or 9999) for k, v in kdata.items()}

print("loading waller vocab lists")
WALLER = {}  # seq -> vocab level
for n in (5, 4, 3):
    with open(RAW / f"waller-n{n}.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            WALLER.setdefault(row["jmdict_seq"], n)

print("loading kanjidic2 / kradfile / unihan")
kd = json.load(open(RAW / "kanjidic2-en-3.6.2.json", encoding="utf-8"))
KDIC = {c["literal"]: c for c in kd["characters"]}
KRAD = json.load(open(RAW / "kradfile-3.6.2.json", encoding="utf-8"))["kanji"]
HANGUL = {}
with open(RAW / "Unihan_Readings.txt", encoding="utf-8") as f:
    for line in f:
        if "\tkHangul\t" in line:
            cp, _, val = line.rstrip("\n").split("\t")
            ch = chr(int(cp[2:], 16))
            HANGUL[ch] = [v.split(":")[0] for v in val.split()]

print("loading furigana")
FURI = {}
for x in json.load(open(RAW / "JmdictFurigana.json", encoding="utf-8-sig")):
    FURI[(x["text"], x["reading"])] = [[s["ruby"], s.get("rt")] for s in x["furigana"]]

print("loading sentences")
JPN = {}
with open(RAW / "jpn_sentences.tsv", encoding="utf-8") as f:
    for line in f:
        sid, _, text = line.rstrip("\n").split("\t", 2)
        JPN[sid] = text
KOR = {}
with open(RAW / "kor_sentences.tsv", encoding="utf-8") as f:
    for line in f:
        sid, _, text = line.rstrip("\n").split("\t", 2)
        KOR[sid] = text
J2K = {}
with open(RAW / "jpn-kor_links.tsv", encoding="utf-8") as f:
    for line in f:
        a, b = line.split()
        if b in KOR:
            J2K.setdefault(a, KOR[b])
SENT_BY_KANJI = defaultdict(list)
for sid, text in JPN.items():
    for c in set(kanji_of(text)):
        SENT_BY_KANJI[c].append(sid)

print("loading jmdict")
jm = json.load(open(RAW / "jmdict-examples-eng-3.6.2.json", encoding="utf-8"))


def sentence_ok(text: str, level: int) -> bool:
    ks = kanji_of(text)
    return bool(ks) and all(LEVEL.get(c, 0) >= level for c in ks) and 6 <= len(text) <= 28


def freq_of(form: str) -> int:
    ks = kanji_of(form)
    rarest = min(ks, key=lambda c: len(SENT_BY_KANJI[c]))
    return sum(1 for sid in SENT_BY_KANJI[rarest] if form in JPN[sid])


# ---------------------------------------------------------------- candidates
print("collecting candidate words")
CANDS = []
for e in jm["words"]:
    seq = e["id"]
    if seq in EXCLUDE:
        continue
    forms = [
        k for k in e["kanji"]
        if kanji_of(k["text"]) and not (set(k["tags"]) & BAD_FORM_TAGS)
        and not re.search(r"[0-9０-９]", k["text"])
    ]
    if not forms:
        continue
    form = next((k for k in forms if k["common"]), None)
    if form is None and seq in WALLER:
        form = forms[0]
    if form is None:
        continue
    text = form["text"]
    ks = kanji_of(text)
    if any(c not in LEVEL for c in ks):
        continue
    if len(text) > 5:
        continue
    kana = [
        k for k in e["kana"]
        if not (set(k["tags"]) & BAD_KANA_TAGS)
        and ("*" in k["appliesToKanji"] or text in k["appliesToKanji"])
    ]
    if not kana:
        continue
    kana.sort(key=lambda k: not k["common"])
    if not kana[0]["common"] and seq not in WALLER:
        continue
    reading = kana[0]["text"]
    senses = [
        s for s in e["sense"]
        if ("*" in s["appliesToKanji"] or text in s["appliesToKanji"])
        and not (set(s["misc"]) & BAD_SENSE_MISC)
    ]
    if not senses:
        continue
    pos = senses[0]["partOfSpeech"]
    if any(p in ("n-pr", "unc") for p in pos):
        continue
    # usually written in kana -> not a kanji study item
    if "uk" in senses[0]["misc"]:
        continue
    # single-kanji words only when they are on a JLPT vocab list
    if len(text) == 1 and seq not in WALLER:
        continue
    gloss = ["; ".join(g["text"] for g in s["gloss"][:4]) for s in senses[:3]]
    examples = []
    for s in senses:
        for ex in s.get("examples", []):
            ja = next((x["text"] for x in ex["sentences"] if x["lang"] == "jpn"), None)
            en = next((x["text"] for x in ex["sentences"] if x["lang"] == "eng"), None)
            if ja:
                examples.append({"tid": ex["source"]["value"], "ja": ja, "en": en})
    furi = FURI.get((text, reading)) or [[text, reading]]
    CANDS.append({
        "seq": seq, "text": text, "reading": reading, "kanji": ks,
        "level": min(LEVEL[c] for c in ks) if False else min(LEVEL[c] for c in ks),
        "waller": WALLER.get(seq), "common": form["common"],
        "pos": pos, "gloss": gloss, "examples": examples, "furigana": furi,
    })
print(" candidates:", len(CANDS))


def kanji_reading_in(card, k):
    for ruby, rt in card["furigana"]:
        if k in ruby:
            return (ruby, rt)
    return None


def score(c, level):
    s = 0.0
    if c["waller"] is not None:
        s += 60 if c["waller"] >= level else 35
    if c["common"]:
        s += 15
    s += 8 * math.log1p(c["freq"])
    s -= 4 * max(0, len(c["text"]) - 2)
    return s


# ---------------------------------------------------------------- per deck
import fugashi  # noqa: E402

TAGGER = fugashi.Tagger()


READING_FIX = {"日本": "にほん", "私": "わたし", "私たち": "わたしたち"}


def ruby_tokens(text: str, toks=None):
    out = []
    for w in (toks if toks is not None else TAGGER(text)):
        surf = w.surface
        kana = getattr(w.feature, "kana", None) or ""
        if surf in READING_FIX:
            out.append([surf, READING_FIX[surf]])
            continue
        if not kanji_of(surf) or not kana or kana == "*":
            out.append([surf, None])
            continue
        rt = kata_to_hira(kana)
        # strip shared trailing / leading kana (okurigana)
        head, tail = "", ""
        s, r = surf, rt
        while s and r and s[-1] == r[-1] and not KANJI_RE.match(s[-1]):
            tail = s[-1] + tail
            s, r = s[:-1], r[:-1]
        while s and r and s[0] == r[0] and not KANJI_RE.match(s[0]):
            head += s[0]
            s, r = s[1:], r[1:]
        if head:
            out.append([head, None])
        out.append([s, r])
        if tail:
            out.append([tail, None])
    return out


def sentence_ruby(text, card):
    """Ruby segments; where the tokenizer finds exactly the target word, use the card's furigana."""
    toks = list(TAGGER(text))
    word = card["text"]
    segs = []
    i = 0
    while i < len(toks):
        surf, j = "", i
        while j < len(toks) and len(surf) < len(word):
            surf += toks[j].surface
            j += 1
        if surf == word:
            segs += [list(s) for s in card["furigana"]]
            i = j
            continue
        segs += ruby_tokens("", [toks[i]])
        i += 1
    return segs


def word_used_as(text, card):
    """True if the sentence really uses this word with this reading (tokenizer check)."""
    toks = list(TAGGER(text))
    word, reading = card["text"], card["reading"]
    for i in range(len(toks)):
        t = toks[i]
        base = getattr(t.feature, "orthBase", None)
        kb = getattr(t.feature, "kanaBase", None)
        if base == word and kb and kata_to_hira(kb) == reading:
            return True
        surf, kana = "", ""
        for t2 in toks[i:i + 4]:
            surf += t2.surface
            kana += kata_to_hira(getattr(t2.feature, "kana", None) or "")
            if surf == word:
                if kana == reading:
                    return True
                break
            if len(surf) >= len(word):
                break
    return False


def pick_example(card, level):
    for ex in card["examples"]:
        if card["text"] in ex["ja"] and sentence_ok(ex["ja"], level) and word_used_as(ex["ja"], card):
            return ex
    cands = []
    rarest = min(card["kanji"], key=lambda c: len(SENT_BY_KANJI[c]))
    for sid in SENT_BY_KANJI[rarest]:
        t = JPN[sid]
        if card["text"] in t and sentence_ok(t, level):
            cands.append(((sid not in J2K, abs(len(t) - 14)), sid, t))
    for key, sid, t in sorted(cands)[:40]:
        if word_used_as(t, card):
            return {"tid": sid, "ja": t, "en": None}
    return None


print("computing frequencies")
for c in CANDS:
    c["freq"] = freq_of(c["text"])

report = {}
for level in (5, 4, 3):
    deck_kanji = sorted([k for k, v in LEVEL.items() if v == level], key=lambda k: KFREQ.get(k, 9999))
    pool = [c for c in CANDS if c["level"] == level]
    for c in pool:
        c["_score"] = score(c, level)
    pool.sort(key=lambda c: -c["_score"])
    chosen = {}
    for k in deck_kanji:
        mine = [c for c in pool if k in c["kanji"]]
        already = [c for c in chosen.values() if k in c["kanji"]]
        readings = {kanji_reading_in(c, k) for c in already}
        picks = list(already)
        for c in mine:
            if len(picks) >= 3:
                break
            if c["seq"] in chosen:
                continue
            r = kanji_reading_in(c, k)
            listed = c["waller"] is not None and c["waller"] >= level - 1
            if picks and len(c["text"]) == 1 and not listed:
                continue
            if c["text"].startswith("お") is False and ("お" + c["text"]) in {p["text"] for p in chosen.values()}:
                continue
            if not picks:
                ok = True
            elif r not in readings:
                ok = listed or (c["waller"] is not None and c["freq"] >= 300)
            else:
                ok = len(picks) < 2 and listed and c["_score"] >= 70
            if ok:
                c["_round"] = len(picks)
                picks.append(c)
                chosen[c["seq"]] = c
                readings.add(r)
    # core vocab: every same-level JLPT vocab word written with this deck's kanji
    for c in pool:
        if c["waller"] == level and c["seq"] not in chosen:
            if ("お" + c["text"]) in {p["text"] for p in chosen.values()}:
                continue
            c["_round"] = 3
            chosen[c["seq"]] = c
    missing =[k for k in deck_kanji if not any(k in c["kanji"] for c in chosen.values())]

    cards = []
    # learning order: one word per kanji first, then the second/third words, then extra core vocab;
    # inside a round a word comes after all of its kanji have been introduced.
    def order_key(c):
        idx = max(deck_kanji.index(k) for k in c["kanji"] if k in deck_kanji)
        return (min(c.get("_round", 3), 3), idx)

    for c in sorted(chosen.values(), key=order_key):
        ex = pick_example(c, level)
        cards.append({
            "id": "j" + c["seq"],
            "word": c["text"],
            "reading": c["reading"],
            "furigana": c["furigana"],
            "kanji": c["kanji"],
            "pos": c["pos"],
            "gloss_en": c["gloss"],
            "waller": c["waller"],
            "example": None if ex is None else {
                "tid": ex["tid"], "ja": ex["ja"], "ruby": sentence_ruby(ex["ja"], c),
                "en": ex["en"], "ko_tatoeba": J2K.get(ex["tid"]),
            },
        })
    used = sorted({k for c in cards for k in c["kanji"]})
    kanji = {}
    for k in used:
        rm = KDIC[k]["readingMeaning"]["groups"][0] if KDIC.get(k) and KDIC[k].get("readingMeaning") else {"readings": [], "meanings": []}
        kanji[k] = {
            "level": LEVEL[k],
            "on": [kata_to_hira(r["value"]) for r in rm["readings"] if r["type"] == "ja_on"],
            "kun": [r["value"] for r in rm["readings"] if r["type"] == "ja_kun"],
            "meaning_en": [m["value"] for m in rm["meanings"] if m["lang"] == "en"][:4],
            "eum": HANGUL.get(k) or [r["value"] for r in rm["readings"] if r["type"] == "korean_h"],
            "strokes": KDIC[k]["misc"]["strokeCounts"][0] if KDIC.get(k) else None,
            "parts": [p for p in KRAD.get(k, []) if p != k],
        }
    deck = {"deck": f"N{level}", "kanji_list": deck_kanji, "kanji": kanji, "cards": cards}
    json.dump(deck, open(OUT / f"deck-n{level}.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    todo = {
        "cards": [{"id": c["id"], "word": c["word"], "reading": c["reading"], "gloss_en": c["gloss_en"]} for c in cards],
        "kanji": [{"k": k, "eum": v["eum"], "meaning_en": v["meaning_en"]} for k, v in kanji.items()],
        "sentences": [
            {"id": c["id"], "ja": c["example"]["ja"], "en": c["example"]["en"], "ko_tatoeba": c["example"]["ko_tatoeba"]}
            for c in cards if c["example"]
        ],
    }
    json.dump(todo, open(KO / f"todo-n{level}.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    report[f"N{level}"] = {
        "kanji": len(deck_kanji), "cards": len(cards), "missing_kanji": missing,
        "no_example": sum(1 for c in cards if not c["example"]),
        "per_kanji": round(len(cards) / len(deck_kanji), 2),
    }
print(json.dumps(report, ensure_ascii=False, indent=1))
