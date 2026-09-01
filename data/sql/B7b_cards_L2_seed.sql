-- ============================================================
-- B7b 種子批：先建一小批 L2 字母磚卡片（僅哥哥）
-- 條件：concreteness=5、headword 長度 4-7 字母、有 L2 題目
-- 從符合條件的候選字裡以 SEED=20260825 打亂取前 50 個
-- state=new、due_at=now；B2 晉級規則上線後接手，on conflict 保護不衝突
-- ============================================================

do $$
declare
  target_profile_id uuid := (select id from profiles where name = '哥哥');
begin

  insert into cards (profile_id, word_id, skill, state, due_at)
  select target_profile_id, w.id, 'L2', 'new', now()
  from words w
  where w.headword in (
    'banana',
    'bathtub',
    'beard',
    'biscuit',
    'blouse',
    'book',
    'bread',
    'bridge',
    'brush',
    'butter',
    'cafe',
    'carrot',
    'castle',
    'ceiling',
    'dress',
    'earring',
    'factory',
    'gallery',
    'garlic',
    'hotel',
    'lake',
    'library',
    'lorry',
    'melon',
    'mobile',
    'mother',
    'mouth',
    'neck',
    'nose',
    'park',
    'parrot',
    'perfume',
    'picture',
    'plant',
    'port',
    'rabbit',
    'river',
    'salt',
    'sausage',
    'school',
    'shoe',
    'sock',
    'sweater',
    'taxi',
    'toast',
    'tree',
    'tyre',
    'window',
    'wing',
    'yoghurt'
  )
  on conflict (profile_id, word_id, skill) do nothing;

end $$;


-- ============================================================
-- 驗收
-- ============================================================
select skill, state, count(*) as 卡片數
from cards c join profiles p on p.id = c.profile_id
where p.name = '哥哥' and c.skill = 'L2'
group by skill, state;