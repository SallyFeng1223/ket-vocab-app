"""A3 步驟 1：從 Cambridge A2 Key Vocabulary List PDF 抽出主詞表。

版面是雙欄，且頁尾文字橫跨兩欄，直接 extract_text() 順序會錯亂，
所以先用座標裁掉頁尾，再左右分欄各自抽取，最後合併「換行截斷」的條目
（例：POS 標註或例句被印刷版面切到下一行）。
"""

import csv
import re
import sys
from pathlib import Path

import pdfplumber

SOURCE_PDF = Path("data/source/A2 key word lists.pdf")
OUTPUT_CSV = Path("data/extracted_ket.csv")

FIRST_PAGE_INDEX = 3   # PDF 第 4 頁（0-indexed）
LAST_PAGE_INDEX = 22   # PDF 第 23 頁，第 24 頁起是 Appendix，不處理
FOOTER_Y = 780          # 頁尾（© UCLES ...）從這個 y 座標開始，裁掉
COLUMN_SPLIT_X = 300

ALLOWED_POS = {
    "n", "v", "adj", "adv", "prep", "conj", "pron", "det", "mv", "phr v", "exclam",
}

FOOTER_PATTERNS = [
    re.compile(r"UCLES"),
    re.compile(r"Vocabulary List"),
    re.compile(r"A2 Key"),
    re.compile(r"Page \d+ of \d+"),
]

# 規劃書表格外，掃描全文才發現的排版異常／特例（詳見對話紀錄）
RAW_LINE_FIXES = {
    "jacket(n)": "jacket (n)",  # 原文遺漏空格，(n) 其實是詞性標註不是詞形擴展
}


def extract_raw_lines(pdf_path: Path) -> list[str]:
    lines: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page_index in range(FIRST_PAGE_INDEX, LAST_PAGE_INDEX + 1):
            page = pdf.pages[page_index]
            for bbox in (
                (0, 0, COLUMN_SPLIT_X, FOOTER_Y),
                (COLUMN_SPLIT_X, 0, page.width, FOOTER_Y),
            ):
                crop = page.within_bbox(bbox)
                text = crop.extract_text() or ""
                for line in text.split("\n"):
                    line = line.strip()
                    if line:
                        lines.append(line)
    return lines


def is_footer_or_header(line: str) -> bool:
    return any(p.search(line) for p in FOOTER_PATTERNS)


def is_section_heading(line: str) -> bool:
    return bool(re.fullmatch(r"[A-Z]", line))


def merge_wrapped_lines(raw_lines: list[str]) -> list[str]:
    """把版面換行截斷的條目接回上一行。

    判斷依據：真正的新條目（headword 行或例句 •行）一定看得出來——
    headword 行含 '('，例句行以 '•' 開頭。剩下「兩者皆非」的行，
    就是上一行被印刷版面截斷後的延續（例：'exclam)'、'France.'）。
    """
    merged: list[str] = []
    for line in raw_lines:
        line = RAW_LINE_FIXES.get(line, line)
        if is_footer_or_header(line) or is_section_heading(line):
            continue
        is_new_entry = line.startswith("•") or ("(" in line and not line.startswith("("))
        if merged and not is_new_entry:
            merged[-1] = merged[-1] + " " + line
        else:
            merged.append(line)
    return merged


def split_headword_and_groups(line: str) -> tuple[str, list[str]]:
    idx = line.find(" (")
    if idx == -1:
        return line.strip(), []
    headword = line[:idx].strip()
    rest = line[idx:].strip()
    groups = re.findall(r"\(([^()]*)\)", rest)
    return headword, groups


def normalize_pos_token(t: str) -> str:
    # 去掉描述性修飾，如 "adj – for colours" -> "adj"
    t = re.split(r"[–-]", t)[0].strip()
    if t.startswith("unc "):
        t = t[len("unc "):].strip()
    if t.endswith(" pl"):
        t = t[: -len(" pl")].strip()
    if t == "av":  # 助動詞，schema 沒有獨立值，併入 v
        t = "v"
    return t


def pick_pos(groups: list[str]) -> tuple[str | None, list[str]]:
    """掃描各 paren group，選第一個看起來像詞性的當 pos，其餘進 notes。"""
    pos = None
    pos_idx = None
    for i, raw in enumerate(groups):
        g = raw.strip()
        if g == "prep phr":
            pos, pos_idx = "prep", i
            break
        tokens = [t.strip() for t in re.split(r"[,&]", g) if t.strip()]
        normalized = []
        ok = bool(tokens)
        for t in tokens:
            tt = normalize_pos_token(t)
            if tt not in ALLOWED_POS:
                ok = False
                break
            normalized.append(tt)
        if ok:
            pos = "n" if set(normalized) == {"adj", "n"} else normalized[0]
            pos_idx = i
            break
    notes = [g for i, g in enumerate(groups) if i != pos_idx]
    return pos, notes


def expand_slash(headword: str) -> list[str]:
    if headword == "at / @":
        return ["at"]  # 併入既有的 at，不另建
    if headword == "poor thing/you":
        # 字面拆開會產生單獨的 "you"，跟後面字母 Y 真正的 you (pron) 撞名，
        # 因去重規則「保留第一筆」會把後面那筆真正的 you 蓋掉
        return ["poor thing", "poor you"]
    if "/" in headword:
        return [p.strip() for p in headword.split("/")]
    return [headword]


def expand_optional_paren(headword: str) -> list[str]:
    m = re.fullmatch(r"([A-Za-z]+)\(([A-Za-z]+)\)([A-Za-z]*)", headword)
    if not m:
        return [headword]
    prefix, opt, suffix = m.groups()
    base, expanded = prefix + suffix, prefix + opt + suffix
    if headword == "blond(e)":
        return [expanded]  # 取 blonde 一筆
    return [base, expanded]


def normalize_headwords(headword: str) -> list[str]:
    variants = []
    for v in expand_slash(headword):
        variants.extend(expand_optional_paren(v))
    return variants


def build_entries(merged_lines: list[str]) -> list[dict]:
    entries: list[dict] = []
    for line in merged_lines:
        if line.startswith("•"):
            if entries:
                bullet_text = line[1:].strip()
                entries[-1]["bullets"].append(bullet_text)
            continue

        headword_raw, groups = split_headword_and_groups(line)
        pos, note_groups = pick_pos(groups)
        if pos is None:
            print(f"[警告] 無法判斷詞性，跳過此行：{line!r}", file=sys.stderr)
            continue

        variants = normalize_headwords(headword_raw)
        extra_note = " ".join(f"({g})" for g in note_groups)

        is_br_am_split = headword_raw == "centre/center"
        for i, hw in enumerate(variants):
            hw = hw.strip()
            if not hw:
                continue
            entry_notes = extra_note
            if is_br_am_split:
                region_tag = "(Br Eng)" if i == 0 else "(Am Eng)"
                entry_notes = (entry_notes + " " + region_tag).strip()
            entries.append(
                {
                    "headword": hw,
                    "pos": pos,
                    "bullets": [],
                    "extra_note": entry_notes,
                }
            )
    return entries


def finalize_rows(entries: list[dict]) -> list[dict]:
    seen: set[str] = set()
    rows = []
    for e in entries:
        # 拼字練習用的詞條不該含標點（源檔裡少數驚嘆句/疑問句寫法不一致）
        hw = e["headword"].rstrip("!?").strip()
        if hw in seen:
            continue
        seen.add(hw)
        note_parts = list(e["bullets"])
        if e["extra_note"]:
            note_parts.append(e["extra_note"])
        sense_note = "; ".join(note_parts)
        rows.append(
            {
                "headword": hw,
                "pos": e["pos"],
                "sense_note": sense_note,
                "is_phrasal": e["pos"] == "phr v",
            }
        )
    return rows


def main() -> None:
    raw_lines = extract_raw_lines(SOURCE_PDF)
    merged_lines = merge_wrapped_lines(raw_lines)
    entries = build_entries(merged_lines)
    rows = finalize_rows(entries)

    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["headword", "pos", "sense_note", "is_phrasal"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"共 {len(rows)} 筆，寫入 {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
