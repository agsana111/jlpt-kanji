"""Kanji structure for the card back: meaning part + sound part, and a family of look-alikes.

Run from the project root:  python -I pipeline/build_structure.py
Reads pipeline/raw/* and pipeline/out/deck-n*.json,
writes pipeline/out/structure.json and pipeline/out/structure-review.tsv (for checking by eye).
Hand fixes go in pipeline/ko/structure-fix.tsv:  kanji<TAB>parts<TAB>sound
  parts = the 2-3 chunks, space separated, e.g. "日 寺"; sound = the sound chunk or "-" for none.
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"

# 214 Kangxi radicals in order (number = index + 1)
RADICALS = (
    "一丨丶丿乙亅二亠人儿入八冂冖冫几凵刀力勹匕匚匸十卜卩厂厶又口囗土士夂夊夕大女子宀寸小尢尸屮山巛工己巾干幺广廴廾弋弓彐彡彳"
    "心戈戶手支攴文斗斤方无日曰月木欠止歹殳毋比毛氏气水火爪父爻爿片牙牛犬玄玉瓜瓦甘生用田疋疒癶白皮皿目矛矢石示禸禾穴立"
    "竹米糸缶网羊羽老而耒耳聿肉臣自至臼舌舛舟艮色艸虍虫血行衣襾見角言谷豆豕豸貝赤走足身車辛辰辵邑酉釆里金長門阜隶隹雨靑非"
    "面革韋韭音頁風飛食首香馬骨高髟鬥鬯鬲鬼魚鳥鹵鹿麥麻黃黍黑黹黽鼎鼓鼠鼻齊齒龍龜龠"
)
assert len(RADICALS) == 214, len(RADICALS)

# KRADFILE writes some components as a stand-in kanji; this is the shape seen inside a kanji
KRAD_SHAPE = {
    "化": "亻", "汁": "氵", "扎": "扌", "艾": "艹", "込": "辶", "刈": "刂", "忙": "忄", "尚": "⺌",
    "杰": "灬", "阡": "阝", "邦": "阝", "犯": "犭", "礼": "礻", "初": "衤", "老": "耂", "并": "丷",
    "个": "𠆢", "乞": "𠂉", "滴": "啇", "買": "買", "疔": "疒", "禹": "禸", "冊": "冊", "无": "旡",
    "ハ": "八", "ヨ": "彐", "｜": "丨", "ノ": "丿", "マ": "龴", "ユ": "ユ", "九": "九",
}
# radical number -> the shape it usually takes when it is a side part
RADICAL_SHAPE = {
    9: "亻", 18: "刂", 61: "忄", 64: "扌", 85: "氵", 86: "灬", 94: "犭", 113: "礻", 140: "艹",
    145: "衤", 162: "辶", 163: "阝", 170: "阝", 130: "月", 96: "王", 122: "罒", 125: "耂",
    66: "攵", 174: "青", 201: "黄", 211: "歯", 213: "亀", 165: "釆", 63: "戸",
}
# if the radical's own KRADFILE stand-in is present, use that shape
RADICAL_KRAD = {9: "化", 18: "刈", 61: "忙", 64: "扎", 85: "汁", 86: "杰", 94: "犯", 113: "礼", 140: "艾",
                145: "初", 162: "込", 163: "邦", 170: "阡", 125: "老"}


# short Korean meaning of each radical, in the same order as RADICALS
RADICAL_KO = (
    "하나 뚫다 점 삐침 새 갈고리 둘 머리 사람 사람 들다 여덟 멀다 덮다 얼음 안석 그릇 칼 힘 싸다 숟가락 상자 감추다 열 점치다 "
    "무릎 언덕 나 손 입 에워싸다 흙 선비 뒤져오다 천천히걷다 저녁 크다 여자 아이 집 마디 작다 절름발이 몸 싹 산 내 장인 몸 수건 방패 "
    "작다 집 길게걷다 두손 주살 활 돼지머리 털 걷다 마음 창 문 손 가지 치다 글월 말 도끼 모 없다 해 말하다 달 나무 하품 그치다 "
    "죽음 몽둥이 말다 견주다 털 성씨 기운 물 불 손톱 아버지 효 나뭇조각 조각 어금니 소 개 검다 구슬 오이 기와 달다 나다 쓰다 밭 발 "
    "병 걷다 희다 가죽 그릇 눈 창 화살 돌 제사 발자국 벼 구멍 서다 대나무 쌀 실 항아리 그물 양 깃 늙다 말잇다 쟁기 귀 붓 고기 신하 "
    "스스로 이르다 절구 혀 어그러지다 배 머무르다 빛 풀 범 벌레 피 다니다 옷 덮다 보다 뿔 말씀 골짜기 콩 돼지 짐승 조개 붉다 달리다 "
    "발 몸 수레 맵다 별 가다 고을 술 분별하다 마을 쇠 길다 문 언덕 미치다 새 비 푸르다 아니다 얼굴 가죽 가죽 부추 소리 머리 바람 "
    "날다 먹다 머리 향기 말 뼈 높다 머리털 싸우다 술 솥 귀신 물고기 새 소금 사슴 보리 삼 누렇다 기장 검다 바느질 맹꽁이 솥 북 쥐 "
    "코 가지런하다 이 용 거북 피리"
).split()
assert len(RADICAL_KO) == 214, len(RADICAL_KO)
RADICAL_KO = [w.replace("천천히걷다", "천천히 걷다").replace("길게걷다", "길게 걷다").replace("두손", "두 손")
              .replace("돼지머리", "돼지 머리").replace("말잇다", "말 잇다").replace("뒤져오다", "뒤져 오다") for w in RADICAL_KO]
# meaning of a radical when it appears in a side form (몸/고기 for 月 from 肉, 언덕 vs 고을 for 阝)
SHAPE_KO = {130: "몸, 고기", 72: "해, 날", 74: "달", 113: "제사", 9: "사람", 162: "가다", 85: "물", 64: "손"}


def load_unihan(name, field):
    out = {}
    for line in open(RAW / name, encoding="utf-8"):
        p = line.rstrip("\n").split("\t")
        if len(p) == 3 and p[1] == field:
            out[chr(int(p[0][2:], 16))] = p[2]
    return out


def kata_to_hira(s):
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


KRAD = json.load(open(RAW / "kradfile-3.6.2.json", encoding="utf-8"))["kanji"]
KD = {c["literal"]: c for c in json.load(open(RAW / "kanjidic2-en-3.6.2.json", encoding="utf-8"))["characters"]}
PHON = {k: set(v.replace("*", "").split()) for k, v in load_unihan("Unihan_DictionaryLikeData.txt", "kPhonetic").items()}
RS = load_unihan("Unihan_IRGSources.txt", "kRSUnicode")

UNIVERSE = []  # deck kanji N5..N2
LEVEL = {}
for n in (5, 4, 3, 2):
    d = json.load(open(ROOT / "out" / f"deck-n{n}.json", encoding="utf-8"))
    for k in d["kanji_list"]:
        UNIVERSE.append(k)
        LEVEL[k] = n
USET = set(UNIVERSE)


def on_readings(k):
    c = KD.get(k)
    if not c or not c.get("readingMeaning"):
        return []
    return [kata_to_hira(r["value"]) for g in c["readingMeaning"]["groups"] for r in g["readings"] if r["type"] == "ja_on"]


def strokes(k):
    c = KD.get(k)
    return c["misc"]["strokeCounts"][0] if c else 99


UNVOICE = str.maketrans("がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ", "かきくけこさしすせそたちつてとはひふへほはひふへほ")


def norm(r):
    r = r.translate(UNVOICE)
    r = re.sub(r"[っつちくきう]$", "", r) if len(r) > 1 else r  # 学 がく ~ 覚 かく, 発 はつ ~ はっ
    return r


def sound_matches(k, part):
    a = {norm(r) for r in on_readings(k)}
    b = {norm(r) for r in on_readings(part)}
    return bool(a & b)


def pset(k):
    return set(KRAD.get(k, [])) - {k}


def contains(k, part):
    """part's components are all inside k (part itself may be listed as one component)."""
    if part in KRAD.get(k, []):
        return True
    ps = pset(part)
    return bool(ps) and ps <= pset(k) and part != k


def radical_of(k):
    rs = RS.get(k, "").split()[0] if RS.get(k) else ""
    m = re.match(r"(\d+)", rs)
    return int(m.group(1)) if m else None


def radical_shape(k, num):
    if num is None:
        return None
    if num in RADICAL_KRAD and RADICAL_KRAD[num] in KRAD.get(k, []):
        return RADICAL_SHAPE[num]
    base = RADICALS[num - 1]
    shapes = {base, RADICAL_SHAPE.get(num, base)}
    for p in KRAD.get(k, []):
        if KRAD_SHAPE.get(p, p) in shapes:
            return KRAD_SHAPE.get(p, p)
    return RADICAL_SHAPE.get(num, base) if num in (130, 96, 174, 201, 211, 213, 63, 66, 122) else base


RAD_INDEX = {c: i for i, c in enumerate(RADICALS)}

# characters a learner may meet: deck kanji, radicals, or kanji with a school grade / frequency rank
# (keeps out 咯, 阳, 娄 ... that share components but nobody reads)
def common(c):
    m = KD.get(c, {}).get("misc", {})
    return c in USET or c in RAD_INDEX or bool(m.get("grade") or m.get("frequency") or m.get("jlptLevel"))


CANDIDATES = [c for c in KRAD if c in KD and common(c)]


def find_sound_part(k):
    groups = PHON.get(k, set())
    if not groups:
        return None
    best = None
    for c in CANDIDATES:
        if c == k or not (PHON.get(c, set()) & groups) or not contains(k, c):
            continue
        # a real part is smaller than the kanji (塒 has the same parts as 時 but is not inside it)
        if strokes(c) >= strokes(k) or (c not in KRAD.get(k, []) and len(pset(c)) >= len(pset(k))):
            continue
        key = (len(pset(c)) or 1, c in USET, -strokes(c))
        if best is None or key > best[0]:
            best = (key, c)
    return best[1] if best else None


def find_rest(k, rad_shape, rad_num):
    """The chunk left after taking the radical away, if it is one known character or component."""
    rad_parts = {p for p in KRAD.get(k, []) if KRAD_SHAPE.get(p, p) == rad_shape or p == RADICALS[rad_num - 1]}
    rest = pset(k) - rad_parts
    if not rest:
        return None
    if len(rest) == 1:
        p = next(iter(rest))
        return KRAD_SHAPE.get(p, p)
    best = None
    for c in CANDIDATES:
        # only shapes a learner can name: deck kanji or radicals (not 旧 standing in for the inside of 由)
        if c != k and pset(c) == rest and strokes(c) <= strokes(k) - strokes(rad_shape):
            key = (c in USET, -strokes(c))
            if best is None or key > best[0]:
                best = (key, c)
    return best[1] if best else None


# frame-like parts whose inside tells look-alikes apart
ENCLOSE = set("門囗广疒尸厂辶气行勹匚冂")
# radicals too general to make a useful "same meaning" family
WEAK_FAMILY = set("寸口又十彐冂冖八一乙亅二厶夂大小止田目工巾土日月金")

# strokes too plain to explain anything when they are one of only two chunks
TRIVIAL = set("一丨丶丿乙亅二三十卜八儿冂凵匕亠冖厶丷𠆢𠂉ハノ｜ヨマユ")


def load_fixes():
    fixes = {}
    p = ROOT / "ko" / "structure-fix.tsv"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            if not line.strip() or line.startswith("#"):
                continue
            k, parts, snd = (line.split("\t") + ["-"])[:3]
            fixes[k] = ([] if parts.strip() == "-" else parts.split(), None if snd.strip() in ("-", "") else snd.strip())
    return fixes


FIX = load_fixes()


def structure(k):
    if k in FIX:
        parts, snd = FIX[k]
        rad = radical_of(k)
        rs = radical_shape(k, rad)
        return [[p, "s" if p == snd else ("m" if p == rs else "o")] for p in parts], snd
    rad = radical_of(k)
    rs = radical_shape(k, rad)
    if rad is None or RADICALS[rad - 1] == k or rs == k:
        return [], None  # the kanji is itself a radical / basic shape
    snd = find_sound_part(k)
    if snd and snd != rs and sound_matches(k, snd):
        return [[rs, "m"], [snd, "s"]], snd
    if snd and snd == rs and sound_matches(k, snd):
        # the radical is the sound part too (字 = 宀 + 子 じ): the other chunk carries the meaning
        other = find_rest(k, rs, rad)
        return ([[other, "o"], [snd, "s"]] if other and other not in TRIVIAL else [[snd, "s"]]), snd
    rest = snd if snd and snd != rs else find_rest(k, rs, rad)
    if rest and rest != k and rs not in TRIVIAL and rest not in TRIVIAL and strokes(rest) >= 2:
        return [[rs, "m"], [rest, "o"]], None
    return [], None  # one radical plus scraps (中 = 丨 + 口, 年 = 干 ...) would only confuse


STRUCT = {k: structure(k) for k in UNIVERSE}


def sound_members(part, me):
    """Deck kanji built on `part` as a sound part: same sound group and the part is inside them."""
    out = []
    for o in UNIVERSE:
        if o in (me, part):
            continue
        if STRUCT[o][1] == part or (contains(o, part) and strokes(part) < strokes(o) and PHON.get(o, set()) & PHON.get(part, set())):
            out.append(o)
    # the ones whose reading really follows the part come first
    out.sort(key=lambda o: (not sound_matches(o, part), LEVEL[o] * -1))
    return out


def reading_like(o, part):
    """o's on-reading that matches the part, else its first on-reading."""
    ons = on_readings(o)
    pb = {norm(r) for r in on_readings(part)}
    for r in ons:
        if norm(r) in pb:
            return r
    return ons[0] if ons else ""


def family(k):
    """Up to 8 deck kanji that share a sound part (with the same sound group) or a distinctive chunk."""
    parts, snd = STRUCT[k]
    # the sound family: by this kanji's sound part, or by a part that sounds like it (特 -> 寺), or by itself (寺)
    for base in [snd, k] + [p for p, r in parts if r == "o"]:
        if not base or base not in PHON:
            continue
        mem = sound_members(base, k)
        matching = sum(1 for o in mem if sound_matches(o, base))
        # a part that is not this kanji's own sound part only counts if it really carries a sound in 2+ kanji
        need = 1 if base in (snd, k) else 2
        if mem and matching >= need:
            return {"by": base, "t": "s", "k": [[o, reading_like(o, base), 0 if sound_matches(o, base) else 1] for o in mem[:8]]}
    # otherwise: the most distinctive chunk shared by 2..8 deck kanji (門 -> 問 聞 開 閉 関)
    best = None
    rad = radical_of(k)
    rs = radical_shape(k, rad)
    cands = parts if parts else ([[rs, "m"]] if rs and rs != k else [])
    for p, role in cands:
        if strokes(p) < 4 and not (role == "m" and strokes(p) >= 3):
            continue
        if role == "m" and p in WEAK_FAMILY:
            continue
        if role == "m" and strokes(p) < 6:
            mem = [o for o in UNIVERSE if o not in (k, p) and radical_of(o) == rad and any(q == p for q, _ in STRUCT[o][0])]
        else:
            mem = [o for o in UNIVERSE if o not in (k, p) and (p in KRAD.get(o, []) or any(q == p for q, _ in STRUCT[o][0]))]
        if 2 <= len(mem) <= (8 if p in ENCLOSE else 6):
            key = (role != "m", strokes(p), -len(mem))
            if best is None or key > best[0]:
                best = (key, p, mem)
    if best:
        _, p, mem = best
        out = []
        for o in mem:
            # the inside of a frame is what tells 問 聞 間 apart; for other chunks it is noise
            rest = [q for q, _ in STRUCT[o][0] if q != p] if p in ENCLOSE else []
            out.append([o, rest[0] if len(rest) == 1 else "", 0])
        return {"by": p, "t": "p", "k": out}
    return None


# Korean hun-eum of deck kanji ("절 사" -> meaning "절"), for labelling parts that are kanji themselves
HUN = {}
for _p in sorted((ROOT / "ko").glob("n[0-9].json")):
    HUN.update(json.load(open(_p, encoding="utf-8")).get("kanji", {}))
SHAPE_RAD = {}
for num, shape in RADICAL_SHAPE.items():
    SHAPE_RAD.setdefault(shape, num)


def part_meaning(p, k):
    """Short Korean meaning of a part as it is used in kanji k."""
    if p == radical_shape(k, radical_of(k)):
        num = radical_of(k)
        return SHAPE_KO.get(num, RADICAL_KO[num - 1])
    if p in RAD_INDEX and p not in USET:
        return RADICAL_KO[RAD_INDEX[p]]
    if p in HUN:
        return HUN[p]
    if p in RAD_INDEX:
        return RADICAL_KO[RAD_INDEX[p]]
    if p in SHAPE_RAD:
        return SHAPE_KO.get(SHAPE_RAD[p], RADICAL_KO[SHAPE_RAD[p] - 1])
    return ""


def labelled(k):
    parts, snd = STRUCT[k]
    out = []
    for p, role in parts:
        label = reading_like(k, p) if role == "s" else part_meaning(p, k)
        out.append([p, role, label])
    return out


if __name__ == "__main__":
    out, rows = {}, []
    for k in UNIVERSE:
        parts, snd = STRUCT[k]
        fam = family(k)
        out[k] = {"p": labelled(k), "f": fam}
        rows.append("\t".join([
            k, f"N{LEVEL[k]}", " + ".join(f"{p}({'소리' if r == 's' else '뜻' if r == 'm' else ''}·{lab})" for p, r, lab in out[k]["p"]),
            "" if not fam else f"{fam['by']}{'소리' if fam['t'] == 's' else ''}: " + " ".join(o + (f"[{n}]" if n else "") + ("*" if x else "") for o, n, x in fam["k"]),
        ]))
    json.dump(out, open(ROOT / "out" / "structure.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    (ROOT / "out" / "structure-review.tsv").write_text("\n".join(rows) + "\n", encoding="utf-8")
    n_s = sum(1 for v in out.values() if any(r == "s" for _, r, _ in v["p"]))
    print(f"{len(out)} kanji, {n_s} with a sound part, {sum(1 for v in out.values() if v['f'])} with a family")
