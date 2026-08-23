"""A3 步驟 4：把一批已填好 zh/concreteness 的 CSV 轉成 insert SQL。

輸入：data/batch_input/batch_NN.csv
  欄位：headword,pos,zh,level_tags,topics,sense_note,is_phrasal,concreteness,status
輸出：data/sql/A3_words_batch_NN.sql

用法：python3 scripts/build_sql_batch.py NN "標籤說明"
"""

import csv
import sys
from pathlib import Path

INPUT_DIR = Path("data/batch_input")
OUTPUT_DIR = Path("data/sql")


def sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def sql_or_null(s: str) -> str:
    return "null" if not s.strip() else sql_str(s)


def main() -> None:
    batch_no = sys.argv[1]
    label = sys.argv[2] if len(sys.argv) > 2 else ""

    in_path = INPUT_DIR / f"batch_{batch_no}.csv"
    out_path = OUTPUT_DIR / f"A3_words_batch_{batch_no}.sql"

    rows = list(csv.DictReader(in_path.open(encoding="utf-8")))

    errors = []
    for r in rows:
        if not r["headword"].strip():
            errors.append(f"空 headword: {r}")
        if not r["zh"].strip():
            errors.append(f"zh 為空: {r['headword']}")
        try:
            c = int(r["concreteness"])
            if not (1 <= c <= 5):
                errors.append(f"concreteness 超出範圍: {r['headword']} = {c}")
        except ValueError:
            errors.append(f"concreteness 不是整數: {r['headword']} = {r['concreteness']!r}")
        if r["pos"] not in {"n", "v", "adj", "adv", "prep", "conj", "pron", "det", "mv", "phr v", "exclam"}:
            errors.append(f"pos 不合法: {r['headword']} = {r['pos']!r}")
        if r["status"] != "active":
            errors.append(f"status 不是 active: {r['headword']}")

    if errors:
        print(f"發現 {len(errors)} 個問題，未產生 SQL：")
        for e in errors[:50]:
            print(" -", e)
        sys.exit(1)

    lines = []
    lines.append("-- " + "=" * 60)
    lines.append(f"-- A3 骨架資料 — 批次 {batch_no}{'：' + label if label else ''}")
    lines.append(f"-- 本批 {len(rows)} 筆")
    lines.append("-- on conflict do nothing：重跑本檔不會產生重複資料。")
    lines.append("-- " + "=" * 60)
    lines.append("")
    lines.append("insert into words")
    lines.append("  (headword, pos, zh, level_tags, topics, sense_note, is_phrasal, concreteness, status)")
    lines.append("values")

    value_lines = []
    for r in rows:
        is_phrasal = "true" if r["is_phrasal"].strip().lower() in ("true", "1", "yes") else "false"
        value_lines.append(
            "("
            + ", ".join(
                [
                    sql_str(r["headword"]),
                    sql_str(r["pos"]),
                    sql_str(r["zh"]),
                    sql_str(r["level_tags"]),
                    sql_str(r["topics"] or "{}"),
                    sql_or_null(r["sense_note"]),
                    is_phrasal,
                    r["concreteness"],
                    sql_str(r["status"]),
                ]
            )
            + ")"
        )
    lines.append(",\n".join(value_lines))
    lines.append("on conflict (headword) do nothing;")
    lines.append("")
    lines.append("")
    lines.append("-- " + "=" * 60)
    lines.append(f"-- 驗收：本批應新增 {len(rows)} 筆（若 headword 已存在則會被略過）")
    lines.append("-- " + "=" * 60)
    lines.append("select count(*) as 目前總筆數 from words;")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"寫入 {out_path}，共 {len(rows)} 筆")


if __name__ == "__main__":
    main()
