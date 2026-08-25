"""B0-1：L2 字母磚 payload 生成腳本（規則式，不用 LLM，見規劃書 §5.6）。

輸入：data/words_snapshot.csv（headword,pos,zh,level_tags,concreteness）
輸出：data/sql/B0_items_L2_NN.sql，每檔最多 BATCH_SIZE 筆

規則：
- items.prompt = 中文釋義（w.zh），items.answer = headword（原始大小寫，他看中文，用字母磚拼出英文）
- tiles：headword **轉小寫**後拆成字母陣列再打亂順序。
  這裡刻意跟 items.answer 的大小寫脫鉤——如果 tiles 保留原始大小寫（例如 April 的大寫 A），
  但 extra_tiles 一律是小寫字母，等於大寫磚塊直接洩漏「這塊一定是正確字母」，
  判分邏輯必須跟著改成 case-insensitive（比對時忽略大小寫），這是 B3 renderer 的責任，
  不是這支腳本能解決的，只能先在資料層做對。
- extra_tiles：從英文字母頻率表中，挑「不在這個字裡」的 2–3 個常見字母（隨機挑，固定 SEED 可重現）
- 打亂防呆：shuffle 完檢查結果是否剛好等於原始字母順序（小字母數的字機率不低，
  例如 3 個字母的字有 1/6 機率打亂等於沒打亂，那題會變成送分題）。若相同就重打，最多 10 次。
- 長度 ≤ 2 的字不生成（a、an、I 這類太短，字母磚沒有訓練意義）
- 長度 > 13 的字不生成（磚塊數會超過 15 塊，對小三挫折感過高，規劃書 §3.3），
  這類字只留給 L1，不留 L2
- 含空格的多字條目（swimming pool、look after…）本批次直接跳過，不生成 L2。
  理由：空格要不要當磚塊、要不要固定版面，屬於 renderer（B3）的互動設計問題，
  這支腳本只管 payload 資料本身，不預先幫 renderer 做決定。
- 含特殊字元（. ' - é）的字（a.m.、o'clock、café、T-shirt、good-looking…）
  本批次也跳過，跟多字條目歸同一類：連字號、句點、撇號要不要拆成獨立磚塊，
  一樣是 B3 才需要決定的互動設計問題。
"""

import csv
import json
import random
import re
from pathlib import Path

SEED = 20260825
INPUT = Path("data/words_snapshot.csv")
OUTPUT_DIR = Path("data/sql")
BATCH_SIZE = 350
MAX_SHUFFLE_RETRY = 10
MAX_HEADWORD_LEN = 13

# 英文字母出現頻率由高到低（ETAOIN SHRDLU 延伸版），用來挑「常見但不在此字中」的干擾字母
LETTER_FREQ = "etaoinshrdlucmfwypvbgkjqxz"

SPECIAL_CHAR_PATTERN = re.compile(r"[()'./\-éÉ]")


def sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def build_payload(headword: str, rng: random.Random) -> dict:
    lower = headword.lower()
    original_order = list(lower)

    tiles = list(lower)
    for _ in range(MAX_SHUFFLE_RETRY):
        rng.shuffle(tiles)
        if tiles != original_order:
            break

    present = set(lower)
    candidates = [c for c in LETTER_FREQ if c not in present]
    k = min(rng.choice([2, 3]), len(candidates))
    extra_tiles = rng.sample(candidates, k)

    return {"tiles": tiles, "extra_tiles": extra_tiles}


def write_batch(rows: list[tuple[str, dict]], batch_no: int) -> Path:
    lines = []
    lines.append("-- " + "=" * 60)
    lines.append(f"-- B0-1 L2 字母磚 payload — 批次 {batch_no:02d}，本批 {len(rows)} 筆")
    lines.append("-- 規則式生成，qa_checked 直接設 true（規劃書 §5.6：不需人工抽查）")
    lines.append("-- tiles 一律小寫，items.answer 保留原始大小寫（判分需 case-insensitive，見 PROGRESS.md 卡關待辦上方備註）")
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
            skipped.append((hw, "多字條目，同特殊字元一併延後（B3 再決定）"))
            continue
        if SPECIAL_CHAR_PATTERN.search(hw):
            skipped.append((hw, "特殊字元，同多字條目一併延後（B3 再決定）"))
            continue
        if len(hw) <= 2:
            skipped.append((hw, "長度 ≤ 2"))
            continue
        if len(hw) >= MAX_HEADWORD_LEN:
            skipped.append((hw, f"長度 ≥ {MAX_HEADWORD_LEN}，磚塊數過多（規劃書 §3.3），只留 L1"))
            continue
        payload = build_payload(hw, rng)
        generated.append((hw, payload))

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    # 清掉舊檔，避免上次跑剩的批次檔案數比這次多，殘留過期資料
    for old in OUTPUT_DIR.glob("B0_items_L2_*.sql"):
        old.unlink()

    batches = [generated[i : i + BATCH_SIZE] for i in range(0, len(generated), BATCH_SIZE)]
    written = []
    for i, batch in enumerate(batches, start=1):
        written.append(write_batch(batch, i))

    print(f"L2：共 {len(rows)} 字，生成 {len(generated)} 筆，跳過 {len(skipped)} 個字")
    print(f"寫出 {len(written)} 個檔案：")
    for p in written:
        print(f"  - {p}")

    print()
    reason_counts: dict[str, int] = {}
    for _, reason in skipped:
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
