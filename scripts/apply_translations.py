"""A3 步驟 3→4 橋接：把 skeleton csv 跟一份 {headword: (zh, concreteness)} 字典合併，
補上 topics='{}'、status='active'，輸出 build_sql_batch.py 吃的批次 CSV。

用法：python3 scripts/apply_translations.py <skeleton.csv> <translations_module.py> <out_batch_no>
"""

import csv
import importlib.util
import sys
from pathlib import Path


def load_translations(module_path: str) -> dict:
    spec = importlib.util.spec_from_file_location("translations", module_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.TRANSLATIONS


def main() -> None:
    skeleton_path, module_path, batch_no = sys.argv[1], sys.argv[2], sys.argv[3]
    translations = load_translations(module_path)

    rows = list(csv.DictReader(open(skeleton_path, encoding="utf-8")))

    missing = [r["headword"] for r in rows if r["headword"] not in translations]
    if missing:
        print(f"缺少翻譯，共 {len(missing)} 筆：")
        for hw in missing:
            print(" -", hw)
        sys.exit(1)

    extra = set(translations) - {r["headword"] for r in rows}
    if extra:
        print(f"[警告] 翻譯字典裡有 {len(extra)} 筆不在這批 skeleton 內（將被忽略）：{sorted(extra)}")

    out_path = Path("data/batch_input") / f"batch_{batch_no}.csv"
    with out_path.open("w", newline="", encoding="utf-8") as f:
        fieldnames = ["headword", "pos", "zh", "level_tags", "topics", "sense_note", "is_phrasal", "concreteness", "status"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in rows:
            zh, conc = translations[r["headword"]]
            writer.writerow(
                {
                    "headword": r["headword"],
                    "pos": r["pos"],
                    "zh": zh,
                    "level_tags": r["level_tags"],
                    "topics": "{}",
                    "sense_note": r["sense_note"],
                    "is_phrasal": r["is_phrasal"],
                    "concreteness": conc,
                    "status": "active",
                }
            )
    print(f"寫入 {out_path}，共 {len(rows)} 筆")


if __name__ == "__main__":
    main()
