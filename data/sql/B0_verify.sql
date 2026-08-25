-- ============================================================
-- B0 驗收查詢（跑完全部 B0_items_L1_*.sql / B0_items_L2_*.sql 之後執行）
-- 出自 CLAUDE_CODE_B_task.md「B0 驗收」
-- ============================================================

select skill, count(*) as 題數,
       count(*) filter (where payload is null) as 缺payload,
       count(distinct word_id) as 涵蓋單字數
from items group by skill order by skill;

-- 預期：實際生成 L1 1,281 筆、L2 1,547 筆
-- （比任務書原估的 1,300–1,600 / 1,600–1,700 略低，因為這版另外排除了
-- 　多字條目、特殊字元字、以及長度 ≥13 的長字，詳見 PROGRESS.md B0 項目）


-- ============================================================
-- 額外：確認 Supabase words 表跟本機 data/words_snapshot.csv 筆數與 headword 一致
-- 在 Supabase SQL Editor 執行下面這句，把結果數字跟你本機
-- `wc -l data/words_snapshot.csv`（扣掉標題列後）比對即可
-- ============================================================
select count(*) as words表筆數, count(distinct headword) as 不重複headword數 from words;
