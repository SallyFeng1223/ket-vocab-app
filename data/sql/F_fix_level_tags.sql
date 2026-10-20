-- ============================================================
-- F 階段資料修正：補上 A3 YLE 分層比對漏標的 level_tags
-- 共 22 個字
-- 根因：A3 的解析器沒處理斜線形態（child/children）、UK/US 替代拼法
--      （truck (UK lorry)）、巢狀括號（candy (UK sweet(s))）、
--      可省略延伸（wake (up)、have (got) to）
--
-- 安全性：用 array(select distinct unnest(...)) 對 Supabase 當下實際的
-- level_tags 做聯集附加，不是用本機算出來的完整標籤直接覆蓋整欄。
-- 這樣即使 Supabase 現況跟本機 data/words_snapshot.csv 有落差（例如你之後
-- 手動修過某些字），這句也只會新增下面列出的缺項，不會動到其他既有標籤。
-- ============================================================

update words set level_tags = array(select distinct unnest(level_tags || '{FLYERS}'::text[])) where headword = 'autumn';
update words set level_tags = array(select distinct unnest(level_tags || '{FLYERS,MOVERS}'::text[])) where headword = 'blonde';
update words set level_tags = array(select distinct unnest(level_tags || '{FLYERS}'::text[])) where headword = 'businessman';
update words set level_tags = array(select distinct unnest(level_tags || '{FLYERS}'::text[])) where headword = 'businesswoman';
update words set level_tags = array(select distinct unnest(level_tags || '{FLYERS,MOVERS,STARTERS}'::text[])) where headword = 'candy';
update words set level_tags = array(select distinct unnest(level_tags || '{FLYERS,MOVERS}'::text[])) where headword = 'center';
update words set level_tags = array(select distinct unnest(level_tags || '{FLYERS,MOVERS,STARTERS}'::text[])) where headword = 'child';
update words set level_tags = array(select distinct unnest(level_tags || '{FLYERS,MOVERS}'::text[])) where headword = 'city centre';
update words set level_tags = array(select distinct unnest(level_tags || '{FLYERS,MOVERS,STARTERS}'::text[])) where headword = 'foot';
update words set level_tags = array(select distinct unnest(level_tags || '{FLYERS,MOVERS}'::text[])) where headword = 'have got to';
update words set level_tags = array(select distinct unnest(level_tags || '{FLYERS,MOVERS,STARTERS}'::text[])) where headword = 'lorry';
update words set level_tags = array(select distinct unnest(level_tags || '{FLYERS,MOVERS,STARTERS}'::text[])) where headword = 'man';
update words set level_tags = array(select distinct unnest(level_tags || '{FLYERS,MOVERS,STARTERS}'::text[])) where headword = 'mouse';
update words set level_tags = array(select distinct unnest(level_tags || '{FLYERS,MOVERS,STARTERS}'::text[])) where headword = 'people';
update words set level_tags = array(select distinct unnest(level_tags || '{FLYERS,MOVERS,STARTERS}'::text[])) where headword = 'person';
update words set level_tags = array(select distinct unnest(level_tags || '{FLYERS}'::text[])) where headword = 'program';
update words set level_tags = array(select distinct unnest(level_tags || '{FLYERS,MOVERS,STARTERS}'::text[])) where headword = 'rubber';
update words set level_tags = array(select distinct unnest(level_tags || '{FLYERS,MOVERS}'::text[])) where headword = 'stairs';
update words set level_tags = array(select distinct unnest(level_tags || '{FLYERS,MOVERS,STARTERS}'::text[])) where headword = 'television';
update words set level_tags = array(select distinct unnest(level_tags || '{FLYERS,MOVERS}'::text[])) where headword = 'tooth';
update words set level_tags = array(select distinct unnest(level_tags || '{FLYERS,MOVERS}'::text[])) where headword = 'wake up';
update words set level_tags = array(select distinct unnest(level_tags || '{FLYERS,MOVERS,STARTERS}'::text[])) where headword = 'woman';

-- 驗收：確認上面這批字現在都有完整的 level_tags
select headword, level_tags from words where headword in (
  'autumn',
  'blonde',
  'businessman',
  'businesswoman',
  'candy',
  'center',
  'child',
  'city centre',
  'foot',
  'have got to',
  'lorry',
  'man',
  'mouse',
  'people',
  'person',
  'program',
  'rubber',
  'stairs',
  'television',
  'tooth',
  'wake up',
  'woman'
) order by headword;