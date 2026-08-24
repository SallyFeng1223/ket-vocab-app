-- ============================================================
-- B0-2 L1 辨形 payload — 批次 05，本批 5 筆
-- 規則式生成，qa_checked 直接設 true（規劃書 §5.6：不需人工抽查）
-- ============================================================

insert into items (word_id, skill, prompt, answer, payload, status, qa_checked, content_version)
select w.id, 'L1', w.zh, w.headword, v.payload::jsonb, 'active', true, 1
from words w
join (values
  ('yet', '{"wrong_spellings": ["yett", "yat"]}'),
  ('yourself', '{"wrong_spellings": ["yourselff", "yoursalf"]}'),
  ('zebra', '{"wrong_spellings": ["zebraa", "zebre"]}'),
  ('zero', '{"wrong_spellings": ["zeroo", "zaro"]}'),
  ('zoo', '{"wrong_spellings": ["zo", "zooo"]}')
) as v(headword, payload)
on w.headword = v.headword;
