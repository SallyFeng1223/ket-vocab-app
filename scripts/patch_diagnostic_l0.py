"""A4 修補：把 80 題診斷清單裡不適合當 L0 四選一的字換掉，其餘 74 題原封不動。

不適合的判定：headword 長度 <= 2、含句點的縮寫、全大寫縮寫、
或詞性是 prep / conj / det / pron / mv / exclam。

替換來源：同一層級（Starters/Movers/KET_HIGH/KET_LOW）的候選池，
且未出現在目前 80 題裡、詞性是 n/v/adj、本身也通過上述適合性判定。
"""

import csv
import json
import random
from pathlib import Path

import build_diagnostic_l0 as base

REVIEW_CSV = base.REVIEW_CSV
OUTPUT_SQL = base.OUTPUT_SQL
PATCH_SEED = 20260824

BAD_POS = {"prep", "conj", "det", "pron", "mv", "exclam"}
GOOD_POS = {"n", "v", "adj"}


def unsuitable_reasons(headword: str, pos: str) -> list[str]:
    reasons = []
    if len(headword) <= 2:
        reasons.append("長度<=2")
    if "." in headword:
        reasons.append("含句點縮寫")
    if headword.isupper() and len(headword) > 1:
        reasons.append("全大寫縮寫")
    if pos in BAD_POS:
        reasons.append(f"詞性={pos}")
    return reasons


def is_unsuitable(headword: str, pos: str) -> bool:
    return bool(unsuitable_reasons(headword, pos))


def load_current() -> list[dict]:
    return list(csv.DictReader(REVIEW_CSV.open(encoding="utf-8")))


def main() -> None:
    current = load_current()
    words = base.load_words()
    pools = base.build_pools(words)

    used_headwords = {row["單字"] for row in current}
    rng = random.Random(PATCH_SEED)

    replacements = []  # (old_row, new_word_dict)
    for row in current:
        if is_unsuitable(row["單字"], row["詞性"]):
            tier = row["分層"]
            pool = pools[tier]
            candidates = [
                w for w in pool
                if w["headword"] not in used_headwords
                and w["pos"] in GOOD_POS
                and not is_unsuitable(w["headword"], w["pos"])
            ]
            if not candidates:
                raise RuntimeError(f"{tier} 層找不到可替換的候選字")
            rng.shuffle(candidates)
            new_word = candidates[0]
            used_headwords.add(new_word["headword"])
            replacements.append((row, new_word))

    print(f"共替換 {len(replacements)} 個字：")
    updated_rows = []
    replacement_map = {old["序號"]: (old, new) for old, new in replacements}

    for row in current:
        if row["序號"] in replacement_map:
            old, new = replacement_map[row["序號"]]
            distractors = base.pick_distractors(new, words, rng)
            reasons = "、".join(unsuitable_reasons(old["單字"], old["詞性"]))
            print(
                f"  #{row['序號']:>2s} [{row['分層']}] "
                f"{old['單字']}（{old['詞性']}，{old['正確答案']}） "
                f"→ {new['headword']}（{new['pos']}，{new['zh']}）"
                f"  理由：{reasons}"
            )
            updated_rows.append(
                {
                    "序號": row["序號"],
                    "分層": row["分層"],
                    "單字": new["headword"],
                    "詞性": new["pos"],
                    "正確答案": new["zh"],
                    "干擾選項1": distractors[0],
                    "干擾選項2": distractors[1],
                    "干擾選項3": distractors[2],
                }
            )
        else:
            updated_rows.append(row)

    # 重寫 review CSV
    with REVIEW_CSV.open("w", newline="", encoding="utf-8") as f:
        fieldnames = ["序號", "分層", "單字", "詞性", "正確答案", "干擾選項1", "干擾選項2", "干擾選項3"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(updated_rows)

    # 重寫 SQL
    rows_sql = []
    for r in updated_rows:
        payload = json.dumps(
            {"distractors_zh": [r["干擾選項1"], r["干擾選項2"], r["干擾選項3"]]},
            ensure_ascii=False,
        )
        rows_sql.append("(" + base.sql_str(r["單字"]) + ", " + base.sql_str(payload) + ")")

    lines = []
    lines.append("-- ============================================================")
    lines.append("-- A4 診斷抽樣 80 字 — L0（英→中四選一）題目")
    lines.append("-- 分層：Starters 15 / Movers 30 / KET-only 高頻具體 20 / KET-only 低頻抽象 15")
    lines.append("-- word_id 用 headword 對照 words 表查出，不需預先知道 UUID")
    lines.append("-- 已排除不適合 L0 四選一的字（過短/縮寫/虛詞），改抽同層級的實詞")
    lines.append("-- ============================================================")
    lines.append("")
    lines.append("insert into items (word_id, skill, prompt, answer, payload, status, qa_checked, content_version)")
    lines.append("select w.id, 'L0', w.headword, w.zh, v.payload::jsonb, 'active', false, 1")
    lines.append("from words w")
    lines.append("join (values")
    lines.append(",\n".join("  " + r for r in rows_sql))
    lines.append(") as v(headword, payload)")
    lines.append("on w.headword = v.headword;")
    lines.append("")
    lines.append("")
    lines.append("-- ============================================================")
    lines.append("-- 驗收：應新增 80 筆 L0 診斷題目")
    lines.append("-- ============================================================")
    lines.append("select count(*) as 診斷題目筆數 from items where skill = 'L0' and qa_checked = false;")

    OUTPUT_SQL.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n已覆寫 {OUTPUT_SQL}")
    print(f"已覆寫 {REVIEW_CSV}")


if __name__ == "__main__":
    main()
