"""X1-3：把 assets/cat/ 的四個姿態 SVG 原稿轉成 docs/js/catArt.js（程式用的資料）。

輸入：assets/cat/cat_black_{sit,stand,wave,tilt}.svg（設計原稿，程式不直接讀）
輸出：docs/js/catArt.js —— 自動產生，不要手改；原稿改了就重跑這支腳本。

為什麼要轉：
- 原稿的 head 群組四份完全相同，只有 transform 不同。轉成資料後 HEAD 只存一份，
  四個姿態共用；配件掛在 head 裡的 slot-*，畫一次就適用所有姿態（X1 設計決策）。
- inline SVG 的 <style> 和 id 會作用到整個頁面。原稿用 .line / .fur 這種通用 class、
  body / head / face 這種通用 id，直接塞進頁面會汙染其他元素，所以 class 和 id
  一律加上 cat- 前綴。
  不改成元素上的直接屬性：CSS class 規則會蓋過直接屬性（例如腳趾線
  class="crease" stroke-width="1.8"，實際畫出來是 .crease 的 2.5），改成直接屬性
  會讓 1.8 生效、外觀跟哥哥確認過的原稿不同。加前綴則外觀完全不變。
- <metadata>（C2PA 簽章）與註解跟畫面無關，去掉。

轉換前會先檢查：四個檔案的 head 內容與 <defs> 完全相同、群組結構一致，
不一致就停下來報錯，不默默產生錯的資料。
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "assets" / "cat"
OUT = ROOT / "docs" / "js" / "catArt.js"

POSES = ["sit", "stand", "wave", "tilt"]
POSE_LAYERS = ["shadow", "tail", "feet", "body", "arms"]
PREFIX = "cat-"


def prefix_names(markup: str) -> str:
    """class="a b" → class="cat-a cat-b"；id="x" → id="cat-x"。"""
    markup = re.sub(
        r'class="([^"]*)"',
        lambda m: 'class="' + " ".join(PREFIX + c for c in m.group(1).split()) + '"',
        markup,
    )
    markup = re.sub(r'\bid="([^"]*)"', lambda m: f'id="{PREFIX}{m.group(1)}"', markup)
    return markup


def prefix_style(css: str) -> str:
    """.line { … } → .cat-line { … }"""
    return re.sub(r"\.([A-Za-z][\w-]*)", lambda m: f".{PREFIX}{m.group(1)}", css)


def squeeze(markup: str) -> str:
    """去掉註解、壓縮空白，讓產生的 JS 字串短一點（不影響畫面）。"""
    markup = re.sub(r"<!--.*?-->", "", markup, flags=re.S)
    markup = re.sub(r"\s+", " ", markup)
    markup = re.sub(r">\s+<", "><", markup)
    return markup.strip()


def extract_group(svg: str, group_id: str) -> tuple[str, str]:
    """回傳 (開頭標籤, 群組內容)。依 <g> 巢狀層數找對應的 </g>。"""
    start = svg.index(f'<g id="{group_id}"')
    open_end = svg.index(">", start) + 1
    open_tag = svg[start:open_end]
    if open_tag.endswith("/>"):
        return open_tag, ""
    depth, i = 1, open_end
    tag_re = re.compile(r"<g\b[^>]*?(/?)>|</g>")
    while depth:
        m = tag_re.search(svg, i)
        if m.group(0) == "</g>":
            depth -= 1
        elif m.group(1) != "/":
            depth += 1
        i = m.end()
    return open_tag, svg[open_end : i - len("</g>")]


def main() -> None:
    sources = {p: (SRC_DIR / f"cat_black_{p}.svg").read_text(encoding="utf-8") for p in POSES}

    heads, defs_set, poses = {}, set(), {}
    for pose, svg in sources.items():
        if 'viewBox="0 0 200 280"' not in svg:
            raise SystemExit(f"{pose}: viewBox 不是 0 0 200 280")
        defs_set.add(squeeze(re.search(r"<defs>(.*?)</defs>", svg, re.S).group(1)))
        if "url(#" in svg:
            raise SystemExit(f"{pose}: 有 url(#…) 引用，前綴處理需要另外改引用端")

        head_tag, head_inner = extract_group(svg, "head")
        heads[pose] = squeeze(head_inner)
        transform = re.search(r'transform="([^"]*)"', head_tag).group(1)

        layers = {}
        for layer in POSE_LAYERS:
            tag, inner = extract_group(svg, layer)
            # 保留群組本身的屬性（例如 shadow 的 display="none"），只把 id 加前綴
            layers[layer] = prefix_names(squeeze(tag + inner + "</g>"))
        poses[pose] = {**layers, "headTransform": transform}

    if len(set(heads.values())) != 1:
        raise SystemExit("四個姿態的 head 內容不一致，請先確認原稿")
    if len(defs_set) != 1:
        raise SystemExit("四個姿態的 <defs> 不一致，請先確認原稿")

    style_css = re.search(r"<style>(.*?)</style>", next(iter(defs_set)), re.S).group(1)

    lines = [
        "// 自動產生，不要手改：由 scripts/build_cat_art.py 從 assets/cat/ 的原稿轉出。",
        "// 原稿改了就重跑腳本。class / id 已加 cat- 前綴（避免汙染頁面），",
        "// 外觀與原稿相同。renderCat 在 cat.js。",
        "",
        f"export const CAT_STYLE = {json.dumps(prefix_style(squeeze(style_css)), ensure_ascii=False)};",
        "",
        "// head 群組內容，四個姿態共用一份（含 ears、face、slot-face、slot-hat、slot-neck）",
        f"export const HEAD = {json.dumps(prefix_names(heads['sit']), ensure_ascii=False)};",
        "",
        "export const POSES = {",
    ]
    for pose in POSES:
        lines.append(f"  {pose}: {{")
        for key, value in poses[pose].items():
            lines.append(f"    {key}: {json.dumps(value, ensure_ascii=False)},")
        lines.append("  },")
    lines.append("};")
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"寫出 {OUT.relative_to(ROOT)}（{OUT.stat().st_size} bytes）")


if __name__ == "__main__":
    main()
