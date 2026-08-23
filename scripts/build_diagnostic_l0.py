"""A4：從已存進 Supabase 的 1,733 字裡抽 80 字做診斷，並為每字生成 L0
（英→中四選一）的 3 個干擾選項。

抽樣分層（規劃書 §9 / PROGRESS.md A4）：
  Starters 15 / Movers 30 / KET-only 高頻具體 20 / KET-only 低頻抽象 15

- Movers 層只取「首次出現在 Movers」的字（level_tags 含 MOVERS 但不含
  STARTERS），避免跟 Starters 層重疊——這樣才是「找出 Movers 內的漏洞」。
- 沒有 freq_rank 資料，「高頻／低頻」用 concreteness 當代理指標
  （具體字通常也是日常高頻字，跟規劃書 concreteness 量表的舉例一致）。

干擾選項規則（CLAUDE.md）：同詞性、長度相近。
"""

import csv
import json
import random
import re
from pathlib import Path

SNAPSHOT_CSV = Path("data/words_snapshot.csv")
OUTPUT_SQL = Path("data/sql/A4_diagnostic_items.sql")
SEED = 20260823


def zh_core(zh: str) -> str:
    for sep in ("、", "（", "(", ";", "；"):
        if sep in zh:
            zh = zh.split(sep)[0]
    return zh.strip()


def load_words() -> list[dict]:
    rows = list(csv.DictReader(SNAPSHOT_CSV.open(encoding="utf-8")))
    for r in rows:
        r["concreteness"] = int(r["concreteness"])
    return rows


def build_pools(words: list[dict]) -> dict:
    starters = [w for w in words if "STARTERS" in w["level_tags"]]
    movers_only = [
        w for w in words if "MOVERS" in w["level_tags"] and "STARTERS" not in w["level_tags"]
    ]
    ket_high = [w for w in words if w["level_tags"] == "{KET}" and w["concreteness"] >= 4]
    ket_low = [w for w in words if w["level_tags"] == "{KET}" and w["concreteness"] <= 2]
    return {
        "STARTERS": starters,
        "MOVERS": movers_only,
        "KET_HIGH": ket_high,
        "KET_LOW": ket_low,
    }


def sample_diagnostic_words(words: list[dict], rng: random.Random) -> list[tuple[str, dict]]:
    pools = build_pools(words)
    plan = [("STARTERS", 15), ("MOVERS", 30), ("KET_HIGH", 20), ("KET_LOW", 15)]
    chosen: list[tuple[str, dict]] = []
    for tier, n in plan:
        pool = pools[tier]
        assert len(pool) >= n, f"{tier} 候選字只有 {len(pool)} 個，不夠抽 {n} 個"
        picked = rng.sample(pool, n)
        chosen.extend((tier, w) for w in picked)
    return chosen


def pick_distractors(target: dict, all_words: list[dict], rng: random.Random, n: int = 3) -> list[str]:
    target_core = zh_core(target["zh"])
    target_prefix = target["headword"][:4].lower()

    def is_bad(w: dict) -> bool:
        if w["headword"] == target["headword"]:
            return True
        if w["pos"] != target["pos"]:
            return True
        if w["headword"][:4].lower() == target_prefix:
            return True  # 排除同字根（actor/act/action 這類）
        core = zh_core(w["zh"])
        if core == target_core or core in target_core or target_core in core:
            return True
        return False

    candidates = [w for w in all_words if not is_bad(w)]
    # 先洗牌再做穩定排序，長度相同時才不會每次都選到同一批字母 a 開頭的字；
    # 同時用 zh 文字去重，避免像 advert/advertisement 都是「廣告」被同時選中
    rng.shuffle(candidates)
    seen_zh = set()
    deduped = []
    for w in candidates:
        if w["zh"] in seen_zh:
            continue
        seen_zh.add(w["zh"])
        deduped.append(w)
    # 用完整顯示文字的長度比對（不是去掉括號的 core），因為畫面上看到的是全文
    deduped.sort(key=lambda w: abs(len(w["zh"]) - len(target["zh"])))
    shortlist = deduped[:15]
    if len(shortlist) < n:
        shortlist = deduped
    picked = rng.sample(shortlist, min(n, len(shortlist)))
    return [w["zh"] for w in picked]


def sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def main() -> None:
    words = load_words()
    rng = random.Random(SEED)
    diagnostic = sample_diagnostic_words(words, rng)

    rows_sql = []
    all_distractors = []
    tier_counts = {"STARTERS": 0, "MOVERS": 0, "KET_HIGH": 0, "KET_LOW": 0}
    for tier, w in diagnostic:
        tier_counts[tier] += 1
        distractors = pick_distractors(w, words, rng)
        assert len(distractors) == 3, f"{w['headword']} 只找到 {len(distractors)} 個干擾選項"
        all_distractors.append(distractors)
        payload = json.dumps({"distractors_zh": distractors}, ensure_ascii=False)
        rows_sql.append(
            "(" + sql_str(w["headword"]) + ", " + sql_str(payload) + ")"
        )

    OUTPUT_SQL.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    lines.append("-- ============================================================")
    lines.append("-- A4 診斷抽樣 80 字 — L0（英→中四選一）題目")
    lines.append("-- 分層：Starters 15 / Movers 30 / KET-only 高頻具體 20 / KET-only 低頻抽象 15")
    lines.append("-- word_id 用 headword 對照 words 表查出，不需預先知道 UUID")
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

    print("抽樣結果：", tier_counts, "總計", sum(tier_counts.values()))
    print(f"寫入 {OUTPUT_SQL}")

    # 供人工抽查用：印出全部 80 題
    print("\n=== 全部 80 題（供抽查） ===")
    for i, ((tier, w), distractors) in enumerate(zip(diagnostic, all_distractors), 1):
        print(f"{i:2d}. [{tier:8s}] {w['headword']:20s} pos={w['pos']:6s} 答案={w['zh']:12s} 干擾={distractors}")


if __name__ == "__main__":
    main()
