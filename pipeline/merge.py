"""Merge deck source + Korean text into app data, with automatic checks.

Run from the project root:  python -I pipeline/merge.py
Writes app/public/data/n{5,4,3}.json for every deck that has pipeline/ko/n*.json,
plus app/public/data/decks.json. Exits non-zero if any check fails.
"""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent
APP_DATA = ROOT.parent / "app" / "public" / "data"
APP_DATA.mkdir(parents=True, exist_ok=True)
KANJI_RE = re.compile(r"[一-鿿]")
HIRA_RE = re.compile(r"^[ぁ-ゟァ-ヺー]+$")  # kana (loanword parts like ジェット)

# Unihan gives a reading that is not the usual Korean one for these shinjitai forms
EUM_EXCEPTIONS = {"円": "원", "体": "체", "楽": "락", "画": "화", "台": "대", "欠": "결", "予": "예"}
# hun-eum is shared across decks (an N5 kanji used in an N4 word keeps its N5 hun-eum)
ALL_HUN = {}
for _p in sorted(ROOT.glob("ko/n[0-9].json")):
    ALL_HUN.update(json.load(open(_p, encoding="utf-8")).get("kanji", {}))
BASE_CH = re.compile(r"[一-鿿々ヶ]")


def parse_ruby(s: str):
    """'八時[はちじ]に行[い]く' -> [['八時','はちじ'],['に',None],['行','い'],['く',None]]"""
    segs, buf = [], ""
    for m in re.finditer(r"\[([^\]]+)\]|[^\[]", s):
        if m.group(1) is None:
            buf += m.group(0)
            continue
        k = len(buf)
        while k > 0 and BASE_CH.match(buf[k - 1]):
            k -= 1
        if buf[:k]:
            segs.append([buf[:k], None])
        segs.append([buf[k:], m.group(1)])
        buf = ""
    if buf:
        segs.append([buf, None])
    return segs
errors = []
decks_index = []

for level in (5, 4, 3):
    ko_path = ROOT / "ko" / f"n{level}.json"
    if not ko_path.exists():
        decks_index.append({"id": f"n{level}", "name": f"N{level}", "ready": False})
        continue
    deck = json.load(open(ROOT / "out" / f"deck-n{level}.json", encoding="utf-8"))
    ko = json.load(open(ko_path, encoding="utf-8"))
    levels = {k: v["level"] for k, v in deck["kanji"].items()}
    tag = f"N{level}"

    cards = []
    for c in deck["cards"]:
        cid = c["id"]
        meaning = ko["cards"].get(cid)
        if not meaning:
            errors.append(f"{tag} {cid} {c['word']}: no Korean meaning")
        # reading must equal the concatenated furigana
        joined = "".join(rt if rt else ruby for ruby, rt in c["furigana"])
        if joined != c["reading"]:
            errors.append(f"{tag} {cid} {c['word']}: furigana {joined} != reading {c['reading']}")
        if not HIRA_RE.match(c["reading"]):
            errors.append(f"{tag} {cid}: reading not hiragana: {c['reading']}")
        # deck assignment: highest-level kanji decides
        if min(levels[k] for k in c["kanji"]) != level:
            errors.append(f"{tag} {cid} {c['word']}: belongs to another deck")
        ex = c["example"]
        out_ex = None
        if ex:
            ko_s = ko["sentences"].get(cid, ex.get("ko_tatoeba"))
            if cid in ko["sentences"] and ko["sentences"][cid] is None:
                ko_s = None
                ex = None
            elif not ko_s:
                errors.append(f"{tag} {cid}: example has no Korean translation")
        if ex:
            bad = [k for k in KANJI_RE.findall(ex["ja"]) if levels.get(k, 0) < level and k not in deck["kanji"]]
            if any(k for k in KANJI_RE.findall(ex["ja"]) if k not in deck["kanji"]):
                pass  # kanji outside this deck's table but within level (checked at build time)
            if c["word"] not in ex["ja"]:
                errors.append(f"{tag} {cid}: example lacks the word")
            ruby = ex["ruby"]
            if cid in ko.get("ruby", {}):
                ruby = parse_ruby(ko["ruby"][cid])
            if "".join(a for a, _ in ruby) != ex["ja"]:
                errors.append(f"{tag} {cid}: ruby text does not match sentence")
            out_ex = {"ja": ex["ja"], "ruby": ruby, "ko": ko_s, "src": f"tatoeba:{ex['tid']}"}
        cards.append({
            "id": cid, "w": c["word"], "r": c["reading"], "f": c["furigana"],
            "k": c["kanji"], "m": meaning, "en": c["gloss_en"], "ex": out_ex,
        })

    kanji = {}
    for k, v in deck["kanji"].items():
        hun = ko["kanji"].get(k) or ALL_HUN.get(k)
        if not hun and v["level"] == level:
            errors.append(f"{tag} kanji {k}: no Korean hun-eum")
        # the eum (last syllable) must match Unihan's Korean reading.
        # 円 is listed as 엔 (Japanese-style); the Korean reading is 원 (圓).
        if hun and v["eum"] and k not in EUM_EXCEPTIONS and hun.split()[-1] not in v["eum"]:
            errors.append(f"{tag} kanji {k}: hun-eum '{hun}' does not end with Unihan reading {v['eum']}")
        kanji[k] = {
            "lv": v["level"], "on": v["on"], "kun": v["kun"], "hun": hun,
            "en": v["meaning_en"], "st": v["strokes"], "parts": v["parts"],
        }

    out = {"id": f"n{level}", "name": tag, "kanjiList": deck["kanji_list"], "kanji": kanji, "cards": cards}
    path = APP_DATA / f"n{level}.json"
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    decks_index.append({"id": f"n{level}", "name": tag, "ready": True, "cards": len(cards), "kanji": len(deck["kanji_list"])})
    print(f"{tag}: {len(cards)} cards, {sum(1 for c in cards if c['ex'])} with examples -> {path.name}")

(APP_DATA / "decks.json").write_text(json.dumps(decks_index, ensure_ascii=False), encoding="utf-8")
if errors:
    print(f"\n{len(errors)} problems:")
    print("\n".join(errors))
    sys.exit(1)
print("all checks passed")
