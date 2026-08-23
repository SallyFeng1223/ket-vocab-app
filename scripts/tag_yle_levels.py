"""A3 步驟 2：把 YLE Starters / Movers / Flyers 官方詞表跟步驟 1 的 KET 詞表比對，
產生每個 headword 的 level_tags（累積式：Starters 的字最後會是 {STARTERS,MOVERS,FLYERS,KET}）。

三份 YLE PDF 是四欄網格版面，且人名（Alex、Ben...）夾雜在正常字表裡，跟一般字沒有
排版上的區別，靠專屬的人名清單（讀自各檔案末頁）排除。
"""

import csv
import re
from pathlib import Path

import pdfplumber

KET_CSV = Path("data/extracted_ket.csv")
OUTPUT_CSV = Path("data/extracted_ket_tagged.csv")

YLE_SOURCES = {
    "STARTERS": "data/source/starter word list.pdf",
    "MOVERS": "data/source/Movers.pdf",
    "FLYERS": "data/source/Flyers.pdf",
}

TAG_SET = {"adj", "adv", "conj", "det", "dis", "excl", "int", "n", "poss", "prep", "pron", "v"}
COLUMN_RATIOS = [0.0, 0.3024, 0.5040, 0.6887, 1.0]

# 讀自各檔案末頁「Names」清單。這些字在本文內文跟一般單字排版無異（例：'Mark n'
# 前後都是真的單字），無法用格式判斷，只能列出來直接排除。
# 'may' 不放進來：Flyers 的 'may (v)' / 'May (n，月份)' 是真的 A2 單字，
# 跟 Starters 內文裡註記 '(as in girl's name)' 的 May 是不同義項，用另一條規則處理。
EXCLUDE_NAMES = {
    "alex", "dan", "kim", "nick", "alice", "eva", "lucy", "pat", "ann", "anna",
    "ann/anna", "grace", "mark", "sam", "ben", "hugo", "matt", "sue", "bill", "jill", "tom",
    "charlie", "jack", "lily", "sally", "clare", "jane", "mary", "vicky",
    "daisy", "jim", "paul", "zoe", "fred", "julia", "peter",
    "betty", "george", "katy", "robert", "david", "harry", "michael", "sarah",
    "emma", "helen", "oliver", "sophia", "frank", "holly", "richard", "william",
}


def column_lines(page) -> list[list[str]]:
    bounds = [r * page.width for r in COLUMN_RATIOS]
    columns = []
    for i in range(len(bounds) - 1):
        crop = page.within_bbox((bounds[i], 0, min(bounds[i + 1], page.width), page.height))
        text = crop.extract_text() or ""
        columns.append([l.strip() for l in text.split("\n") if l.strip()])
    return columns


def last_token_is_tag(line: str) -> bool:
    if line.rstrip().endswith("+"):
        return False
    tokens = line.split()
    if not tokens:
        return False
    last = re.sub(r"[^a-z]", "", tokens[-1].lower())
    return last in TAG_SET


def merge_column(raw_lines: list[str]) -> list[str]:
    merged: list[str] = []
    for line in raw_lines:
        if merged and not last_token_is_tag(merged[-1]):
            merged[-1] = merged[-1] + " " + line
        else:
            merged.append(line)
    return merged


def extract_body_lines(pdf_path: str) -> list[str]:
    """回傳 A–Z 本文的合併後條目行（已排除圖例、頁首、Names/Numbers 附錄）。

    Names/Numbers/Letters & numbers 這些附錄說明只會出現在某一欄的尾端，
    不代表同一頁其他欄（可能還有沒讀到的真詞條）也該停止，所以停止旗標
    只對「當下這一欄」生效，不會跨欄、跨頁蔓延。
    """
    all_lines: list[str] = []
    started = False
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            for raw_col in column_lines(page):
                # 先過濾單一大寫字母的字母標題、Names/Numbers 附錄標記
                filtered = []
                for line in raw_col:
                    if re.fullmatch(r"[A-Z]", line):
                        if line == "A":
                            started = True
                        continue
                    if not started:
                        continue
                    if line in ("Names", "Numbers") or line.startswith("Letters &"):
                        break  # 只結束這一欄，其他欄照常繼續
                    # 少數字母沒有對應單字時的說明句，會被欄位裁切成殘片
                    # （例："(No words at th" / "is level)"），不是真的詞條
                    if "no words at th" in line.lower() or "level)" in line:
                        continue
                    filtered.append(line)
                all_lines.extend(merge_column(filtered))
    return all_lines


def line_to_headword(line: str) -> str | None:
    if "as in" in line.lower() and "name" in line.lower():
        return None  # 內文裡自己註記是人名的義項（例：May (as in girl's name)）

    no_parens = re.sub(r"\([^)]*\)", "", line)
    tokens = no_parens.split()
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


def extract_yle_headwords(pdf_path: str) -> set[str]:
    words: set[str] = set()
    for line in extract_body_lines(pdf_path):
        hw = line_to_headword(line)
        if hw is None:
            continue
        hw_lower = hw.lower()
        if hw_lower in EXCLUDE_NAMES:
            continue
        words.add(hw_lower)
    return words


def main() -> None:
    ket_rows = list(csv.DictReader(KET_CSV.open(encoding="utf-8")))

    # 官方 YLE 詞表（2018 年版起）各級只列「該級新增」的字，不是累加清單
    # （例：Movers.pdf 沒有 cat，Flyers.pdf 沒有 dog）。要做出規劃書要的
    # 累積式標記，得先各自比對出「首次出現在哪一級」，再往上疊加。
    yle_sets = {level: extract_yle_headwords(path) for level, path in YLE_SOURCES.items()}
    LEVEL_ORDER = ["STARTERS", "MOVERS", "FLYERS"]

    counts = {level: 0 for level in YLE_SOURCES}
    ket_only = 0
    for row in ket_rows:
        hw_lower = row["headword"].lower()
        first_level_idx = None
        for i, level in enumerate(LEVEL_ORDER):
            if hw_lower in yle_sets[level]:
                first_level_idx = i
                break

        tags = ["KET"]
        if first_level_idx is None:
            ket_only += 1
        else:
            for level in LEVEL_ORDER[first_level_idx:]:
                tags.append(level)
                counts[level] += 1
        row["level_tags"] = "{" + ",".join(tags) + "}"

    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as f:
        fieldnames = ["headword", "pos", "sense_note", "is_phrasal", "level_tags"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(ket_rows)

    print(f"STARTERS: {counts['STARTERS']} 筆")
    print(f"MOVERS:   {counts['MOVERS']} 筆")
    print(f"FLYERS:   {counts['FLYERS']} 筆")
    print(f"KET-only: {ket_only} 筆")
    print(f"寫入 {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
