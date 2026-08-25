"""B7：用診斷結果初始化 cards（僅哥哥）。依規劃書 §3.1、CLAUDE_CODE_B_task.md B7。

【與任務書的調整】L0 的 due_at 窗口從 30–90 天改為 30–365 天。
理由（使用者提供，記錄在此供之後回頭查）：
  每天到期複習名額 = 3 輪 × 10 題 × (5/10 到期複習比例) = 15 個
  1,733 張 L0 若均勻分散在 60 天內 = 每天約 29 張到期，超過容量近兩倍
  L1 每天 6 個新字，穩定後約佔到期複習名額 10 個，留給 L0 的大約只剩 5 個/天
  1,733 ÷ 5 ≈ 347 天 → 進位到 365 天（一年）
  §9 B2 驗收明確要求「未出現複習債爆量」，30–90 天的窗口必定過不了

用法：
  預覽（預設，不寫檔）： python3 scripts/build_b7_cards_init.py
  正式寫出 SQL：         python3 scripts/build_b7_cards_init.py --write

兩次執行用同一個 SEED，預覽看到的分布跟寫出來的 SQL 是同一組隨機結果，不會預覽一套、產檔又是另一套。
"""

import argparse
import csv
import random
from pathlib import Path

SEED = 20260825
INPUT = Path("data/words_snapshot.csv")
OUTPUT_PATH = Path("data/sql/B7_cards_init.sql")

L0_STABILITY = 60
L0_DUE_MIN_DAYS = 30
L0_DUE_MAX_DAYS = 365

# 診斷答錯的 3 個字：較低 stability，讓它們早點回來
WEAK_WORDS = {"assistant", "bring back", "hoodie"}
WEAK_STABILITY = 7
WEAK_DUE_MIN_DAYS = 5
WEAK_DUE_MAX_DAYS = 10

BUCKET_SIZE_DAYS = 30


def sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def load_headwords() -> tuple[list[str], list[str]]:
    rows = list(csv.DictReader(INPUT.open(encoding="utf-8")))
    all_hw = [r["headword"] for r in rows]
    return all_hw, rows


def load_l1_headwords() -> set[str]:
    """有 L1 題目的字：直接掃 data/sql/B0_items_L1_*.sql 的 headword 清單，
    不重複維護第二份清單。"""
    import re

    hws: set[str] = set()
    for fn in sorted(Path("data/sql").glob("B0_items_L1_*.sql")):
        text = fn.read_text(encoding="utf-8")
        for m in re.finditer(r"^\s*\('((?:[^']|'')*)', '(\{.*?\})'\),?\s*$", text, re.M):
            hws.add(m.group(1).replace("''", "'"))
    return hws


def assign_l0_due_days(all_hw: list[str], rng: random.Random) -> list[tuple[str, int, int]]:
    """回傳 [(headword, stability, due_days)]"""
    result = []
    for hw in all_hw:
        if hw in WEAK_WORDS:
            days = rng.randint(WEAK_DUE_MIN_DAYS, WEAK_DUE_MAX_DAYS)
            result.append((hw, WEAK_STABILITY, days))
        else:
            days = rng.randint(L0_DUE_MIN_DAYS, L0_DUE_MAX_DAYS)
            result.append((hw, L0_STABILITY, days))
    return result


def print_distribution_preview(l0_assignments: list[tuple[str, int, int]]) -> None:
    weak = [(hw, s, d) for hw, s, d in l0_assignments if hw in WEAK_WORDS]
    normal = [(hw, s, d) for hw, s, d in l0_assignments if hw not in WEAK_WORDS]

    print(f"L0 一般字（{len(normal)} 張，stability={L0_STABILITY}）due_at 分布：")
    print(f"（每格 {BUCKET_SIZE_DAYS} 天，從第 {L0_DUE_MIN_DAYS} 天開始；最後一格較窄）")
    print()

    buckets: dict[int, int] = {}
    for _, _, days in normal:
        idx = (days - L0_DUE_MIN_DAYS) // BUCKET_SIZE_DAYS
        buckets[idx] = buckets.get(idx, 0) + 1

    max_idx = max(buckets.keys())
    total_span = L0_DUE_MAX_DAYS - L0_DUE_MIN_DAYS + 1
    avg_per_day = len(normal) / total_span

    for idx in range(max_idx + 1):
        start = L0_DUE_MIN_DAYS + idx * BUCKET_SIZE_DAYS
        end = min(start + BUCKET_SIZE_DAYS - 1, L0_DUE_MAX_DAYS)
        width = end - start + 1
        count = buckets.get(idx, 0)
        expected = avg_per_day * width
        bar = "#" * max(1, round(count / 5))
        flag = "  <- 偏離預期" if abs(count - expected) > expected * 0.3 else ""
        print(f"  第 {start:>3}-{end:>3} 天（{width:>2}天）: {count:>3} 張  預期約 {expected:4.1f} 張  {bar}{flag}")

    print()
    print(f"平均每天到期： {avg_per_day:.2f} 張（目標是低於留給 L0 的 ~5 張/天名額）")
    print()
    print(f"診斷答錯的 3 個字（{len(weak)} 張，stability={WEAK_STABILITY}，"
          f"due_at = now + {WEAK_DUE_MIN_DAYS}~{WEAK_DUE_MAX_DAYS} 天）：")
    for hw, _, days in weak:
        print(f"  - {hw}：{days} 天")


def build_sql(l0_assignments: list[tuple[str, int, int]], l1_headwords: set[str], profile_name: str) -> str:
    lines = []
    lines.append("-- " + "=" * 60)
    lines.append("-- B7 用診斷結果初始化 cards（僅哥哥）")
    lines.append(f"-- L0：全部 {len(l0_assignments)} 字，state=review，stability=60，")
    lines.append(f"--     due_at 分散在 {L0_DUE_MIN_DAYS}-{L0_DUE_MAX_DAYS} 天（調整後窗口，理由見腳本開頭註解）")
    lines.append(f"--     例外：診斷答錯的 {', '.join(sorted(WEAK_WORDS))} 三字，stability=7，"
                 f"due_at={WEAK_DUE_MIN_DAYS}-{WEAK_DUE_MAX_DAYS}天")
    lines.append(f"-- L1：有 L1 題目的 {len(l1_headwords)} 字，state=new，due_at=now")
    lines.append("-- L2：不建立，由晉級規則自動建立")
    lines.append("-- on conflict (profile_id, word_id, skill) do nothing：可重跑不重複")
    lines.append("-- " + "=" * 60)
    lines.append("")
    lines.append("do $$")
    lines.append("declare")
    lines.append(f"  target_profile_id uuid := (select id from profiles where name = {sql_str(profile_name)});")
    lines.append("begin")
    lines.append("")

    lines.append("  -- L0：review 狀態，due_at 依下表逐字指定天數")
    lines.append("  insert into cards (profile_id, word_id, skill, state, stability, due_at)")
    lines.append("  select target_profile_id, w.id, 'L0', 'review', v.stability, now() + (v.due_days || ' days')::interval")
    lines.append("  from words w")
    lines.append("  join (values")
    value_lines = [
        f"    ({sql_str(hw)}, {stability}, {days})"
        for hw, stability, days in l0_assignments
    ]
    lines.append(",\n".join(value_lines))
    lines.append("  ) as v(headword, stability, due_days)")
    lines.append("  on w.headword = v.headword")
    lines.append("  on conflict (profile_id, word_id, skill) do nothing;")
    lines.append("")

    lines.append("  -- L1：new 狀態，due_at = now，stability/difficulty 留 null 給 SRS 首次作答寫入")
    lines.append("  insert into cards (profile_id, word_id, skill, state, due_at)")
    lines.append("  select target_profile_id, w.id, 'L1', 'new', now()")
    lines.append("  from words w")
    lines.append("  where w.headword in (")
    hw_lines = [f"    {sql_str(hw)}" for hw in sorted(l1_headwords)]
    lines.append(",\n".join(hw_lines))
    lines.append("  )")
    lines.append("  on conflict (profile_id, word_id, skill) do nothing;")
    lines.append("")
    lines.append("end $$;")
    lines.append("")
    lines.append("")
    lines.append("-- " + "=" * 60)
    lines.append("-- 驗收（CLAUDE_CODE_B_task.md 階段驗收查詢 1、2）")
    lines.append("-- " + "=" * 60)
    lines.append("select skill, state, count(*) as 卡片數,")
    lines.append("       min(due_at)::date as 最早到期, max(due_at)::date as 最晚到期")
    lines.append("from cards c join profiles p on p.id = c.profile_id")
    lines.append(f"where p.name = {sql_str(profile_name)}")
    lines.append("group by skill, state order by skill, state;")
    lines.append("")
    lines.append("select due_at::date as 到期日, count(*) as 卡片數")
    lines.append("from cards c join profiles p on p.id = c.profile_id")
    lines.append(f"where p.name = {sql_str(profile_name)} and c.suspended = false")
    lines.append("  and due_at < now() + interval '14 days'")
    lines.append("group by 1 order by 1;")

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="寫出 SQL 檔；不加則只印預覽")
    args = parser.parse_args()

    all_hw, _ = load_headwords()
    l1_headwords = load_l1_headwords()
    rng = random.Random(SEED)
    l0_assignments = assign_l0_due_days(all_hw, rng)

    print_distribution_preview(l0_assignments)
    print()
    print(f"L1：{len(l1_headwords)} 字（state=new, due_at=now）")

    if args.write:
        sql = build_sql(l0_assignments, l1_headwords, "哥哥")
        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT_PATH.write_text(sql, encoding="utf-8")
        print()
        print(f"已寫出 {OUTPUT_PATH}")
    else:
        print()
        print("（這是預覽，尚未寫出 SQL 檔。確認分布後加 --write 參數重跑。）")


if __name__ == "__main__":
    main()
