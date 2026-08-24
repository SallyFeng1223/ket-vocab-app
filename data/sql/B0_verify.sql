-- ============================================================
-- B0 驗收查詢（跑完全部 B0_items_L1_*.sql / B0_items_L2_*.sql 之後執行）
-- 出自 CLAUDE_CODE_B_task.md「B0 驗收」
-- ============================================================

select skill, count(*) as 題數,
       count(*) filter (where payload is null) as 缺payload,
       count(distinct word_id) as 涵蓋單字數
from items group by skill order by skill;

-- 預期：L1 約 1,300–1,600 筆、L2 約 1,600–1,700 筆（實際生成 L1 1,405 筆、L2 1,567 筆）
