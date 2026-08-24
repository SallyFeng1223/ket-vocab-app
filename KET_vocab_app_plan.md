# A2 KET 單字拼字訓練 App — 開發規劃書

**版本** v1.3　**製定日** 2026-08-24　**目標考試日** 2026-12-20（A2 Key for Schools 青少年版，已報名）

---

## 0. 這份文件怎麼用

- **W1–W7 開發期**：每週開工前看一次「§9 時程表」當週段落。
- **W8 之後維運期**：只看「§10 維運檢查清單」。
- **任何時候想加新功能**：先翻「§11 範圍控制」，確認是否該擋下。
- **忘記為什麼這樣設計**：看「§4.6 設計決策紀錄」。

---

## 1. 專案定位與邊界

### 1.1 這個工具做什麼

專注在 **認字（英→中辨識）** 與 **拼字（能正確拼出）** 兩項能力，附帶基礎文法變化訓練。

### 1.2 這個工具明確不做什麼

| 不做 | 原因 |
|---|---|
| 聽力訓練 | 已有其他訓練方式；且跨裝置音訊問題風險高 |
| 口說訓練 | 需真人對練，app 無法取代 |
| 自由造句批改 | 自動批改易誤判，小孩被誤判會嚴重挫折。改用「詞塊排序」達成語序訓練 |
| 排行榜 | 兩兄弟程度差距大，比較只會打擊弟弟 |
| 考古題模擬 | 由紙本官方 sample papers 處理 |

### 1.3 使用者

| | 哥哥 | 弟弟 |
|---|---|---|
| 年級 | 小三 | 小一 |
| 現況程度 | Movers | Starters（剛進入拼字讀寫） |
| 目標 | 12/20 A2 Key for Schools | 無死線，穩定累積 |
| 詞池 | 全 A2 KET 表（約 1,500） | 僅 Starters 標記字（約 450） |
| 開放題型 | L0–L6 全開 | 僅 L0 / L1 / L2 |
| 鍵盤輸入 | 開放 | **關閉**（只用字母磚） |
| 文法題 | 開放 | 關閉 |
| 每日新字上限 | 10–12 | 4–5 |
| 每日份量 | 30 分鐘（約 3 輪 × 10 題） | 10–15 分鐘（約 1–2 輪） |

> **兄弟資料完全分離**：詞池、SRS 卡片、統計、金幣、寵物皆以 `profile_id` 隔離，無任何共用狀態。

### 1.4 期程與可達成目標

從 2026-08-23 到 2026-12-20 共 **119 天 / 17 週**。哥哥為 Movers 程度，與 A2 表重疊約 700–800 字，實際待學缺口約 **700–900 字**。

以每天 30 分鐘、每週 6 天推算，總作答量約 **11,000 題次**：

| 能力 | 12/20 前預期達成 |
|---|---|
| 認得（英→中） | 全表 90%+（8/24 診斷已達 96%，此後以維持性複習為主，不投入新增內容產能） |
| 拼得出 | 核心 900–1,100 字（上修——認字工時釋出，且 L1/L2 payload 可規則式生成，成本遠低於原預期） |
| 文法運用 | KET 核心句型有感（不變，見 §5.3 範圍） |

> **8/24 診斷結果與影響**：80 題 L0 認字測驗整體 96% 正確，四層皆 ≥90%，
> 已無鑑別力可排出內容優先序（詳見 PROGRESS.md 診斷結果區）。隨後以紙筆抽測 20 字拼寫，
> 正確率低於 40%，其中 `weather` 一字在認字測驗中 1.5 秒內即答對，紙筆卻拼錯——
> 直接印證 §3.1「認字與拼字是獨立技能」的設計前提。
>
> 據此判斷：認字能力對他而言已接近解決，**剩餘四個月的主要價值在拼字**。
> 原訂 A8（為剩餘 1,420 字生成 L0 干擾選項）取消，改為優先開發 L1/L2 拼字題型並提前至 W2。
> 詳見 §9 時程表與 §13 決策紀錄第 7、8 項。

⚠️ **提醒**：Reading & Writing 佔 KET 總分 50%，其中 Part 6（寫 25 字留言）、Part 7（看圖三句故事）是題型技巧，本 app 不涵蓋，須另行安排（建議 11 月中起）。

---

## 2. 技術架構

| 層 | 選型 | 說明 |
|---|---|---|
| 前端 | 靜態網頁（原生 JS 或輕量框架） | 沿用既有 Claude Code 開發模式 |
| 資料 | Supabase (PostgreSQL) | 解決 iPad Safari 清 localStorage 導致資料歸零的風險 |
| 部署 | GitHub Pages | 免費、版本可回溯 |
| 本地快取 | localStorage | **僅作離線暫存與加速，不作為唯一真相來源** |
| 裝置 | iPad（主要） | 觸控優先設計；字母磚、詞塊拖曳為主要互動 |

### 2.2 垂直切片原則（解釋功能上線順序）

功能不是「一層一層做完」（先做完資料層、再做完介面層），而是**先讓最細的一條路從頭通到尾，再往上長肉**。

W1 的診斷就是第一條切片：出題畫面 → 判分 → 寫入 `attempts`。它**不含** SRS 引擎、profile 管理、session、金幣。

**這條切片不是拋棄式的**，它就是正式遊戲介面的第一塊。W2 是在上面接引擎，不是重寫。

**診斷模式與日常模式共用同一套元件**，差別只在「這 10 題從哪裡來」：

| | 出題來源 | 上線 |
|---|---|---|
| 診斷模式 | 固定 80 題清單 | W1 |
| 日常模式 | SRS 排程器 | W2 |

`sessions.session_type` 用 `diagnostic` / `daily` 區分，統計時分開。

診斷模式之後還會再用到：弟弟上線時跑一次（Starters 版）、11 月中用同一份 80 題複測，與 8 月結果對比可直接看出成長幅度。

### 2.3 進度追蹤

**三種進度是不同的東西，用不同工具，不要合併成一個儀表板。**

| 進度類型 | 工具 | 說明 |
|---|---|---|
| 開發進度 | repo 內 `PROGRESS.md` 勾選清單 | 約 40 項，checklist 就夠。每次 commit 順手更新 |
| 內容製作進度 | Supabase 存檔 SQL 查詢 | 1,500 字 × 多個欄位的完成度，**這個才真的需要查詢** |
| 學習進度 | 家長端統計頁（見 §8.2） | W6–W7 開發 |

⚠️ **不要為了追蹤開發而另外開發儀表板。** 自建一個開發進度 dashboard 約需 5–10 小時，等於吃掉 1.5 週的開發預算，而它在 W8 之後就沒用了。這是範圍膨脹的經典入口。

**內容製作進度查詢**（存成 Supabase saved query，每週跑一次）：

```sql
select
  unnest(level_tags) as level,
  count(*) as 總字數,
  count(zh) as 有中文,
  count(*) filter (
    where exists (select 1 from items i
                  where i.word_id = w.id and i.skill = 'L0' and i.status = 'active')
  ) as 有L0題,
  count(*) filter (
    where exists (select 1 from items i
                  where i.word_id = w.id and i.example_sentence is not null)
  ) as 有例句
from words w
where status = 'active'
group by level
order by level;
```

這張表會直接告訴你「KET-only 還有 400 字沒例句」，比任何自製介面都快。

### 2.4 開發紀律（重要）

1. **一次只加一個功能**，完成即 commit，commit message 寫清楚做了什麼。
2. 每完成一個階段打 tag（`v0.1-srs-core`、`v0.2-spelling` …），方便回退。
3. **任何 bug 卡超過 40 分鐘**：先記進「待辦」，繞過去做下一項，不要在死線專案上死磕。
4. Supabase anon key 會暴露在前端 → **RLS 必須開啟**（見 §4.5）。

---

## 3. 核心設計原則

### 3.1 記憶卡的單位是「單字 × 技能」，不是「單字」

這是整個系統準確度的關鍵。同一個字 `beautiful`：

- 「認得」可能已經很熟（stability 高、下次複習在 20 天後）
- 「拼得出」可能還是新手（stability 低、明天就要再考）

若只用單字當單位，系統會誤判他已經會了，拼字永遠練不起來。

### 3.2 難度由資料決定，不由初始標註決定

初始難度分數只是冷啟動用的先驗值。一旦累積作答資料，**以學生實際表現覆蓋**。

### 3.3 挫折控制優先於效率

小三學生對重複失敗的耐受度極低。連錯 3 次的字**必須降級題型並給提示**，不可無限重複同一難度。

### 3.4 原始資料完整保留

`attempts` 表保留每一題的原始紀錄（含實際輸入內容、反應時間），不只存彙總。這樣之後想換演算法、重算參數、分析錯誤模式都能回頭重跑。

---

## 4. 資料庫完整設計

> 本節為**定稿規格**。目標是後期不需要 breaking change。所有「未來可能要」的欄位都已預留。

### 4.1 ER 概觀

```
profiles ──┬── cards ────── words ──┬── word_forms
           │                        └── items ──┬── item_variants
           ├── attempts ─────────────────────────┘
           ├── sessions
           ├── daily_stats
           ├── wallet
           ├── owned_items ── shop_items
           └── pet_state

content_issues ── items（維運期回報用）
app_settings（全域設定）
```

### 4.2 表格定義

#### `profiles` — 使用者

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | '哥哥' / '弟弟' |
| `track` | text | `'KET'` / `'STARTERS'` — 決定詞池與題型上限 |
| `daily_new_limit` | int | 每日新字上限 |
| `daily_target_items` | int | 每日目標題數 |
| `allowed_skills` | text[] | 例 `{L0,L1,L2}`；控制題型開放 |
| `keyboard_enabled` | bool | 弟弟為 false |
| `avatar_key` | text | 介面小圖示 |
| `created_at` | timestamptz | |

#### `words` — 單字主檔

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid PK | |
| `headword` | text UNIQUE | 例 `beautiful`、`look after` |
| `pos` | text | `n / v / adj / adv / prep / conj / pron / det / mv / phr v / exclam` |
| `sense_note` | text | PDF 中的語意限定，例 bank → `I changed my money in a bank` |
| `zh` | text | 中文釋義 |
| `zh_extra` | text | 補充說明（可空） |
| `level_tags` | text[] | `{STARTERS}` / `{MOVERS}` / `{KET}` — **可多值** |
| `topics` | text[] | Appendix 2 主題，例 `{Food and Drink}` |
| `is_phrasal` | bool | 片語動詞 |
| `variant_of` | uuid FK→words | 英美拼字對照，例 colour ↔ color |
| `spelling_regularity` | text | `regular / semi / irregular` — 標出 because、beautiful、friend、through 這類錯誤集中區 |
| `concreteness` | int 1–5 | 1=抽象（advice）5=具體（cat）；決定引入順序 |
| `freq_rank` | int | 外部語料頻率排名（可空） |
| `syllables` | int | |
| `initial_difficulty` | numeric | 冷啟動先驗值（由上列欄位計算） |
| `audio_url` | text | **預留**，Phase 1 不填 |
| `image_url` | text | **預留**，供弟弟圖像題用 |
| `status` | text | `active / retired` |
| `created_at` / `updated_at` | timestamptz | |

#### `word_forms` — 變化形（獨立表，不塞 JSON）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid PK | |
| `word_id` | uuid FK→words | |
| `form_type` | text | `past / past_participle / third_person / ing / plural / comparative / superlative` |
| `form` | text | 例 `went` |
| `is_irregular` | bool | |

> 獨立成表的理由：文法題（L5）需要依 `form_type` 反查出題，若存 JSON 會難以查詢與統計「不規則動詞掌握度」。

#### `items` — 題目

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid PK | |
| `word_id` | uuid FK→words | |
| `skill` | text | `L0 / L1 / L2 / L3 / L4 / L5 / L6` |
| `prompt` | text | 題幹（含 `___` 空格） |
| `answer` | text | 標準答案 |
| `alt_answers` | text[] | 可接受的其他答案（英美拼字、縮寫等） |
| `payload` | jsonb | **題型專屬資料**（見下方說明） |
| `example_sentence` | text | 完整例句（答對後顯示） |
| `zh_sentence` | text | 例句中譯 |
| `grammar_note` | text | 簡易文法說明，例「過去式，go → went」 |
| `grammar_tag` | text | 例 `past_simple`、`comparative`；供文法弱點統計 |
| `target_form_type` | text | L5 專用，指向 `word_forms.form_type` |
| `difficulty_hint` | numeric | 題目層級的額外難度修正 |
| `content_version` | int | 內容修改時遞增；歷史 attempts 可追溯當時版本 |
| `status` | text | `draft / active / retired` |
| `qa_checked` | bool | 是否已人工抽查 |
| `created_at` / `updated_at` | timestamptz | |

**`payload` 的 jsonb 結構（依 skill 不同）**

```jsonc
// L0 認字：英→中四選一
{ "distractors_zh": ["醜的", "快樂的", "困難的"] }

// L1 辨形：相似拼法三選一
{ "wrong_spellings": ["beutiful", "beautifull"] }

// L2 字母磚：打散字母
{ "tiles": ["b","e","a","u","t","i","f","u","l"], "extra_tiles": ["s","r"] }

// L3 首字母提示
{ "hint_prefix": "b", "masked": "b________" }

// L4 完整拼寫
{ }

// L5 文法變化
{ "base_form": "go", "target": "past" }

// L6 詞塊排序
{ "chunks": ["Yesterday", "he", "went", "to school"], "correct_order": [0,1,2,3] }
```

> **這是最重要的擴充預留**：新增題型時只需新增 skill 值與 payload 結構，**不需改 schema**。

#### `cards` — SRS 記憶狀態

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid PK | |
| `profile_id` | uuid FK | |
| `word_id` | uuid FK | |
| `skill` | text | **與 profile_id、word_id 共同組成 UNIQUE 約束** |
| `state` | text | `new / learning / review / relearning` |
| `stability` | numeric | FSRS 記憶穩定度 |
| `difficulty` | numeric | FSRS 難度 |
| `due_at` | timestamptz | 下次複習時間 |
| `last_review_at` | timestamptz | |
| `reps` | int | 總複習次數 |
| `lapses` | int | 遺忘次數（連錯計數）— **驅動易錯字加權** |
| `consecutive_wrong` | int | 連續答錯，達 3 觸發降級 |
| `demoted_to` | text | 降級後的暫時題型 |
| `retrievability` | numeric | 快取欄位，估計保留率（統計用） |
| `suspended` | bool | 手動暫停此卡 |

**UNIQUE (`profile_id`, `word_id`, `skill`)** ← 這條約束是 §3.1 的實作核心，務必建立。

#### `sessions` — 一次遊戲（10 題）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid PK | |
| `profile_id` | uuid FK | |
| `started_at` / `ended_at` | timestamptz | |
| `item_count` | int | |
| `correct_count` | int | |
| `coins_earned` | int | |
| `session_type` | text | `daily / review_mistakes / diagnostic` |
| `completed` | bool | 中途離開為 false |

#### `attempts` — 作答原始紀錄（**核心分析資料，勿刪勿彙總取代**）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid PK | |
| `profile_id` | uuid FK | |
| `session_id` | uuid FK | |
| `item_id` | uuid FK | |
| `word_id` | uuid FK | 冗餘欄位，加速查詢 |
| `skill` | text | 冗餘欄位 |
| `item_content_version` | int | 對應當時的題目版本 |
| `is_correct` | bool | |
| `answer_given` | text | **學生實際輸入**——分析拼錯模式的關鍵 |
| `response_ms` | int | 反應時間 |
| `hint_used` | bool | |
| `attempt_no_in_item` | int | 同題第幾次嘗試 |
| `created_at` | timestamptz | |

#### `daily_stats` — 每日彙總（可由 attempts 重算）

| 欄位 | 型別 |
|---|---|
| `profile_id` uuid FK · `date` date（複合 PK） |
| `items_done` int · `correct` int · `new_words` int · `minutes` int |
| `coins_earned` int · `streak_day` int · `target_met` bool |

#### `wallet` / `shop_items` / `owned_items` / `pet_state` — 獎勵系統

**`wallet`**：`profile_id` PK · `coins` int · `gems` int · `updated_at`

**`shop_items`**：`id` · `name` · `category`（`hat / clothes / food / toy / background`）· `price` · `asset_key` · `unlock_condition` jsonb（例 `{"streak_days":30}`）· `sort_order`

**`owned_items`**：`profile_id` · `shop_item_id` · `acquired_at` · `is_equipped`

**`pet_state`**：`profile_id` PK · `pet_key` · `nickname` · `mood` int · `fed_at` · `level` int · `equipped` jsonb

#### `content_issues` — 內容錯誤回報（維運期主力工具）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` uuid PK · `item_id` uuid FK · `profile_id` uuid FK | | |
| `issue_type` | text | `wrong_answer / bad_sentence / too_hard / typo / other` |
| `note` | text | |
| `status` | text | `open / fixed / wontfix` |
| `created_at` | timestamptz | |

> 遊戲畫面放一顆小小的「這題怪怪的」按鈕，讓小孩自己按。W8 之後你每週看一次這張表——這會是修內容最有效率的來源。

#### `app_settings` — 全域參數

`key` text PK · `value` jsonb

存出題配比、每日金幣上限、降級門檻等。**放資料庫而非寫死在程式**，之後調整不用改 code。

### 4.3 索引建議

```sql
CREATE UNIQUE INDEX ON cards (profile_id, word_id, skill);
CREATE INDEX ON cards (profile_id, due_at) WHERE suspended = false;
CREATE INDEX ON cards (profile_id, lapses DESC);
CREATE INDEX ON attempts (profile_id, created_at DESC);
CREATE INDEX ON attempts (word_id, is_correct);
CREATE INDEX ON items (word_id, skill) WHERE status = 'active';
CREATE INDEX ON words USING GIN (level_tags);
CREATE INDEX ON words USING GIN (topics);
```

### 4.4 冗餘欄位的取捨

`attempts` 中的 `word_id`、`skill` 可由 `item_id` join 取得，但仍冗餘儲存。理由：統計查詢極頻繁，且 item 可能被 retire。**這是刻意的反正規化，不是設計失誤。**

### 4.5 RLS 政策

即使只有兩個小孩使用，anon key 暴露在前端 = 任何人可讀寫。最低限度：

- `words` / `items` / `shop_items`：允許 anon **只讀**
- `profiles` / `cards` / `attempts` / `wallet` / `pet_state` 等：需通過驗證
- 最簡方案：建一個共用帳號登入（你保管密碼），家中裝置保持登入狀態

### 4.6 設計決策紀錄（避免日後推翻）

| 決策 | 理由 |
|---|---|
| cards 以 (profile, word, skill) 為單位 | 認字與拼字是獨立技能，合併會誤判掌握度 |
| word_forms 獨立成表 | L5 文法題需反查；需統計不規則動詞掌握度 |
| items.payload 用 jsonb | 新增題型不需 migration |
| attempts 保留 answer_given | 分析拼錯模式；重算演算法參數 |
| items 有 content_version | 修內容後歷史紀錄仍可追溯 |
| audio_url / image_url 預留 | 未來若做音訊或圖像題不需改表 |
| app_settings 存參數 | 調整出題配比不需改程式 |
| variant_of 欄位 | 處理英美拼字（colour/color、practise/practice） |

---

## 5. 題型設計

### 5.1 題型階梯

| 代碼 | 題型 | 互動 | 主要訓練 |
|---|---|---|---|
| **L0** | 認字 | 英→中四選一 | 語意辨識 |
| **L1** | 辨形 | 相似拼法三選一（beautiful / beutiful / beautifull） | **拼字辨識，CP 值最高** |
| **L2** | 字母磚 | 點擊打散字母重組 | 拼字（免鍵盤，適合平板與弟弟） |
| **L3** | 首字母提示填空 | `She is very b________.` | 拼字（有鷹架） |
| **L4** | 完整拼寫填空 | 情境句填空，全打 | 拼字（無鷹架） |
| **L5** | 文法變化 | `Yesterday he ___ (go) to school.` | 時態、變化形 |
| **L6** | 詞塊排序 | 拖曳詞塊成正確語序 | 語序、句構 |

### 5.2 晉級規則

一個字在某 skill 的卡片達到 `state = review` 且 `stability` 超過門檻後，自動為下一個 skill 建立新卡片。順序：L0 → L1 → L2 → L3 → L4，動詞另外走 L5，句型另外走 L6。

### 5.3 L5 文法範圍（鎖定，勿擴張）

- be 動詞
- 現在簡單式第三人稱 -s
- 現在進行式
- 過去簡單式（規則 + 最高頻 40 個不規則動詞）
- will / be going to
- 比較級、最高級
- 可數 / 不可數（some, any, much, many, a few）

### 5.4 一輪 10 題的組成

| 類別 | 題數 | 說明 |
|---|---|---|
| 到期複習 | 5 | `due_at <= now`，依 due 由舊到新 |
| 易錯加權 | 3 | `lapses` 高的卡，優先出低一階題型 |
| 新字 | 2 | 未超過每日上限時才出 |

比例存在 `app_settings`，可調。

### 5.5 挫折控制

- `consecutive_wrong >= 3` → 該卡 `demoted_to` 設為低一階 skill，並在題目顯示提示
- 降級後連對 2 次 → 解除降級
- 同一 session 內同一個字最多出現 2 次
- 答錯**不扣金幣**，只是不加

### 5.6 L1／L2 payload 生成策略（規則式，非 LLM）

**這是 v1.3 最重要的策略調整**：L1、L2 的 payload 內容可以完全用程式規則產生，
不需要 LLM 批次生成、不需要人工抽查（§4.6 已為此類擴充預留 `items.payload` jsonb 欄位）。

這與例句、文法提示等內容不同——那些需要語意判斷，維持原訂 LLM 生成 + 人工抽查流程（§9 階段 C）。

**L2 字母磚**：

```
輸入：headword（例：beautiful）
1. 拆成字母陣列：["b","e","a","u","t","i","f","u","l"]
2. 從字母頻率表隨機抽 2–3 個「常見但不在此字中」的字母作為 extra_tiles
3. tiles 陣列整體打亂順序
```

純字串處理，1,733 字可一次跑完，零人工判斷成本。

**L1 辨形（三選一：正確拼法 + 2 個錯誤拼法）**：

依固定規則庫產生錯誤拼法，規則庫依 `spelling_regularity`（§4.2 已預留此欄位，
本階段可以簡化版啟用）分類套用：

| 規則 | 範例 |
|---|---|
| 雙寫字母去掉一個 | beautiful → beutiful |
| 字尾多寫一個字母 | beautiful → beautifull |
| 母音互換（ie/ei、a/e） | friend → freind |
| 常見字尾誤拼（-tion/-sion、-able/-ible） | station → stasion |
| ph/f 互換 | phone → fone |

若規則庫套用後找不到兩個「看起來合理」的錯誤拼法（例如太短的字，如 `a`、`an`），
該字**不生成 L1 題**，僅保留 L2。這類字數量很少，不影響整體覆蓋率。

**驗收**：兩支生成腳本各跑一次全表，結果存進 `items`，`qa_checked` 設為 true
（因為是規則產生、非語意生成，不需要人工抽查這道關卡）。

---

## 6. SRS 引擎

- 演算法採 **FSRS**（優先）或簡化 SM-2（若實作卡關的退路）
- 評分維度：正確與否 + 反應時間 + 是否用提示 → 映射到 Again / Hard / Good / Easy
- 每日新卡上限由 `profiles.daily_new_limit` 控制，避免複習債務暴增
- **每日排程於本地計算後寫回 Supabase**，避免每題往返延遲

---

## 7. 獎勵系統（輔助，與核心解耦）

### 7.1 原則

1. 獎勵層為**獨立模組**，日後換主題不動核心
2. 金幣綁「**正確率 + 連續天數**」，**不綁作答量**——否則會學會亂猜刷題
3. 設每日金幣上限；「今日目標達成」給一次性大獎
4. 設中長期目標（例：連續 30 天解鎖新寵物），對抗 2–3 週的新鮮感衰退

### 7.2 MVP 素材規模

**已決定：簡單 SVG 自製。**

1 隻寵物（貓）× 4 種表情 × 10 件配件 × 3 種食物。

SVG 的實作建議：
- 寵物拆成分層群組（`<g id="body">`、`<g id="face">`、`<g id="hat">`…），配件只是切換某層的顯示，不用重畫整隻
- 表情只換 `<g id="face">` 內容（開心 / 普通 / 想睡 / 想吃）
- 配件用「錨點座標」定位，新增配件只需一個 SVG 片段 + 一組座標
- 全部 SVG 內嵌在程式碼或存成獨立檔，`shop_items.asset_key` 指向對應片段

這樣新增配件的邊際成本約 10–15 分鐘一件，可以在維運期慢慢加，當作維持新鮮感的手段。

---

## 8. 統計報表

### 8.1 給小孩看

- 今日進度環（完成 / 目標）
- 連續天數
- 金幣與寵物狀態
- 本週新學會的字（列出來，有成就感）

### 8.2 給你看（家長端）

- **完成度用 SRS 估計保留率計算，不用「答對次數 ÷ 總數」**（答對一次不等於記得）
- 各 `level_tags` / `topics` 的掌握比例
- 易錯字 Top 20（依 `lapses` 排序）
- 常見拼錯模式（從 `attempts.answer_given` 分析）
- 文法弱點（依 `items.grammar_tag` 分組正確率）
- 距離 12/20 的預估覆蓋曲線

---

## 9. 17 週時程表

### 階段 A：資料奠基 + 診斷（W1，8/24–8/30）

**本週最緊，請嚴格照順序做。**

| 順序 | 項目 | 說明 |
|---|---|---|
| A1 | **新開 Supabase 專案** | 不沿用作業管理系統專案，避免 schema 混雜 |
| A2 | 建立完整 schema | 依 §4 一次到位；開啟 RLS，建共用帳號 |
| A3 | **全表骨架資料** | 1,500 字的 headword / pos / zh / level_tags / topics。這步純機械，可快速批次生成 |
| A4 | **診斷抽樣 80 字的完整題目** | 只對這 80 字生成 L0 干擾選項 |
| A5 | 出題畫面第一版（診斷模式） | **正式介面的第一塊，非拋棄式**。此版不含 SRS 引擎、profile、金幣（見 §2.2） |
| A6 | **跑診斷測驗** | 分 2 次進行，每次 40 題 |
| A7 | 依診斷結果決定 A8 優先序 | 見下方說明 |
| ~~A8~~ | ~~其餘 1,420 字的 L0 干擾選項~~ | **8/24 取消**。診斷顯示 L0 認字已達 96%，無需再擴充。原因與後續見 §1.4、§13 |

> **診斷不會改變詞池。** 哥哥的詞池永遠是全 A2 表。診斷結果只影響兩件事：(1) `cards` 初始 stability，(2) **你的內容生成優先序**。後者才是主要價值——它省的是你的工時，不是他的時間。

**診斷抽樣設計（80 題）**

| 層 | 題數 | 目的 |
|---|---|---|
| Starters | 15 | 確認底線（預期高分） |
| Movers | 30 | 找出 Movers 內的漏洞 |
| KET-only 高頻具體 | 20 | 主要學習區的起點 |
| KET-only 低頻抽象 | 15 | 確認天花板 |

**診斷能得到什麼 / 不能得到什麼**

- ✅ 得到：各層級的掌握**百分比**，用來決定內容深化的優先順序
- ❌ 得不到：精確的逐字缺口清單（80 題無法覆蓋 1,500 字）
- 逐字缺口會在實際使用 2–3 週後由 `cards` 資料自然浮現

**跟哥哥怎麼說**：「這不是考試，是讓電腦知道你已經會哪些，才不會浪費你時間重複練。」避免他因為緊張而表現失真。

**驗收**：schema 建好、骨架資料就位、診斷已完成並得出分層百分比。

> ⚠️ **W1 若時間不足**：A8 可以延後，但 A1–A7 必須完成。骨架資料若只能做部分，優先做 **Movers + KET-only 高頻具體**這兩層——這是他的主要學習區。

### 階段 B：核心引擎上線（W2，8/31–9/6）

| 項目 | 說明 |
|---|---|
| B1 | Profile 選擇畫面 |
| B2 | SRS 引擎（FSRS）+ 出題排程 |
| B3 | **L1 辨形題 + L2 字母磚題**（原訂 W3–W4 提前至此。兩者 payload 皆規則式生成，見新增 §5.6） |
| B4 | Session 流程（10 題一輪、結算畫面） |
| B5 | attempts / cards 寫入 |
| B6 | **金幣計數 + 靜態貓咪 SVG**（先不做商店） |
| B7 | 用診斷結果初始化 cards：**L0 全數給高初始 stability（維持性複習，非新學）**；每個字直接建立 L1 卡片作為起點 |

**平行進行**：L1/L2 的 payload 為規則式生成（見 §5.6），可在 W2 開工前由腳本一次跑完全表，
不需人工排優先序、不需等 A7 結果。例句、文法提示等**仍需 LLM 生成的內容**維持原計畫，
於 W3（階段 C）依實際 `cards` 缺口資料開始，不提前。

**B6 的理由**：完整商店在 W5 才上，但如果 W2–W4 完全沒有任何獎勵回饋，前三週最需要建立習慣的時期反而最枯燥。先讓金幣會累積、貓咪看得到，就足以撐到 W5。

**🔴 里程碑：W2 結束哥哥開始每天使用。** 不等功能齊全。

### 階段 C：內容深化與拼寫（W3–W4，9/7–9/20）

| 項目 | 說明 |
|---|---|
| C1 | **依 W2–W3 實際 cards 資料修正優先序**——此時逐字缺口開始浮現，比診斷精確得多 |
| C2 | 持續生成深度內容（例句、文法提示、變化形），**優先做已確認不會的字** |
| C3 | 例句人工抽查（每批抽 10 句） |
| C4 | L1 辨形題、L3 首字母提示、L4 完整拼寫 |
| C5 | 「這題怪怪的」回報按鈕 → `content_issues` |

> **內容生成量的實際控制**：不要一開始就衝 1,500 字的例句。先做確認缺口的 300–400 字，用完再補。**未被排入複習的字，例句做了也是浪費。**

**例句生成約束**（寫進 prompt）：
- 句中其他單字必須在 A2 詞表內
- 句長 6–12 字
- 情境貼近小學生生活
- **避開敏感主題**（戰爭、政治等 Cambridge 明列排除項）

### 階段 D：獎勵系統（W5，9/21–9/27）

寵物、金幣、商店、配件。素材備齊後才動工。

### 階段 E：文法與統計（W6–W7，9/28–10/11）

| 項目 | 說明 |
|---|---|
| E1 | L5 文法變化題（範圍見 §5.3） |
| E2 | L6 詞塊排序題 |
| E3 | 家長端統計頁 |
| E4 | 弟弟 Starters 設定（詞池篩選、題型上限、關閉鍵盤） |

**驗收**：全題型可跑、兩個 profile 皆正常、統計數字合理。

### 🛑 階段 F：凍結開發 — 維運期（W8–W17，10/12–12/20）

**W8 起停止新增功能。** 每週投入約 **1–2 小時**，只做：

1. 修使用中冒出的 bug
2. 處理 `content_issues` 回報
3. 看錯題報表，針對弱點加練習

**剩餘 3–4 小時轉去陪讀**（聽力、口說、題型技巧）。

**維運期關鍵日期**

| 日期 | 事項 |
|---|---|
| 10/12 | 開發凍結生效 |
| 11/15 | 開始 Reading & Writing 題型訓練（Part 6、Part 7） |
| 12/13 | app 使用量減半，改以複習錯題本為主 |
| 12/20 | **考試日** |

---

## 10. 維運檢查清單（W8 之後每週跑一次，約 30 分鐘）

- [ ] 查 `content_issues` 有無 `status = open`
- [ ] 跑一次內容進度查詢（§2.3），確認缺口字的例句補齊進度
- [ ] 看易錯字 Top 20，判斷是「真的難」還是「題目有問題」
- [ ] 看文法弱點分組正確率，決定是否加練
- [ ] 確認每日 streak 沒斷；若連續兩天未達標，找原因（太難？無聊？）
- [ ] 確認 Supabase 資料正常寫入
- [ ] 每月一次：匯出資料庫備份到雲端硬碟

---

## 11. 範圍控制（想加新功能時先看這裡）

**W8 之後任何新功能一律預設拒絕。** 例外只有一種：不改就會導致小孩不想用。

已明確排除、不再重新討論的項目：

- ❌ 音訊 / 發音（跨裝置問題風險高，已有其他訓練管道）
- ❌ 自由造句自動批改（誤判風險）
- ❌ 排行榜
- ❌ 多人對戰
- ❌ 考古題模組
- ❌ 手機版適配（固定用 iPad）
- ❌ **自建開發進度儀表板**（用 `PROGRESS.md` + Supabase saved query 即可，見 §2.3）

想到的新點子請記到「v2 願望清單」，考完再說。

---

## 12. 風險登記表

| 風險 | 等級 | 對策 | 狀態 |
|---|---|---|---|
| 內容製作量過大（4,500 句例句） | 🟠 中 | 8/24 診斷後範圍已限縮：L0/L1/L2 皆規則式生成或已近天花板，例句類 LLM 內容延後至 W3 依實際缺口生成，量會小於原估 | 已規劃，風險降級 |
| 例句品質（超綱詞、不自然） | 🟠 中 | 生成加白名單約束 + 每批抽查 10 句 | 已規劃 |
| 動機衰退（2–3 週關卡） | 🟠 中 | 寵物中長期目標；每日份量固定，做完就收 | 已規劃 |
| 範圍膨脹導致排擠學習 | 🟠 中 | W8 硬性凍結；v2 願望清單 | 已規劃 |
| 忽略非單字項目（R&W 題型） | 🟠 中 | 11/15 已排入行事曆 | 待執行 |
| 資料遺失 | 🟢 低 | Supabase + 每月匯出備份 | 已解除 |
| 開發卡關 | 🟢 低 | Claude Code + 既有經驗；卡 40 分鐘就繞道 | 已解除 |
| 弟弟資料污染哥哥 | 🟢 低 | profile 完全隔離 | 已規劃 |
| Supabase 免費額度 | 🟢 低 | 兩人使用量極小；建專案時確認當前條款 | 待確認 |
| 診斷樣本量小（80 題）導致優先序判斷失準 | 🟢 低 | 8/24 結果已無鑑別力，改用紙筆抽測驗證；真正的逐字缺口以 W2–W4 實際 `cards` 資料為準，非一次性定案 | 已發生，已因應 |

---

## 13. 已確認決策

| # | 項目 | 決定 | 日期 |
|---|---|---|---|
| 1 | 寵物素材 | **簡單 SVG 自製**，分層群組設計 | 8/23 |
| 2 | Supabase | **新開專案**，不沿用作業管理系統 | 8/23 |
| 3 | 考試版本 | **A2 Key for Schools**（青少年版），12/20 已報名 | 8/23 |
| 4 | 診斷時機 | **W1 執行**，結果用於決定內容生成優先序 | 8/23 |
| 5 | 音訊功能 | **不做**，聽力由其他方式訓練 | 8/23 |
| 6 | 兄弟資料 | **完全分離**，無共用狀態 | 8/23 |
| 7 | 內容優先序 | 8/24 診斷顯示 L0 已達 96%，改以拼字為主要缺口；A8 取消 | 8/24 |
| 8 | L1/L2 生成方式 | 規則式生成（非 LLM），程式一次跑全表，免人工抽查 | 8/24 |

### 尚未決定（不急，可到對應階段再定）

- 弟弟正式上線時機：建議 W7，但若 W1–W6 時程吃緊可延至 10 月（弟弟無死線）
- 每日金幣上限與商品定價：待 W5 實作時依實際作答量調校
- 12 月最後兩週的收尾方式：待 11 月看實際掌握度再定

---

## 14. 版本紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| v1.0 | 2026-08-23 | 初版 |
| v1.1 | 2026-08-23 | 確認 6 項決策；診斷測驗移至 W1 並釐清其產出為「分層百分比」而非逐字清單；深度內容生成提前至 W2 平行啟動；W2 加入金幣與靜態寵物雛形；寵物改為分層 SVG |
| v1.2 | 2026-08-23 | 新增 §2.2 垂直切片原則（澄清診斷與日常模式共用元件、詞池不受診斷影響）；新增 §2.3 進度追蹤（三種進度分流，明列不自建開發儀表板）；修正 §9 階段 A 的 A5 措辭 |
| v1.3 | 2026-08-24 | 8/24 完成 W1 診斷（80 題），L0 整體 96%，四層皆 ≥90%、無鑑別力；紙筆抽測拼字正確率 <40%，確認拼字為主要缺口。取消 A8；L1/L2 拼字題型提前至 W2；新增 §5.6 規則式 payload 生成策略；修正 §1.4 期程目標；§12 風險降級；§13 新增決策 #7 #8 |

---

*本規劃書為活文件。若有重大調整（尤其資料庫 schema），請更新版本號並在 §14 記錄原因。*
