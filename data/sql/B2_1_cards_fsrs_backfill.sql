-- ============================================================
-- B2-1：補齊 B7 建的 L0 卡缺的 FSRS 欄位（僅哥哥）
--
-- 為什麼要補：B7 建 L0 卡時只寫了 state='review'、stability，沒有 difficulty
-- 和 last_review_at。FSRS 計算「複習卡」時這兩個值都要有，否則會算出 NaN。
-- （docs/js/srs.js 有保險：缺值時這次不排程，但卡片的 due_at 就永遠不會往後推。）
--
-- 補的值：
--   difficulty     = 5（FSRS 難度範圍 1–10 的中間值，沒有作答資料前的中性先驗）
--   last_review_at = 2026-08-24（診斷測驗那天——stability=60 就是依診斷結果給的）
--
-- 只動「非新卡且缺值」的卡，已經有值的不覆蓋，可以重跑。
-- ============================================================

-- 補之前先看：應該約 1,733 筆（B7 的 L0 卡），skill 全是 L0
select skill, state, count(*)
from cards
where profile_id = (select id from profiles where name = '哥哥')
  and state <> 'new'
  and (difficulty is null or last_review_at is null)
group by skill, state;

update cards
set difficulty     = coalesce(difficulty, 5),
    last_review_at = coalesce(last_review_at, '2026-08-24 12:00:00+08'::timestamptz)
where profile_id = (select id from profiles where name = '哥哥')
  and state <> 'new'
  and (difficulty is null or last_review_at is null);

-- 補完再看：應該回傳 0 列
select skill, state, count(*)
from cards
where profile_id = (select id from profiles where name = '哥哥')
  and state <> 'new'
  and (stability is null or difficulty is null or last_review_at is null)
group by skill, state;
