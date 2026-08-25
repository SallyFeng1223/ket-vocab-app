"""B0-2：L1 辨形 payload 生成腳本（規則式，不用 LLM，見規劃書 §5.6）。

輸入：data/words_snapshot.csv
輸出：data/sql/B0_items_L1_NN.sql，每檔最多 BATCH_SIZE 筆

規則：
- items.prompt = 中文釋義（w.zh），items.answer = headword（正確拼法）
- 依 §5.6 規則庫（優先序固定：雙寫去一個 → 字尾多寫一個 → 母音互換 → 常見字尾誤拼 → ph/f 互換）
  產生候選錯誤拼法，依序取前 2 個「合法」的當 wrong_spellings
- 合法條件：不等於正確拼法本身、彼此不重複、且不是 words 表裡另一個真實存在的 headword
  （硬性檢查，避免例如 their → there 這種撞到真字的情況）
- 規則套用後湊不到 2 個合法候選的字：不生成 L1 題，只留給 L2
- 大小寫沿用原始 headword（跟 L0 一致，例如 April 這類專有名詞不強制轉小寫）
- 含空格的多字條目、含特殊字元（. ' - é）的字：本批次跳過，理由同 L2（B3 再決定
  怎麼處理連字號/句點/撇號），不受長度上限影響（長度上限只套用在 L2 的磚塊數控制上）
"""

import csv
import json
import re
from pathlib import Path

INPUT = Path("data/words_snapshot.csv")
OUTPUT_DIR = Path("data/sql")
BATCH_SIZE = 350

SPECIAL_CHAR_PATTERN = re.compile(r"[()'./\-éÉ]")


def sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def rule_double_letter_removed(w: str) -> list[str]:
    cands = []
    for i in range(len(w) - 1):
        if w[i] == w[i + 1] and w[i].isalpha():
            cands.append(w[:i] + w[i + 1 :])
    return cands


def rule_double_last_letter(w: str) -> list[str]:
    if w and w[-1].isalpha():
        return [w + w[-1]]
    return []


def rule_vowel_swap(w: str) -> list[str]:
    cands = []
    if "ie" in w:
        i = w.index("ie")
        cands.append(w[:i] + "ei" + w[i + 2 :])
    if "ei" in w:
        i = w.index("ei")
        cands.append(w[:i] + "ie" + w[i + 2 :])
    if "a" in w:
        i = w.index("a")
        cands.append(w[:i] + "e" + w[i + 1 :])
    if "e" in w:
        i = w.index("e")
        cands.append(w[:i] + "a" + w[i + 1 :])
    return cands


def rule_suffix_swap(w: str) -> list[str]:
    cands = []
    for suf, repl in (("tion", "sion"), ("sion", "tion"), ("able", "ible"), ("ible", "able")):
        if w.endswith(suf):
            cands.append(w[: -len(suf)] + repl)
    return cands


def rule_ph_f_swap(w: str) -> list[str]:
    cands = []
    if "ph" in w:
        i = w.index("ph")
        cands.append(w[:i] + "f" + w[i + 2 :])
    if "f" in w:
        i = w.index("f")
        cands.append(w[:i] + "ph" + w[i + 1 :])
    return cands


RULES = [
    rule_double_letter_removed,
    rule_double_last_letter,
    rule_vowel_swap,
    rule_suffix_swap,
    rule_ph_f_swap,
]


def generate_wrong_spellings(headword: str, real_words_lower: set[str]) -> list[str]:
    seen_lower = {headword.lower()}
    result = []
    for rule in RULES:
        for cand in rule(headword):
            cl = cand.lower()
            if cl in seen_lower:
                continue
            if cl in real_words_lower:
                continue
            seen_lower.add(cl)
            result.append(cand)
            if len(result) == 2:
                return result
    return result


def write_batch(rows: list[tuple[str, dict]], batch_no: int) -> Path:
    lines = []
    lines.append("-- " + "=" * 60)
    lines.append(f"-- B0-2 L1 辨形 payload — 批次 {batch_no:02d}，本批 {len(rows)} 筆")
    lines.append("-- 規則式生成，qa_checked 直接設 true（規劃書 §5.6：不需人工抽查）")
    lines.append("-- " + "=" * 60)
    lines.append("")
    lines.append("insert into items (word_id, skill, prompt, answer, payload, status, qa_checked, content_version)")
    lines.append("select w.id, 'L1', w.zh, w.headword, v.payload::jsonb, 'active', true, 1")
    lines.append("from words w")
    lines.append("join (values")

    value_lines = [
        f"  ({sql_str(hw)}, {sql_str(json.dumps(payload, ensure_ascii=False))})"
        for hw, payload in rows
    ]
    lines.append(",\n".join(value_lines))
    lines.append(") as v(headword, payload)")
    lines.append("on w.headword = v.headword;")
    lines.append("")

    out_path = OUTPUT_DIR / f"B0_items_L1_{batch_no:02d}.sql"
    out_path.write_text("\n".join(lines), encoding="utf-8")
    return out_path


def main() -> None:
    rows = list(csv.DictReader(INPUT.open(encoding="utf-8")))
    real_words_lower = {r["headword"].lower() for r in rows}

    generated: list[tuple[str, dict]] = []
    skipped: list[tuple[str, str]] = []

    for r in rows:
        hw = r["headword"]
        if " " in hw:
            skipped.append((hw, "多字條目，同特殊字元一併延後（B3 再決定）"))
            continue
        if SPECIAL_CHAR_PATTERN.search(hw):
            skipped.append((hw, "特殊字元，同多字條目一併延後（B3 再決定）"))
            continue
        wrongs = generate_wrong_spellings(hw, real_words_lower)
        if len(wrongs) < 2:
            skipped.append((hw, f"規則湊不滿 2 個合法錯誤拼法（只找到 {len(wrongs)} 個：{wrongs}）"))
            continue
        payload = {"wrong_spellings": wrongs}
        generated.append((hw, payload))

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUTPUT_DIR.glob("B0_items_L1_*.sql"):
        old.unlink()

    batches = [generated[i : i + BATCH_SIZE] for i in range(0, len(generated), BATCH_SIZE)]
    written = []
    for i, batch in enumerate(batches, start=1):
        written.append(write_batch(batch, i))

    print(f"L1：共 {len(rows)} 字，生成 {len(generated)} 筆，跳過 {len(skipped)} 個字")
    print(f"寫出 {len(written)} 個檔案：")
    for p in written:
        print(f"  - {p}")

    print()
    reason_counts: dict[str, int] = {}
    for _, reason in skipped:
        if reason.startswith("規則湊不滿"):
            key = "規則湊不滿 2 個合法錯誤拼法"
        else:
            key = reason.split("，")[0].split("（")[0]
        reason_counts[key] = reason_counts.get(key, 0) + 1
    print(f"跳過清單分類統計（共 {len(skipped)} 個字）：")
    for key, count in sorted(reason_counts.items(), key=lambda kv: -kv[1]):
        print(f"  - {key}：{count} 個")

    print()
    print("跳過清單明細：")
    for hw, reason in skipped:
        print(f"  - {hw}：{reason}")


if __name__ == "__main__":
    main()
