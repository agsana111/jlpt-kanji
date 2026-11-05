"""Combine ko/n{N}-{cards,kanji,sent,ruby}.tsv into ko/n{N}.json.

TSV rows are `id<TAB>text`. Card/sentence ids are JMdict numbers without the 'j' prefix.
A sentence text of `-` drops that card's example sentence.
Usage:  python -I pipeline/tsv_to_json.py 3
"""
import json
import sys
from pathlib import Path

KO = Path(__file__).resolve().parent / "ko"
n = sys.argv[1]


def rows(name):
    p = KO / f"n{n}-{name}.tsv"
    if not p.exists():
        return []
    out = []
    for line in p.read_text(encoding="utf-8").splitlines():
        if line.strip():
            k, v = line.split("\t", 1)
            out.append((k.strip(), v.strip()))
    return out


data = {
    "cards": {"j" + k: v for k, v in rows("cards")},
    "kanji": dict(rows("kanji")),
    "ruby": {"j" + k: v for k, v in rows("ruby")},
    "sentences": {"j" + k: (None if v == "-" else v) for k, v in rows("sent")},
}
(KO / f"n{n}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
print({k: len(v) for k, v in data.items()})
