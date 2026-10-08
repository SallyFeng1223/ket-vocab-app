-- ============================================================
-- B2 驗收查詢（PROGRESS.md B2：「連續跑 3 天，due_at 分布合理，未出現複習債爆量」）
-- 每個使用日結束後跑一次，把結果記下來比較。全部只讀，不改資料。
-- ============================================================

-- (1) 卡片狀態總覽：state='new' 應該慢慢減少、review 慢慢增加
select skill, state, suspended, count(*)
from cards
where profile_id = (select id from profiles where name = '哥哥')
group by skill, state, suspended
order by skill, state, suspended;

-- (2) 複習債：現在已到期、沒停用的非新卡數。
--     每輪到期名額 5 張，一天 3–5 輪約 15–25 張。這個數字如果一天比一天大、
--     而且明顯超過 25，就是複習債在累積。
select skill, count(*) as 已到期張數
from cards
where profile_id = (select id from profiles where name = '哥哥')
  and suspended = false and state <> 'new' and due_at <= now()
group by skill;

-- (3) 未來 30 天每天會到期幾張（due_at 分布）：應該是分散的，
--     不該集中在某一天出現幾十張的尖峰
select (due_at at time zone 'Asia/Taipei')::date as 到期日, skill, count(*)
from cards
where profile_id = (select id from profiles where name = '哥哥')
  and suspended = false and state <> 'new'
  and due_at < now() + interval '30 days'
group by 1, 2
order by 1, 2;

-- (4) 每日新卡數：new_words 不應超過 daily_new_limit（6）
select date, items_done, correct, new_words, coins_earned
from daily_stats
where profile_id = (select id from profiles where name = '哥哥')
order by date desc
limit 7;

-- (5) 晉級：最近 7 天建立的 L2 卡（B7b 種子卡以外的，就是晉級產生的）。
--     cards 沒有建立時間欄位，用「state=new 且 due_at 在最近 7 天」近似。
select w.headword, c.state, c.due_at
from cards c join words w on w.id = c.word_id
where c.profile_id = (select id from profiles where name = '哥哥')
  and c.skill = 'L2' and c.due_at > now() - interval '7 days'
order by c.due_at desc;

-- (6) FSRS 欄位有沒有正常寫回：最近作答過的卡
select w.headword, c.skill, c.state, round(c.stability::numeric, 1) as stability,
       round(c.difficulty::numeric, 2) as difficulty,
       round(c.retrievability::numeric, 3) as retrievability,
       c.due_at, c.reps, c.lapses
from cards c join words w on w.id = c.word_id
where c.profile_id = (select id from profiles where name = '哥哥')
  and c.last_review_at > now() - interval '1 day'
order by c.last_review_at desc;
