"""F 階段資料修正：重新解析 YLE Starters/Movers/Flyers 官方詞表，修正 A3
（scripts/tag_yle_levels.py）當初沒處理到的格式，導致部分字漏標 level_tags。

已確認的漏標例子：child/foot/man/mouse/person/woman 只有 {KET}，但它們都在
Starters 詞表——寫法是 "child/children n"，A3 的 line_to_headword() 把整個
"child/children" 當成一個 token，沒有切開，所以永遠比對不到 words 表裡的
headword "child"。

這支腳本只做比對跟輸出報告/SQL，**不改 app 程式碼，不碰 scripts/tag_yle_levels.py**
（那支維持原樣，當作 A3 當時的紀錄）。

兩條「只命中已存在的字，不會造出新字」的通用規則：
1. 括號展開規則：括號內容接在主詞後面（原字串上的位置，不限定語意），如果
   組成 words 表裡現有的 headword，就採用（wake (up) -> wake up；
   have (got) to -> have got to；stair(s) -> stairs）。
2. 斜線後綴規則：A/B 除了 A、B 各自獨立展開，也試著用 B 取代 A 的尾端幾個字元，
   如果組成 words 表裡現有的 headword，就採用（businessman/woman ->
   businessman、business+woman=businesswoman）。

用法：
  預覽（預設，不寫檔）： python3 scripts/fix_level_tags.py
  正式寫出 SQL：         python3 scripts/fix_level_tags.py --write
"""

import argparse
import csv
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
# tag_yle_levels.py 的型別註記用了 3.10+ 語法（str | None），這台機器是
# python3.9，直接 import 會炸。這裡把需要重用的 PDF 擷取邏輯原封不動複製過來
# （跟原檔逐行一致，只是拿掉型別註記），確保跟 A3 當初用的是同一套斷行/分欄
# 規則，差異只會出在 line→headword 的解析這一段。

import pdfplumber

WORDS_SNAPSHOT = Path("data/words_snapshot.csv")  # 假設等於 Supabase words 表現況
                                                    # （A3 之後沒有其他 commit 動過 level_tags）
OUTPUT_SQL = Path("data/sql/F_fix_level_tags.sql")

YLE_SOURCES = {
    "STARTERS": "data/source/starter word list.pdf",
    "MOVERS": "data/source/Movers.pdf",
    "FLYERS": "data/source/Flyers.pdf",
}

TAG_SET = {"adj", "adv", "conj", "det", "dis", "excl", "int", "n", "poss", "prep", "pron", "v"}
COLUMN_RATIOS = [0.0, 0.3024, 0.5040, 0.6887, 1.0]

EXCLUDE_NAMES = {
    "alex", "dan", "kim", "nick", "alice", "eva", "lucy", "pat", "ann", "anna",
    "ann/anna", "grace", "mark", "sam", "ben", "hugo", "matt", "sue", "bill", "jill", "tom",
    "charlie", "jack", "lily", "sally", "clare", "jane", "mary", "vicky",
    "daisy", "jim", "paul", "zoe", "fred", "julia", "peter",
    "betty", "george", "katy", "robert", "david", "harry", "michael", "sarah",
    "emma", "helen", "oliver", "sophia", "frank", "holly", "richard", "william",
}

LEVEL_ORDER = ["STARTERS", "MOVERS", "FLYERS"]
MAX_SUFFIX_REPLACE = 8  # 斜線後綴規則最多嘗試替換 A 尾端幾個字元


# ---------- PDF 擷取（跟 scripts/tag_yle_levels.py 逐行一致） ----------

def column_lines(page):
    bounds = [r * page.width for r in COLUMN_RATIOS]
    columns = []
    for i in range(len(bounds) - 1):
        crop = page.within_bbox((bounds[i], 0, min(bounds[i + 1], page.width), page.height))
        text = crop.extract_text() or ""
        columns.append([l.strip() for l in text.split("\n") if l.strip()])
    return columns


def last_token_is_tag(line):
    if line.rstrip().endswith("+"):
        return False
    tokens = line.split()
    if not tokens:
        return False
    last = re.sub(r"[^a-z]", "", tokens[-1].lower())
    return last in TAG_SET


def merge_column(raw_lines):
    merged = []
    for line in raw_lines:
        if merged and not last_token_is_tag(merged[-1]):
            merged[-1] = merged[-1] + " " + line
        else:
            merged.append(line)
    return merged


def extract_body_lines(pdf_path):
    all_lines = []
    started = False
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            for raw_col in column_lines(page):
                filtered = []
                for line in raw_col:
                    if re.fullmatch(r"[A-Z]", line):
                        if line == "A":
                            started = True
                        continue
                    if not started:
                        continue
                    if line in ("Names", "Numbers") or line.startswith("Letters &"):
                        break
                    if "no words at th" in line.lower() or "level)" in line:
                        continue
                    filtered.append(line)
                all_lines.extend(merge_column(filtered))
    return all_lines


# ---------- line -> 多個 headword 候選 ----------

def find_top_level_parens(line):
    """手動掃描、處理巢狀括號（例："(UK sweet(s))"），回傳 [(start, end, content)]。
    用手動掃描而不是 regex，因為 regex 的 [^)]* 遇到巢狀括號會在第一個 ')' 就
    誤判配對結束。"""
    spans = []
    depth = 0
    start = None
    for i, ch in enumerate(line):
        if ch == "(":
            if depth == 0:
                start = i
            depth += 1
        elif ch == ")":
            if depth > 0:
                depth -= 1
                if depth == 0 and start is not None:
                    spans.append((start, i, line[start + 1:i]))
                    start = None
    return spans


def extract_primary_headword(text):
    """找 POS tag、回傳 tag 前面那段當 headword。沒找到回傳 None。"""
    tokens = text.split()
    tag_idx = None
    for i, t in enumerate(tokens):
        tt = re.sub(r"[^a-z]", "", t.lower())
        if tt in TAG_SET:
            tag_idx = i
            break
    if tag_idx is None or tag_idx == 0:
        return None
    headword = " ".join(tokens[:tag_idx]).strip().rstrip("!?").strip()
    headword = re.sub(r"\s+", " ", headword)
    return headword or None


def strip_all_parens(line, spans):
    result = line
    for start, end, _ in reversed(spans):
        result = result[:start] + " " + result[end + 1:]
    return result


def substitute_one_paren(line, spans, target_idx):
    """把 spans[target_idx] 的括號拆掉、只留內容，其餘括號整個清掉。"""
    result = line
    for i in range(len(spans) - 1, -1, -1):
        start, end, content = spans[i]
        if i == target_idx:
            result = result[:start] + content + result[end + 1:]
        else:
            result = result[:start] + " " + result[end + 1:]
    return result


def split_slash(word):
    if "/" in word:
        return [w.strip() for w in word.split("/") if w.strip()]
    return [word]


def slash_suffix_variants(word, ket_headwords_lower, hits_log, line):
    """A/B -> A, B 各自獨立，另外嘗試用 B 取代 A 尾端幾個字元（businessman/woman
    -> businesswoman），只在組出來的字真的存在於 KET 詞表時才採用。"""
    parts = split_slash(word)
    if len(parts) != 2:
        return parts
    a, b = parts
    variants = list(parts)
    for k in range(1, min(len(a), MAX_SUFFIX_REPLACE) + 1):
        candidate = a[:-k] + b
        if candidate.lower() in ket_headwords_lower and candidate.lower() not in (p.lower() for p in parts):
            variants.append(candidate)
            hits_log.append((line, f"{a}/{b}", candidate, "SLASH_SUFFIX"))
    return variants


def line_to_headwords(line, ket_headwords_lower, bracket_hits_log, slash_hits_log):
    if "as in" in line.lower() and "name" in line.lower():
        return []  # 人名義項（例：May (as in girl's name)），跟 A3 一樣排除

    spans = find_top_level_parens(line)
    alt_from_brackets = []

    for idx, (start, end, content) in enumerate(spans):
        content = content.strip()
        preceding = line[start - 1] if start > 0 else ""
        glued = preceding.isalpha()
        low = content.lower()

        if not glued and (low.startswith("us ") or low.startswith("uk ")):
            # 美式/英式拼法替代詞：獨立詞，不是「接在主詞後面」的延伸
            alt = content[3:].strip()
            nested = find_top_level_parens(alt)
            if nested:
                for nstart, nend, ncontent in nested:
                    nprec = alt[nstart - 1] if nstart > 0 else ""
                    if nprec.isalpha():
                        j = nstart
                        while j > 0 and alt[j - 1].isalpha():
                            j -= 1
                        nbase = alt[j:nstart]
                        alt_from_brackets.append((nbase + ncontent).lower())
                        alt_from_brackets.append(nbase.lower())
            elif alt:
                alt_from_brackets.append(alt.lower())
        else:
            # 通用括號展開規則：括號內容接在原本的位置，重新抽一次 headword，
            # 如果剛好組成 words 表裡現有的字就採用。涵蓋 sweet(s)、wake (up)、
            # have (got) to，也涵蓋單純的用法說明（e.g. a bus 這種不會命中
            # 任何現有字，安全地被當成雜訊丟掉，不用額外分類）。
            substituted = substitute_one_paren(line, spans, idx)
            candidate = extract_primary_headword(substituted)
            if candidate and candidate.lower() in ket_headwords_lower:
                alt_from_brackets.append(candidate.lower())
                bracket_hits_log.append((line, content, candidate))

    no_parens = strip_all_parens(line, spans)
    headword = extract_primary_headword(no_parens)
    if not headword:
        return []

    results = []
    for w in slash_suffix_variants(headword, ket_headwords_lower, slash_hits_log, line):
        results.append(w.lower())
    for alt in alt_from_brackets:
        for w in slash_suffix_variants(alt, ket_headwords_lower, slash_hits_log, line):
            results.append(w.lower())

    return results


def extract_yle_headwords(pdf_path, ket_headwords_lower, bracket_hits_log, slash_hits_log):
    words = set()
    for line in extract_body_lines(pdf_path):
        for hw in line_to_headwords(line, ket_headwords_lower, bracket_hits_log, slash_hits_log):
            if hw in EXCLUDE_NAMES:
                continue
            words.add(hw)
    return words


def sql_str(s):
    return "'" + s.replace("'", "''") + "'"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="寫出 SQL 檔；不加則只印報告")
    args = parser.parse_args()

    current_rows = list(csv.DictReader(WORDS_SNAPSHOT.open(encoding="utf-8")))
    current_tags = {}
    for row in current_rows:
        hw = row["headword"]
        raw = row.get("level_tags", "") or ""
        tags = set(t for t in raw.strip("{}").split(",") if t)
        current_tags[hw] = tags
    ket_headwords_lower = {hw.lower() for hw in current_tags}

    bracket_hits_log = []
    slash_hits_log = []
    yle_sets = {
        level: extract_yle_headwords(path, ket_headwords_lower, bracket_hits_log, slash_hits_log)
        for level, path in YLE_SOURCES.items()
    }

    print(f"=== 括號展開規則命中（{len(bracket_hits_log)} 筆，括號內容接在主詞後面剛好組成現有字） ===")
    for line, content, candidate in bracket_hits_log:
        print(f"    {candidate!r}  <- 行：{line!r}（括號內容 {content!r}）")
    print()

    print(f"=== 斜線後綴規則命中（{len(slash_hits_log)} 筆，B 取代 A 尾端字元組成現有字） ===")
    for line, pair, candidate, _ in slash_hits_log:
        print(f"    {candidate!r}  <- 行：{line!r}（{pair}）")
    print()

    diffs = []
    for hw in current_tags:
        hw_lower = hw.lower()
        first_level_idx = None
        for i, level in enumerate(LEVEL_ORDER):
            if hw_lower in yle_sets[level]:
                first_level_idx = i
                break

        should_have = set()
        if first_level_idx is not None:
            for level in LEVEL_ORDER[first_level_idx:]:
                should_have.add(level)

        existing = current_tags[hw] - {"KET"}
        missing = should_have - existing
        if missing:
            diffs.append((hw, sorted(existing), sorted(should_have), sorted(missing)))

    diffs.sort(key=lambda d: d[0])

    print(f"=== 差異清單（{len(diffs)} 個字現有標籤不完整） ===")
    for hw, existing, should_have, missing in diffs:
        print(f"  {hw:20s} 現有={existing or ['(無)']}  應有={should_have}  缺={missing}")

    print()
    print("=== 依「缺了哪一層」分組統計 ===")
    missing_counter = Counter()
    for _, _, _, missing in diffs:
        for level in missing:
            missing_counter[level] += 1
    for level in LEVEL_ORDER:
        print(f"  缺 {level}：{missing_counter.get(level, 0)} 個字")

    print()
    print("=== 原本是 Flyers 詞表的字、卻沒有 FLYERS 標籤 ===")
    flyers_missing = [d for d in diffs if "FLYERS" in d[3]]
    print(f"  共 {len(flyers_missing)} 個：")
    for hw, *_ in flyers_missing:
        print(f"    {hw}")

    fixed_tags = {}
    for hw, tags in current_tags.items():
        match = next((d for d in diffs if d[0] == hw), None)
        fixed_tags[hw] = tags | (set(match[3]) if match else set())

    def exclusive_flyers(tagsdict):
        return sum(1 for t in tagsdict.values() if "FLYERS" in t and "MOVERS" not in t and "STARTERS" not in t)

    print()
    print(f"FLYERS 專屬新字（無MOVERS無STARTERS）：現有 {exclusive_flyers(current_tags)} "
          f"-> 修正後 {exclusive_flyers(fixed_tags)}")
    for lvl in LEVEL_ORDER:
        before = sum(1 for t in current_tags.values() if lvl in t)
        after = sum(1 for t in fixed_tags.values() if lvl in t)
        print(f"{lvl}: 現有 {before} -> 修正後 {after}")

    if args.write:
        lines = []
        lines.append("-- " + "=" * 60)
        lines.append("-- F 階段資料修正：補上 A3 YLE 分層比對漏標的 level_tags")
        lines.append(f"-- 共 {len(diffs)} 個字")
        lines.append("-- 根因：A3 的解析器沒處理斜線形態（child/children）、UK/US 替代拼法")
        lines.append("--      （truck (UK lorry)）、巢狀括號（candy (UK sweet(s))）、")
        lines.append("--      可省略延伸（wake (up)、have (got) to）")
        lines.append("--")
        lines.append("-- 安全性：用 array(select distinct unnest(...)) 對 Supabase 當下實際的")
        lines.append("-- level_tags 做聯集附加，不是用本機算出來的完整標籤直接覆蓋整欄。")
        lines.append("-- 這樣即使 Supabase 現況跟本機 data/words_snapshot.csv 有落差（例如你之後")
        lines.append("-- 手動修過某些字），這句也只會新增下面列出的缺項，不會動到其他既有標籤。")
        lines.append("-- " + "=" * 60)
        lines.append("")
        for hw, existing, should_have, missing in diffs:
            missing_literal = "{" + ",".join(missing) + "}"
            lines.append(
                "update words set level_tags = array(select distinct unnest("
                f"level_tags || {sql_str(missing_literal)}::text[])) "
                f"where headword = {sql_str(hw)};"
            )
        lines.append("")
        lines.append("-- 驗收：確認上面這批字現在都有完整的 level_tags")
        lines.append("select headword, level_tags from words where headword in (")
        lines.append(",\n".join(f"  {sql_str(hw)}" for hw, *_ in diffs))
        lines.append(") order by headword;")

        OUTPUT_SQL.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT_SQL.write_text("\n".join(lines), encoding="utf-8")
        print()
        print(f"已寫出 {OUTPUT_SQL}（{len(diffs)} 筆 update）")


if __name__ == "__main__":
    main()
