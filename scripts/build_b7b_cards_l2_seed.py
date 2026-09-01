"""B7b：先建一小批 L2 卡片，讓哥哥第一天就能練字母磚，同時實測 B3 的 L2 UI
（B3 到現在只在假資料上跑過）。依規劃書 §5.2，L2 卡片本應在晉級規則（state
轉 review）後自動建立，但晉級要等 B2 才會動，B2 完成前 L2 一張都不會出現。
這 50 張是刻意提前的種子，B2 上線後晉級規則接手，`on conflict` 保護不會衝突。

篩選條件（使用者指定）：concreteness = 5、headword 長度 4–7 字母、且有 L2 題目。
挑選方式：符合條件的候選字（286 個）用 SEED 打亂後取前 50 個，跟專案其他腳本
一致的可重現性做法。

用法：python3 scripts/build_b7b_cards_l2_seed.py
輸出：data/sql/B7b_cards_L2_seed.sql（只做哥哥，不自動寫入 Supabase）
"""

import csv
import random
import re
from pathlib import Path

SEED = 20260825
WORDS_CSV = Path("data/words_snapshot.csv")
L2_SQL_DIR = Path("data/sql")
OUTPUT_PATH = Path("data/sql/B7b_cards_L2_seed.sql")

CONCRETENESS = 5
MIN_LEN = 4
MAX_LEN = 7
SAMPLE_SIZE = 50


def sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def load_words() -> list[dict]:
    return list(csv.DictReader(WORDS_CSV.open(encoding="utf-8")))


def load_l2_headwords() -> set[str]:
    """有 L2 題目的字：直接掃 data/sql/B0_items_L2_*.sql，跟 B7 撈 L1 headword
    的做法一致，不重複維護第二份清單。"""
    hws: set[str] = set()
    for fn in sorted(L2_SQL_DIR.glob("B0_items_L2_*.sql")):
        text = fn.read_text(encoding="utf-8")
        for m in re.finditer(r"\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*'", text):
            hws.add(m.group(1).replace("''", "'"))
    return hws


def build_sql(headwords: list[str], profile_name: str) -> str:
    lines = []
    lines.append("-- " + "=" * 60)
    lines.append("-- B7b 種子批：先建一小批 L2 字母磚卡片（僅哥哥）")
    lines.append(f"-- 條件：concreteness={CONCRETENESS}、headword 長度 {MIN_LEN}-{MAX_LEN} 字母、有 L2 題目")
    lines.append(f"-- 從符合條件的候選字裡以 SEED={SEED} 打亂取前 {len(headwords)} 個")
    lines.append("-- state=new、due_at=now；B2 晉級規則上線後接手，on conflict 保護不衝突")
    lines.append("-- " + "=" * 60)
    lines.append("")
    lines.append("do $$")
    lines.append("declare")
    lines.append(f"  target_profile_id uuid := (select id from profiles where name = {sql_str(profile_name)});")
    lines.append("begin")
    lines.append("")
    lines.append("  insert into cards (profile_id, word_id, skill, state, due_at)")
    lines.append("  select target_profile_id, w.id, 'L2', 'new', now()")
    lines.append("  from words w")
    lines.append("  where w.headword in (")
    hw_lines = [f"    {sql_str(hw)}" for hw in headwords]
    lines.append(",\n".join(hw_lines))
    lines.append("  )")
    lines.append("  on conflict (profile_id, word_id, skill) do nothing;")
    lines.append("")
    lines.append("end $$;")
    lines.append("")
    lines.append("")
    lines.append("-- " + "=" * 60)
    lines.append("-- 驗收")
    lines.append("-- " + "=" * 60)
    lines.append("select skill, state, count(*) as 卡片數")
    lines.append("from cards c join profiles p on p.id = c.profile_id")
    lines.append(f"where p.name = {sql_str(profile_name)} and c.skill = 'L2'")
    lines.append("group by skill, state;")

    return "\n".join(lines)


def main() -> None:
    words = load_words()
    l2_headwords = load_l2_headwords()

    candidates = [
        w["headword"]
        for w in words
        if w["concreteness"].strip() == str(CONCRETENESS)
        and MIN_LEN <= len(w["headword"]) <= MAX_LEN
        and w["headword"] in l2_headwords
    ]

    print(f"符合條件（concreteness={CONCRETENESS}、長度 {MIN_LEN}-{MAX_LEN}、有 L2 題目）候選字：{len(candidates)} 個")

    rng = random.Random(SEED)
    shuffled = candidates[:]
    rng.shuffle(shuffled)
    selected = sorted(shuffled[:SAMPLE_SIZE])

    print(f"取 {len(selected)} 個：")
    for hw in selected:
        print(f"  - {hw}")

    sql = build_sql(selected, "哥哥")
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(sql, encoding="utf-8")
    print()
    print(f"已寫出 {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
