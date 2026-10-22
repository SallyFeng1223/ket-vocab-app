-- ============================================================
-- F：man、woman 的 L1 題目撞到不規則複數真字（凍結期資料修正）
--
-- 起因：B0（scripts/build_l1_spellings.py）生成 wrong_spellings 時，
-- 「合法檢查」只拿 words_snapshot.csv 的 headword 當真字黑名單，
-- men、women 不是獨立 headword，沒被擋下來，母音互換規則
-- （a↔e）剛好把 man/woman 換成這兩個不規則複數真字：
--   man   → wrong_spellings: ["mann", "men"]
--   woman → wrong_spellings: ["womann", "women"]
-- 哥哥 L1 三選一出現「men」/「women」，選到真字被判錯。
--
-- 套用 §5.6 的 5 條規則（雙寫去一個／字尾多寫一個／母音互換／常見字尾
-- 誤拼／ph↔f）重新驗證：扣掉 men/women 之後，man、woman 都只剩
-- 「mann」「womann」這 1 個合法候選，湊不到 2 個——按 §5.6 原文「規則
-- 套用後湊不到 2 個合法候選的字：不生成 L1 題，只留給 L2」，這兩個字
-- 本來就不該有 L1 題目。
--
-- 處理方式（討論後決定，不刪除歷史資料）：
--   1. man、woman 的 L1 items 設 status='retired'（歷史 attempts 的
--      item_id 照樣有效，不用處理）
--   2. 同步停用這兩個字的 L1 卡片（suspended=true），避免重演 L0
--      無題目卡那個坑：到期後找不到 active 題目、被跳過、due_at
--      不動、永遠卡在到期桶（同 B2_2_suspend_l0_without_items.sql）
--   3. 幫這兩個字建 L2 卡片（state='new'，受每日新卡額度限制）；
--      L1 停用後不會再有晉級機會，不手動建的話這兩個字就永遠碰不到
--      字母磚。已確認 man、woman 的 L2 items 都是 active
--      （B0_items_L2_03.sql、B0_items_L2_05.sql），on conflict do
--      nothing，可重跑不重複
--   4. 已確認 docs/js/provider.js 的 getDiagnosticQueue、
--      getDailyQueue 撈題目都有 .eq("status","active") 條件，
--      retired 的 L1 items 不會被撈到，不用改程式碼
--
-- 根因（build_l1_spellings.py 的黑名單沒涵蓋不規則複數）不在凍結期
-- 修：見 PROGRESS.md「給 G 階段的備註」，1 月解凍後重新產生 L1 題目
-- 時一併處理。
-- ============================================================

-- 修正前先看現況
select i.id, i.skill, i.status, i.answer, i.payload
from items i
join words w on w.id = i.word_id
where w.headword in ('man', 'woman') and i.skill in ('L1', 'L2');

select w.headword, c.skill, c.state, c.suspended
from cards c
join words w on w.id = c.word_id
where c.profile_id = (select id from profiles where name = '哥哥')
  and w.headword in ('man', 'woman');

-- 1. retire L1 items（歷史 attempts.item_id 不受影響）
update items
set status = 'retired'
where skill = 'L1'
  and word_id in (select id from words where headword in ('man', 'woman'));

-- 2. 停用這兩個字的 L1 卡片
update cards
set suspended = true
where profile_id = (select id from profiles where name = '哥哥')
  and skill = 'L1'
  and word_id in (select id from words where headword in ('man', 'woman'));

-- 3. 建 L2 卡片（state='new'，受每日新卡額度限制；已存在就不動）
insert into cards (profile_id, word_id, skill, state, due_at)
select (select id from profiles where name = '哥哥'), w.id, 'L2', 'new', now()
from words w
where w.headword in ('man', 'woman')
on conflict (profile_id, word_id, skill) do nothing;

-- 修正後再看一次：L1 應該是 retired，L2 應該是 active；
-- cards 應該看到 L1 suspended=true，L2 state='new' suspended=false
select i.id, i.skill, i.status, i.answer, i.payload
from items i
join words w on w.id = i.word_id
where w.headword in ('man', 'woman') and i.skill in ('L1', 'L2')
order by w.headword, i.skill;

select w.headword, c.skill, c.state, c.suspended, c.due_at
from cards c
join words w on w.id = c.word_id
where c.profile_id = (select id from profiles where name = '哥哥')
  and w.headword in ('man', 'woman')
order by w.headword, c.skill;
