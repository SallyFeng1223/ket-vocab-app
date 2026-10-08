# 開發進度

**專案**：A2 KET 單字拼字訓練 App
**考試日**：2026-12-20（Flyers）／2027-05-31（A2 Key）
**規劃書**：`KET_vocab_app_plan.md` v1.4（有疑問先翻那份）

---

## 怎麼用這份檔案

- 每完成一項就把 `- [ ]` 改成 `- [x]`，跟著程式碼一起 commit
- 每週開工前只看當週那一段
- **卡超過 40 分鐘的項目**：移到最下面「卡關待辦」，繞過去做下一項
- 更新「進度總覽」的完成數字（GitHub 在 repo 檔案檢視不會自動算，要手動填）

> 若想要自動進度條，把本檔內容貼到一個 GitHub Issue，那裡才會顯示 "12 of 40 tasks completed"。但對 40 項來說手動填就夠了。

---

## 進度總覽

| 階段 | 週次 | 完成 / 總數 | 狀態 |
|---|---|---|---|
| A 資料奠基 + 診斷 | W1（8/24–8/30） | 7 / 8（A8 取消） | 完成 |
| B 核心引擎上線 | W2（8/31–9/6） | 6 / 8（B1 以砍除計入；B5 部分完成） | 進行中 |
| C 內容深化與拼寫 | W3–4（9/7–9/20） | 0 / 5 | 延至 2027-01（階段 G） |
| D 獎勵系統 | W5（9/21–9/27） | 0 / 5 | 延至 2027-01（階段 G） |
| E 文法與統計 | W6–7（9/28–10/11） | 0 / 4 | 延至 2027-01（階段 G） |
| F 維運 | W8–17（10/12–12/20） | — | 未開始 |

---

## 階段 A — 資料奠基 + 診斷（W1，8/24–8/30）

> 本週最緊，嚴格照順序做。時間不足時 A8 可延後，**A1–A7 必須完成**。

- [x] **A1 新開 Supabase 專案**
  - 驗收：專案建立完成，不沿用作業管理系統專案
- [x] **A2 建立完整 schema**
  - 依規劃書 §4 一次到位，含 §4.3 全部索引
  - 驗收：`cards` 的 `UNIQUE (profile_id, word_id, skill)` 確實存在（這條最關鍵）
  - 驗收：RLS 已開啟，共用帳號可登入
- [x] **A3 全表骨架資料（1,500 字）**
  - 欄位：`headword` / `pos` / `zh` / `level_tags` / `topics`
  - 驗收：`select count(*) from words` ≈ 1,500，且無 `zh` 為空
  - 時間不足時優先做：**Movers + KET-only 高頻具體**
  - 實際 1,733 筆（原詞表估計偏低），已在 Supabase 執行 `data/sql/A3_all.sql` 並確認無誤
- [x] **A4 診斷抽樣 80 字的 L0 干擾選項**
  - 抽樣：Starters 15 / Movers 30 / KET-only 高頻具體 20 / KET-only 低頻抽象 15
  - 驗收：80 題皆有 3 個同詞性、長度相近的干擾選項
- [x] **A5 出題畫面第一版（診斷模式）**
  - **這是正式介面的第一塊，非拋棄式**（見規劃書 §2.2）
  - 此版不含 SRS 引擎、profile 管理、金幣
  - 驗收：能出題、判分、寫入 `attempts`，`session_type = 'diagnostic'`
- [x] **A6 跑診斷測驗**
  - 分 2 次，每次 40 題
  - 開始前跟哥哥說：「這不是考試，是讓電腦知道你已經會哪些，才不會浪費你時間重複練。」
  - 驗收：`attempts` 有 80 筆紀錄
- [x] **A7 算出分層百分比，決定 A8 優先序**
  - 產出：Starters ___% / Movers ___% / KET 高頻 ___% / KET 低頻 ___%
  - 記在下面「診斷結果」區
- [ ] **A8 其餘 1,420 字的 L0 干擾選項** — 🚫 已取消
  - 依 A7 優先序生成，做不完延到 W2
  - 取消原因：見上方「內容生成優先序決定」，L0 認字已達天花板（96%），缺口在拼字不在認字，資源改投入 L1/L2 拼字題型；詳見規劃書 v1.3

**階段驗收**：schema 建好、骨架資料就位、診斷完成並得出分層百分比
**Git tag**：`v0.1-diagnostic`

### 診斷結果（A7 完成後填）

| 層 | 題數 | 答對 | 掌握率 |
|---|---|---|---|
| Starters | 15 | 15 | 100% |
| Movers | 30 | 30 | 100% |
| KET-only 高頻具體 | 20 | 18 | 90% |
| KET-only 低頻抽象 | 15 | 14 | 93% |

**內容生成優先序決定**：L0 認字已達天花板（96%），紙筆抽測確認拼字掌握率 < 40%，改以拼字為主要缺口，A8 取消，轉向 L1/L2 拼字題型

---

## 階段 B — 核心引擎上線（W2，8/31–9/6）

- [x] **B0 L1／L2 payload 生成腳本**
  - 規則式生成（規劃書 §5.6），不用 LLM、不需人工抽查
  - `scripts/build_l2_tiles.py`、`scripts/build_l1_spellings.py`
  - 驗收：`data/sql/B0_verify.sql` 查詢結果 L1/L2 皆無缺 payload，涵蓋單字數合理
  - 最終筆數：**L1 1,398 筆**、**L2 1,547 筆**（`data/sql/B0_items_L1_01~04.sql`、`B0_items_L2_01~05.sql`）
  - L1、L2 都沒有的字 52 個（多為長度≤2的虛詞、11個特殊字元字、少數片語動詞規則湊不到 2 個候選）；
    其中 12 個片語動詞的後續處理記進「卡關待辦」下方 C 階段備註
- [x] **B1 Profile 選擇畫面 —— 已砍除**
  - 驗收：哥哥、弟弟兩個 profile 可切換，資料互不影響
  - > 9/30 決策 13：B 階段不做，寫死哥哥，併入 2027 年 1 月階段 G8
- [ ] **B2 SRS 引擎（FSRS）+ 出題排程**
  - > **10/12 凍結前唯一要做的開發項目**
  - 卡片單位為 (profile × word × skill)
  - 出題配比讀自 `app_settings`：到期複習 5 / 易錯加權 3 / 新字 2
  - 驗收：連續跑 3 天，`due_at` 分布合理，未出現複習債爆量
  - ⚠️ 卡關退路：改用簡化 SM-2
  - > **B2 必須包含 pool_filter 讀取邏輯。** 排程器撈新字時讀 `app_settings` 的
    `pool_filter`，依 `level_tags` 篩選詞池。
    ⚠️ **只套用在「新字」桶子，不可套用在到期複習。** 否則已在複習中的 KET-only 字
    會突然消失，1 月切回全表時那批卡片的 `due_at` 會過期一大片。
  - > B2 完成後使用者需在 Supabase 貼 SQL：`profiles.daily_new_limit` 12 → 6（決策 12）
  - > **B2-1 已 commit（FSRS 接上）**：`docs/js/srs.js`（ts-fsrs 5.4.2，esm.sh 引入，
    參數預設值，唯一例外 `enable_short_term: false`——cards 表沒有 `learning_steps`
    欄位可存短期步驟）、`docs/js/settings.js`（讀 app_settings 共用入口）。
    `updateCardAfterAnswer` 改寫 state/stability/difficulty/due_at，TEMPORARY 已刪；
    卡片快照由 provider 帶過來，每題只往返一次。降級門檻改讀 `demote_threshold`。
    評分：答錯 Again／提示 Hard／慢於中位數×1.5 Hard／**快於中位數×0.5 Easy 只限 L2**
    （L1 三選一可猜中，最高 Good）／其餘 Good；樣本 <20 筆不看時間。
    需貼 `data/sql/B2_1_cards_fsrs_backfill.sql`（補 B7 L0 卡的 difficulty/last_review_at）
    ——**使用者已貼，補完後查詢回傳 0 列，已確認**。
    > 待確認：真實 Supabase 實測（答題後 FSRS 欄位寫回）
  - > **B2-2 已 commit（三個桶子排程器）**：`provider.js` 的 `getDailyQueue` 改寫，
    配比讀 `session_mix`。到期 5（due_at asc）→ 易錯 3（剩餘到期卡依 lapses，不足
    放寬到全部 lapses>0 卡）→ 新字 2（受每日新卡額度限制）→ 不足 10 題時依
    到期→易錯→新字互補。每日新卡數由 `countNewCardsToday` 從 attempts 算（含 L2
    晉級卡），每輪結束寫進 `daily_stats.new_words`。降級退路：降級後的題型沒有題目
    時退回原題型＋提示，不讓卡片卡死。
    需貼 `data/sql/B2_2_suspend_l0_without_items.sql`（停用 ~1,653 張無題目 L0 卡，
    決策 14 的資料層落實；不停用會占滿到期桶候選池）、`data/sql/B2_2_profile_limit.sql`
    （**daily_new_limit 已改成 6，使用者已確認**）。
    > 待確認：suspend SQL 是否已貼；真實 Supabase 實測
  - > **B2-3 已 commit（pool_filter＋新字候選池修正）**：新字桶讀 `pool_filter`，
    開啟時用 `level_tags` 篩（只套用新字桶）。候選池改成先撈全部 concreteness 5/4
    候選字（Flyers 期 430 字）在 JS 排序，再每次 100 個 word_id 去 cards 找新卡、
    湊滿就停——修正舊版「固定撈同一批 200 字、約 11 週用光」的問題，排序規則不變。
    concreteness ≤3 的第二段仍未做（430 字撐過 12/20）。
    需貼 `data/sql/B2_app_settings.sql`（insert pool_filter、delete coin_rules）。
  - > B2_2 停用 SQL 已貼（L0 未停用剩 80 張）、B2_app_settings.sql 已貼（剩 5 筆），
    使用者已確認。B2-1～B2-3 已 push（10/08）；10/08 push 前那一輪測試跑的是舊版，不算數。
  - > **B2-4 已 commit（§5.2 L1→L2 晉級）**：答完 L1 卡後，若 state 達
    `promotion.required_state` 且 stability ≥ `promotion.min_stability_days`
    （review／7 天），幫同一字建 L2 新卡（upsert ignoreDuplicates，該字無 L2 題目則
    不建）。L1 連兩次 Good 約 stability 13.8 即晉級；三選一連猜中約 11% 會誤晉級，
    但 L2 字母磚本身就是驗證關卡，門檻不調（使用者已確認）。只開 L1→L2，L3/L4 待 G2。
    需貼 `data/sql/B2_4_check_cards_insert_policy.sql` 確認 cards 有 INSERT 政策。
    > 待確認：RLS INSERT 政策；真實 Supabase 實測（晉級卡有建出來）
  - > **刻意不做**：易錯桶不改出低一階題型（§5.4 原文「優先出低一階題型」）。
    理由：§5.5 已有連錯降級機制，兩套同時決定題型會互相競爭。
  - > **預估修正（待觀察，先不改規劃書）**：每日上限算「新卡」且含 L2 晉級卡，
    穩定後每週 18 張新卡約 L1 新字與 L2 晉級卡各半，實際新字約每週 9 個、
    10 週 90–120 字，而非 v1.4 §1.4 寫的 180 字。90 個走完 L1+L2 的字比 180 個
    只練辨形的字更接近「拼得出來」。跑兩週看 `daily_stats.new_words` 實際數字再
    決定是否修規劃書。
- [x] **B3 L1 辨形題 + L2 字母磚題**
  - 原訂 W3–W4 提前至此，兩者 payload 皆規則式生成（規劃書 §5.6）
  - 驗收：兩種題型皆可作答、判分正確
  - > 使用者已於真實 Supabase + 瀏覽器實測確認通過。`docs/js/renderer.js` 沿用 A5 的
    buildChoicesForItem/showItemAndWaitForAnswer 架構，沒有改動核心結構。L2 判分
    case-insensitive、tiles+extra_tiles 合併後才洗牌、點擊組字免拖曳、磚塊 48×48px、
    有清除鈕。
- [x] **B4 Session 流程**
  - 10 題一輪 + 結算畫面
  - 挫折控制：`consecutive_wrong >= 3` 觸發降級（規劃書 §5.5）
  - 驗收：中途離開時 `completed = false`
  - > 使用者已於真實 Supabase + 瀏覽器實測確認通過。`provider.js` 的 `getDailyQueue`
    （取題邏輯獨立成 `selectDueAndNewCards`，之後換 B2 SRS 只改這一個函式）；
    `recorder.js` 的 `updateCardAfterAnswer` 做挫折控制（`consecutive_wrong`/
    `demoted_to`，用同一欄位的正負號分別追蹤連錯/降級後連對，細節見函式內註解）；
    `main.js` 的 `runDailySession`，診斷 80 題做完後自動轉入日常模式；`renderer.js`
    的 `runDiagnostic` 改名 `runRound`（診斷/日常共用同一支）並加提示顯示。
    中途離開 completed=false 沿用 A5 既有機制。
  - > **實測過程修了三個真的 bug**（詳見對話紀錄）：
    (1) `selectDueAndNewCards` 原本一次撈這個 profile 全部 state='new' 卡（1,398張），
    `.in()` 塞進上千個 UUID 導致 URL 過長，Supabase 回 400——改成兩段式查詢，
    先從 `words` 撈 concreteness 5/4 的前 200 個 word_id 當候選池，固定大小不隨卡片
    數成長；
    (2) 到期查詢原本沒排除 `state='new'`，而 B7 把全部 L1 初始卡的 `due_at` 設成建卡
    當下的 `now()`，導致這些卡從「到期」路徑被撈出、繞過 concreteness 排序（第一題
    因此出現虛詞 `a`）——加上 `.neq("state","new")`；
    (3) concreteness 同分時原本沒有次要排序，退回字母序，導致 `accommodation` 這類
    長字擠在第一輪——改成 JS 端依 headword 長度升冪排序。
  - > ⚠️ **測試時發現的內容缺口**：L0 題目只有 A4 診斷用的 80 個字（A8 取消，
    其餘 1,653 字從未生成 L0 題）。B7 卻幫全部 1,733 字都建了 L0 卡（維持性複習）。
    代表這 1,653 張 L0 卡到期時，`getDailyQueue` 會撈到卡但找不到對應題目，
    印警告後跳過——這些字的「維持性複習」實質上不會發生，直到之後補上 L0 題目。
    同樣的缺口也會出現在 L1→L0 降級的情境。目前不影響 B4 本身運作（會優雅跳過，
    不會卡住整輪），但這是個需要決定要不要處理的缺口，記在下面卡關待辦。
- [x] **B5 attempts / cards 寫入（部分完成）**
  - 驗收：`answer_given`、`response_ms`、`hint_used` 皆有值
  - > 使用者已於真實 Supabase 實測確認：`reps` 全部 +1、`lapses` 只在答錯的卡上累加、
    `due_at` 答對推明天答錯留今天、`answer_given` 存到實際輸入（如 accommodation
    誤拼成 accomodation）、`response_ms`/`hint_used` 皆有值。`consecutive_wrong`/
    `demoted_to` 於 B4 完成。**部分完成**：`state`/`stability`/`difficulty`/
    `retrievability` 仍待 B2（真 SRS 排程器）才會動。`due_at` 目前是 TEMPORARY
    權宜措施（答對+1天、答錯今天再出），程式碼裡標了 `// TEMPORARY`，B2 接上
    FSRS 後整段刪除。
- [ ] **B6 金幣計數 + 靜態貓咪 SVG**
  - 先不做商店。金幣綁正確率與連續天數，**不綁作答量**
  - 驗收：金幣會累積，貓咪看得到
  - > 待確認：新增 `docs/js/rewards.js`（獨立模組，§7.1 要求跟核心解耦）：每輪依
    正確率給金幣（`round(正確率×10)`）、當天第一輪額外 +5 連續天數獎勵、完成 3 輪
    （今日目標，跟 §5.4/B7 用的「3輪×10題」算法一致）一次性 +20 大獎，每日金幣
    上限讀 `app_settings.daily_coin_cap`（缺這筆設定會丟錯，不會偷塞預設值——
    需要貼 `data/sql/B6_app_settings.sql`，暫定 50）。寫回 `wallet` 和 `daily_stats`。
    **上面的金幣數字（10/5/20/50）是我先定的暫定值，不是規劃書給的，你玩起來
    覺得不對可以隨時改 `app_settings` 或改 `rewards.js` 裡的常數。**
    貓咪 `docs/js/petSvg.js`：靜態 SVG，分層 `<g id="body">`/`<g id="head">`/
    `<g id="face">`/`<g id="hat">`（hat 先留空節點，D 階段直接塞內容不用重畫）。
    「今天」用台北時區（UTC+8）算，避免 UTC 換日時間跟小孩實際感受的一天對不上。
    本機用 mock Supabase 測過 11 條斷言（多輪同一天的金幣累加、連續天數獎勵只發一次、
    今日目標大獎只發一次、每日上限封頂）。**還沒接真實 Supabase、沒在 iPad 上跑過，
    也還沒測過跨天的連續天數遞增（沒有簡單方法在單元測試裡模擬「隔天」，
    這段需要你實際連續兩天使用來驗證）**，需要你實測才能勾選。
- [x] **B7 用診斷結果初始化 cards**
  - L0 全數給高初始 stability（維持性複習，非新學）；每個字直接建立 L1 卡片作為起點
  - 調整：L0 due_at 窗口從任務書原訂 30–90 天改為 **30–365 天**，原因是每天到期複習
    名額只有 15 個、扣掉 L1 穩定後占用約 10 個，留給 L0 的約 5 張/天，
    1,733÷5≈347 天，故窗口拉到 365 天，避免複習債爆量（§9 B2 驗收要求）
  - 已執行 `data/sql/B7_cards_init.sql`（L0 1,733 筆 + L1 1,398 筆 = 3,131 筆），
    使用者確認 Supabase 驗收查詢結果正常
  - > **B7b 追加**：B2 完成前 L2 字母磚卡片一張都不會出現（§5.2 晉級規則要 state
    轉 review，state 要 B2 才會轉換），但 L2 才是拼字主戰場、B3 的字母磚 UI 也還
    只在假資料測過。提前用 `scripts/build_b7b_cards_l2_seed.py` 挑 50 個字
    （concreteness=5、headword 長度 4–7、有 L2 題目，SEED=20260825 打亂取樣）
    種一批 L2 卡片（state=new, due_at=now），`data/sql/B7b_cards_L2_seed.sql`。
    `on conflict` 保護，B2 上線後晉級規則接手不會衝突。**待你貼 SQL 並實測。**

**平行進行**：依 A7 優先序開始生成深度內容（例句、文法提示、變化形）

**🔴 階段驗收：W2 結束哥哥開始每天使用。不等功能齊全。**
**Git tag**：`v0.2-srs-core` —— **B2 完成並實測通過即打，不等 B6**。
理由：tag 名稱指的是 SRS 引擎落地；規劃書 §7.1 寫明獎勵層與核心解耦，B6 不影響
SRS 可用性。B6 程式碼已 commit，只差貼 SQL 與實測，屬使用者作業。

---

## 階段 C — 內容深化與拼寫（W3–W4，9/7–9/20）

> ⏸ 全數延至 2027 年 1 月，改編為規劃書 §9 階段 G。10/12–12/20 為 Flyers 衝刺期，不開發。

- [ ] **C1 依實際 cards 資料修正優先序**
  - 此時逐字缺口開始浮現，比診斷精確得多
- [ ] **C2 持續生成深度內容**
  - 優先做**已確認不會**的字，先做 300–400 字，用完再補
  - **未被排入複習的字，例句做了也是浪費**
  - 生成約束：句中其他字須在 A2 表內／句長 6–12 字／小學生情境／避開敏感主題
- [ ] **C3 例句人工抽查**
  - 每批抽 10 句，檢查超綱詞與自然度
  - 通過的把 `items.qa_checked` 設 true
- [ ] **C4 L1 辨形題、L3 首字母提示、L4 完整拼寫**
  - 驗收：三種題型可作答，晉級規則（§5.2）運作正常
- [ ] **C5「這題怪怪的」回報按鈕**
  - 寫入 `content_issues`
  - 驗收：哥哥能自己按，且知道那顆按鈕的用途

**階段驗收**：拼寫題型全開、缺口字例句到位
**Git tag**：`v0.3-spelling`

---

## 階段 D — 獎勵系統（W5，9/21–9/27）

> ⏸ 全數延至 2027 年 1 月，改編為規劃書 §9 階段 G。10/12–12/20 為 Flyers 衝刺期，不開發。

- [ ] **D1 貓咪 SVG 分層結構**
  - `<g id="body">`、`<g id="face">`、`<g id="hat">` 等分層
  - 配件用錨點座標定位
- [ ] **D2 四種表情**（開心 / 普通 / 想睡 / 想吃）
  - 只換 `<g id="face">` 內容
- [ ] **D3 shop_items 資料 + 商店介面**
  - 10 件配件 + 3 種食物
- [ ] **D4 購買與裝備流程**
  - `wallet` 扣款 → `owned_items` 寫入 → `is_equipped` 切換
  - 驗收：金幣不足時不可購買，且提示友善
- [ ] **D5 餵食與 mood**
  - 設中長期目標（例：連續 30 天解鎖新寵物）

**階段驗收**：金幣可賺可花，寵物會變裝
**Git tag**：`v0.4-rewards`

---

## 階段 E — 文法與統計（W6–W7，9/28–10/11）

> ⏸ 全數延至 2027 年 1 月，改編為規劃書 §9 階段 G。10/12–12/20 為 Flyers 衝刺期，不開發。

- [ ] **E1 L5 文法變化題**
  - 範圍鎖定規劃書 §5.3，**勿擴張**
  - 驗收：不規則動詞可依 `word_forms.form_type` 反查出題
- [ ] **E2 L6 詞塊排序題**
  - 拖曳互動（iPad 觸控優先）
- [ ] **E3 家長端統計頁**
  - 完成度用 SRS 估計保留率計算，**不用答對次數 ÷ 總數**
  - 含：各層級掌握比例、易錯字 Top 20、拼錯模式、文法弱點分組正確率
- [ ] **E4 弟弟 Starters 設定**
  - 詞池篩選（僅 Starters 標記）、題型上限 L0–L2、`keyboard_enabled = false`
  - 每日新字上限 4–5
  - 時程吃緊時可延至 10 月（弟弟無死線）

**階段驗收**：全題型可跑、兩個 profile 皆正常、統計數字合理
**Git tag**：`v1.0-feature-complete`

---

## 🛑 階段 F — 維運（W8–W17，10/12–12/20）

**10/12 起停止新增功能。** 每週約 1–2 小時，剩餘時間轉去陪讀。

新功能一律預設拒絕，例外只有一種：不改就會導致小孩不想用。
想到的點子記到最下面「v2 願望清單」。

### 每週檢查（約 30 分鐘）

複製下面這段到每週的紀錄區：

```
### 第 __ 週（__/__ – __/__）
- [ ] 查 content_issues 有無 status = open
- [ ] 跑內容進度查詢（規劃書 §2.3）
- [ ] 看易錯字 Top 20，判斷是「真的難」還是「題目有問題」
- [ ] 確認本週實際使用天數；連續兩週低於 3 天，先找原因再談其他
- [ ] 看 daily_stats.new_words，若每次都頂到 6，考慮上調至 8
- [ ] 確認 Supabase 資料正常寫入
本週觀察：
```

### 關鍵日期

- [ ] **10/12** 開發凍結生效
- [ ] **12/06** 用同一份 80 題複測，與 8 月結果對比
- [ ] **12/13** app 使用量減半，改以複習錯題本為主
- [ ] **12/20** Flyers 考試日
- [ ] **12/21–2027/01/04** 停練期
- [ ] **2027/01/05** 開發解凍，KET 期開始
- [ ] **每月一次** 匯出資料庫備份到雲端硬碟（記錄日期：___ / ___ / ___）

---

> **給 B3 的備註**：L2 的 tiles 全部是小寫字母（items.answer 保留原始大小寫，例如 April
> 就是 April），判分時比對 tiles 組出來的字串跟 answer，**必須 case-insensitive**，
> 否則大寫開頭的字永遠判錯。

> **給 B2 的備註**：L1 初始卡片 1,398 張 due_at 全部相同，排程器挑新字時必須明確排序，
> 不可依賴資料庫回傳順序。排序：`words.concreteness desc`（具體字優先），同分時
> `freq_rank asc`。理由：規劃書 §3.2 concreteness 欄位的用途就是決定引入順序；
> §3.3 挫折控制優先，前兩週應先給 cat/bus/hat 這類具體字，不要讓
> advice/experience/opinion 這種抽象字出現在習慣建立期。

> **給 B2 的備註（2）**：B2 排新字順序分兩段：
> 第一段 `concreteness in (5,4)` 共 635 字，依 `concreteness desc, freq_rank asc`；
> 第二段 其餘，依 `length(headword) asc`。
> 理由：每天 6 個新字，635 字可撐約 105 天，剛好到 12/20 考前，低分端評分品質
> 在考前不會被讀到。

> **【L0 題目缺口 —— 決定不補（9/30 決策 14）】**
> 1,653 字有 L0 卡片但無 L0 題目。排程器遇到無題目的卡會優雅跳過，
> App 不受影響。
>
> 不補的理由：L0 認字 8/24 診斷已達 96%，主戰場是拼字。
> 每日複習名額有限（一輪 10 題中到期複習僅 5 題），
> L0 跳過反而把名額讓給 L1/L2 拼字題。
>
> 原「9/24 前必須完成」作廢，此項不再是待辦。

## 卡關待辦

> 卡超過 40 分鐘的項目移到這裡，繞過去做下一項。不要在死線專案上死磕。

| 項目 | 卡在哪 | 記錄日期 | 狀態 |
|---|---|---|---|
| | | | |

> **給 C 階段的備註**：片語動詞 12 個無 L1/L2 題目——
> `go out`、`grow up`、`pick up`、`put on`、`sit down`、`tidy up`、`try on`、
> `turn on`、`work out`、`bus stop`、`working hours`、`hip hop`。
> §5.6 規則庫只處理單字內部形態，對「動詞＋介係詞」結構無效，需另外設計誤拼規則
> （如 `turn on` → `turnon` 連寫、`tunr on` 換位、`turn no` 順序錯）或改用 L6 詞塊排序。
> 規劃書 v1.4 §9 階段 G10 處理（原 C4），B 階段不做。

---

## v2 願望清單

> 考完 12/20 再說。現在寫下來就好，不要動手。

- concreteness 低分端需重評。1–2 分那批混入感官動詞（hurt、sick、loud、
  scary、wake up）與虛詞（I、he、so、every），判準應是「可否被感官直接經驗」
  而非「是否為名詞」。分布呈啞鈴形（1 有 669、5 有 451、3 只有 138）。考後處理。
