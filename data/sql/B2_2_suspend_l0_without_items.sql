-- ============================================================
-- B2-2：停用「沒有 L0 題目」的 L0 卡（僅哥哥）
--
-- 為什麼：決策 14 決定不補 L0 題目，但這 ~1,653 張 L0 卡從 9/24 起陸續到期。
-- 它們永遠沒有題目可出 → 永遠沒人作答 → due_at 永遠不會往後推 → 永遠排在
-- 到期桶最前面。排程器每次只撈 30 張最舊的到期卡當候選，這些卡一多，真正
-- 該複習的 L1/L2 卡就永遠擠不進來。
--
-- 這是決策 14 在資料層的落實，不是新決策。卡片和歷史資料都保留，只是標記
-- 暫停（suspended 欄位原本就是 §4.2 預留的「手動暫停此卡」）。
-- 1 月若要補 L0 題目，最下面有還原用的 SQL。
-- ============================================================

-- 停用前先看：應該約 1,653 筆
select count(*) as 將停用張數
from cards c
where c.profile_id = (select id from profiles where name = '哥哥')
  and c.skill = 'L0'
  and c.suspended = false
  and not exists (
    select 1 from items i
    where i.word_id = c.word_id and i.skill = 'L0' and i.status = 'active'
  );

update cards c
set suspended = true
where c.profile_id = (select id from profiles where name = '哥哥')
  and c.skill = 'L0'
  and c.suspended = false
  and not exists (
    select 1 from items i
    where i.word_id = c.word_id and i.skill = 'L0' and i.status = 'active'
  );

-- 停用後再看：L0 卡應該剩約 80 張（診斷用的 80 字）沒被停用
select suspended, count(*)
from cards
where profile_id = (select id from profiles where name = '哥哥')
  and skill = 'L0'
group by suspended;

-- ------------------------------------------------------------
-- 還原（現在不要跑）：補上 L0 題目之後，把有題目的卡解除停用
-- update cards c set suspended = false
-- where c.skill = 'L0' and c.suspended = true
--   and exists (select 1 from items i
--               where i.word_id = c.word_id and i.skill = 'L0' and i.status = 'active');
-- ------------------------------------------------------------
