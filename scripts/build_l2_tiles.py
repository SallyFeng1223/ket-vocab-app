"""B0-1：L2 字母磚 payload 生成腳本（規則式，不用 LLM，見規劃書 §5.6）。

輸入：data/words_snapshot.csv（headword,pos,zh,level_tags,concreteness）
輸出：data/sql/B0_items_L2_NN.sql，每檔最多 BATCH_SIZE 筆

規則：
- items.prompt = 中文釋義（w.zh），items.answer = headword（他看中文，用字母磚拼出英文）
- tiles：headword 拆成字母陣列後打亂順序，大小寫沿用原始 headword（跟 L0 一致，不強制轉小寫）
- extra_tiles：從英文字母頻率表中，挑「不在這個字裡」的 2–3 個常見字母（隨機挑，固定 SEED 可重現）
- 長度 ≤ 2 的字不生成（a、an、I 這類太短，字母磚沒有訓練意義）
- 含空格的多字條目（swimming pool、look after…）本批次直接跳過，不生成 L2。
  理由：空格要不要當磚塊、要不要固定版面，屬於 renderer（B3）的互動設計問題，
  這支腳本只管 payload 資料本身，不預先幫 renderer 做決定。跳過的字列在清單裡供之後處理。
"""

import csv
import json
import random
from pathlib import Path

SEED = 20260825
INPUT = Path("data/words_snapshot.csv")
OUTPUT_DIR = Path("data/sql")
BATCH_SIZE = 350

# 英文字母出現頻率由高到低（ETAOIN SHRDLU 延伸版），用來挑「常見但不在此字中」的干擾字母
LETTER_FREQ = "etaoinshrdlucmfwypvbgkjqxz"


def sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def build_payload(headword: str, rng: random.Random) -> dict:
    tiles = list(headword)
    rng.shuffle(tiles)

    present = set(headword.lower())
    candidates = [c for c in LETTER_FREQ if c not in present]
    k = min(rng.choice([2, 3]), len(candidates))
    extra_tiles = rng.sample(candidates, k)

    return {"tiles": tiles, "extra_tiles": extra_tiles}


def write_batch(rows: list[tuple[str, dict]], batch_no: int) -> Path:
    lines = []
    lines.append("-- " + "=" * 60)
    lines.append(f"-- B0-1 L2 字母磚 payload — 批次 {batch_no:02d}，本批 {len(rows)} 筆")
    lines.append("-- 規則式生成，qa_checked 直接設 true（規劃書 §5.6：不需人工抽查）")
    lines.append("-- " + "=" * 60)
    lines.append("")
    lines.append("insert into items (word_id, skill, prompt, answer, payload, status, qa_checked, content_version)")
    lines.append("select w.id, 'L2', w.zh, w.headword, v.payload::jsonb, 'active', true, 1")
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

    out_path = OUTPUT_DIR / f"B0_items_L2_{batch_no:02d}.sql"
    out_path.write_text("\n".join(lines), encoding="utf-8")
    return out_path


def main() -> None:
    rows = list(csv.DictReader(INPUT.open(encoding="utf-8")))
    rng = random.Random(SEED)

    generated: list[tuple[str, dict]] = []
    skipped: list[tuple[str, str]] = []

    for r in rows:
        hw = r["headword"]
        if " " in hw:
            skipped.append((hw, "多字詞（含空格），本批次不生成 L2"))
            continue
        if len(hw) <= 2:
            skipped.append((hw, "長度 ≤ 2"))
            continue
        payload = build_payload(hw, rng)
        generated.append((hw, payload))

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    batches = [generated[i : i + BATCH_SIZE] for i in range(0, len(generated), BATCH_SIZE)]
    written = []
    for i, batch in enumerate(batches, start=1):
        written.append(write_batch(batch, i))

    print(f"L2：共 {len(rows)} 字，生成 {len(generated)} 筆，跳過 {len(skipped)} 個字")
    print(f"寫出 {len(written)} 個檔案：")
    for p in written:
        print(f"  - {p}")

    print()
    print(f"跳過清單（{len(skipped)} 個字）：")
    for hw, reason in skipped:
        print(f"  - {hw}：{reason}")


if __name__ == "__main__":
    main()
