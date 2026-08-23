-- ============================================================
-- A3 骨架資料 — 批次 14：winner–zoo
-- 本批 43 筆
-- on conflict do nothing：重跑本檔不會產生重複資料。
-- ============================================================

insert into words
  (headword, pos, zh, level_tags, topics, sense_note, is_phrasal, concreteness, status)
values
('winner', 'n', '得獎者、優勝者', '{KET,FLYERS}', '{}', null, false, 4, 'active'),
('winter', 'n', '冬天', '{KET,FLYERS}', '{}', null, false, 3, 'active'),
('wish', 'n', '祝福、願望', '{KET,FLYERS}', '{}', 'Best wishes', false, 1, 'active'),
('with', 'prep', '與……一起', '{KET,STARTERS,MOVERS,FLYERS}', '{}', null, false, 1, 'active'),
('without', 'prep', '沒有', '{KET,FLYERS}', '{}', null, false, 1, 'active'),
('woman', 'n', '女人', '{KET}', '{}', null, false, 5, 'active'),
('wonderful', 'adj', '很棒的', '{KET,FLYERS}', '{}', null, false, 1, 'active'),
('wood', 'n', '木頭', '{KET,FLYERS}', '{}', null, false, 4, 'active'),
('wooden', 'adj', '木製的', '{KET}', '{}', null, false, 2, 'active'),
('wool', 'n', '羊毛', '{KET,FLYERS}', '{}', null, false, 4, 'active'),
('word', 'n', '字、單字', '{KET,STARTERS,MOVERS,FLYERS}', '{}', null, false, 2, 'active'),
('work', 'n', '工作', '{KET,MOVERS,FLYERS}', '{}', null, false, 2, 'active'),
('work out', 'phr v', '運動、健身', '{KET}', '{}', 'exercise', true, 1, 'active'),
('worker', 'n', '工人', '{KET}', '{}', null, false, 4, 'active'),
('working hours', 'n', '工作時間', '{KET}', '{}', null, false, 2, 'active'),
('world', 'n', '世界', '{KET,MOVERS,FLYERS}', '{}', null, false, 3, 'active'),
('worried', 'adj', '擔心的', '{KET,FLYERS}', '{}', null, false, 1, 'active'),
('worry', 'v', '擔心', '{KET}', '{}', null, false, 1, 'active'),
('worse', 'adj', '更糟的', '{KET,MOVERS,FLYERS}', '{}', null, false, 1, 'active'),
('worst', 'adj', '最糟的', '{KET,MOVERS,FLYERS}', '{}', null, false, 1, 'active'),
('would', 'mv', '會（過去式）', '{KET,MOVERS,FLYERS}', '{}', null, false, 1, 'active'),
('wow', 'exclam', '哇', '{KET,STARTERS,MOVERS,FLYERS}', '{}', null, false, 1, 'active'),
('write', 'v', '寫', '{KET,STARTERS,MOVERS,FLYERS}', '{}', null, false, 1, 'active'),
('write down', 'phr v', '寫下來', '{KET}', '{}', null, true, 1, 'active'),
('writer', 'n', '作家', '{KET}', '{}', null, false, 4, 'active'),
('writing', 'n', '寫作', '{KET}', '{}', null, false, 1, 'active'),
('wrong', 'adj', '錯的', '{KET,MOVERS,FLYERS}', '{}', null, false, 1, 'active'),
('Yeah', 'exclam', '對啊', '{KET}', '{}', null, false, 1, 'active'),
('year', 'n', '年', '{KET,STARTERS,MOVERS,FLYERS}', '{}', null, false, 2, 'active'),
('yellow', 'adj', '黃色的', '{KET,STARTERS,MOVERS,FLYERS}', '{}', null, false, 3, 'active'),
('yes', 'adv', '是的', '{KET,STARTERS,MOVERS,FLYERS}', '{}', null, false, 1, 'active'),
('yesterday', 'adv', '昨天', '{KET,MOVERS,FLYERS}', '{}', null, false, 1, 'active'),
('yet', 'adv', '還（沒）', '{KET,FLYERS}', '{}', 'Has he arrived yet?', false, 1, 'active'),
('yogurt', 'n', '優格', '{KET}', '{}', null, false, 5, 'active'),
('yoghurt', 'n', '優格', '{KET,FLYERS}', '{}', null, false, 5, 'active'),
('you', 'pron', '你', '{KET,STARTERS,MOVERS,FLYERS}', '{}', null, false, 1, 'active'),
('young', 'adj', '年輕的', '{KET,STARTERS,MOVERS,FLYERS}', '{}', null, false, 1, 'active'),
('your', 'det', '你的', '{KET,STARTERS,MOVERS,FLYERS}', '{}', null, false, 1, 'active'),
('yours', 'pron', '你的（東西）', '{KET,STARTERS,MOVERS,FLYERS}', '{}', null, false, 1, 'active'),
('yourself', 'pron', '你自己', '{KET}', '{}', null, false, 1, 'active'),
('zebra', 'n', '斑馬', '{KET,STARTERS,MOVERS,FLYERS}', '{}', null, false, 5, 'active'),
('zero', 'n', '零', '{KET,FLYERS}', '{}', null, false, 2, 'active'),
('zoo', 'n', '動物園', '{KET,STARTERS,MOVERS,FLYERS}', '{}', null, false, 5, 'active')
on conflict (headword) do nothing;


-- ============================================================
-- 驗收：本批應新增 43 筆（若 headword 已存在則會被略過）
-- ============================================================
select count(*) as 目前總筆數 from words;