-- ============================================================
-- A3 骨架資料 — 批次 01：字母 A
-- 來源：Cambridge A2 Key / Key for Schools Vocabulary List (Aug 2025)
-- 欄位：headword / pos / zh / level_tags / topics / sense_note
--       / is_phrasal / concreteness / status
--
-- 注意：
--   1. level_tags 本輪一律填 {KET}。Starters / Movers 標記待取得
--      官方 YLE 詞表後以 UPDATE 補上（累積式：Starters 的字最後
--      會是 {STARTERS,MOVERS,KET}）。
--   2. pos 只填主要詞性。
--   3. status 明確填 'active'，避免 schema 無預設值時變成 NULL，
--      導致 §2.3 的內容進度查詢查不到任何資料。
--   4. on conflict do nothing：重跑本檔不會產生重複資料。
-- ============================================================

insert into words
  (headword, pos, zh, level_tags, topics, sense_note, is_phrasal, concreteness, status)
values
('a',                  'det',    '一（不定冠詞）',              '{KET}', '{}', null, false, 1, 'active'),
('an',                 'det',    '一（用於母音開頭的字前）',    '{KET}', '{}', null, false, 1, 'active'),
('a few',              'det',    '一些、幾個',                  '{KET}', '{}', 'I invited a few of my friends.', false, 1, 'active'),
('able',               'adj',    '能夠的',                      '{KET}', '{Personal Feelings, Opinions and Experiences}', 'be able to', false, 1, 'active'),
('about',              'prep',   '關於；大約',                  '{KET}', '{}', 'a book about animals / I have about £3.', false, 1, 'active'),
('above',              'prep',   '在……上方',                    '{KET}', '{}', null, false, 2, 'active'),
('accident',           'n',      '意外、事故',                  '{KET}', '{Health, Medicine and Exercise}', null, false, 3, 'active'),
('accommodation',      'n',      '住宿',                        '{KET}', '{}', null, false, 3, 'active'),
('across',             'prep',   '橫越、在……對面',              '{KET}', '{}', 'He walked across the bridge.', false, 2, 'active'),
('act',                'v',      '演出、扮演',                  '{KET}', '{Entertainment and Media}', null, false, 2, 'active'),
('action',             'adj',    '動作的（如動作片）',          '{KET}', '{}', 'an action film', false, 2, 'active'),
('activity',           'n',      '活動',                        '{KET}', '{}', null, false, 2, 'active'),
('actor',              'n',      '演員',                        '{KET}', '{Entertainment and Media, Work and Jobs}', null, false, 4, 'active'),
('actually',           'adv',    '其實、實際上',                '{KET}', '{}', null, false, 1, 'active'),
('ad',                 'n',      '廣告',                        '{KET}', '{Documents and Texts, Shopping}', 'an ad on TV', false, 3, 'active'),
('add',                'v',      '加、增加',                    '{KET}', '{}', null, false, 2, 'active'),
('address',            'n',      '地址',                        '{KET}', '{Communication and Technology, House and Home}', null, false, 3, 'active'),
('adult',              'n',      '成年人',                      '{KET}', '{}', null, false, 4, 'active'),
('advanced',           'adj',    '進階的',                      '{KET}', '{Education}', null, false, 1, 'active'),
('adventure',          'n',      '冒險',                        '{KET}', '{Entertainment and Media}', null, false, 2, 'active'),
('advert',             'n',      '廣告',                        '{KET}', '{Documents and Texts, Shopping}', null, false, 3, 'active'),
('advertisement',      'n',      '廣告',                        '{KET}', '{Documents and Texts, Shopping}', null, false, 3, 'active'),
('advice',             'n',      '建議、忠告',                  '{KET}', '{}', null, false, 1, 'active'),
('aeroplane',          'n',      '飛機',                        '{KET}', '{Travel and Transport}', null, false, 5, 'active'),
('afraid',             'adj',    '害怕的',                      '{KET}', '{Personal Feelings, Opinions and Experiences}', null, false, 1, 'active'),
('after',              'prep',   '在……之後',                    '{KET}', '{}', null, false, 1, 'active'),
('afternoon',          'n',      '下午',                        '{KET}', '{Time}', null, false, 2, 'active'),
('afterwards',         'adv',    '之後、後來',                  '{KET}', '{}', null, false, 1, 'active'),
('again',              'adv',    '再一次',                      '{KET}', '{}', null, false, 1, 'active'),
('against',            'prep',   '對抗、與……比賽',              '{KET}', '{}', 'We watched England play against France.', false, 1, 'active'),
('age',                'n',      '年齡',                        '{KET}', '{}', 'I don''t know his age.', false, 2, 'active'),
('aged',               'adj',    '年齡為……的',                  '{KET}', '{}', 'aged 10–16', false, 1, 'active'),
('ago',                'adv',    '以前',                        '{KET}', '{}', null, false, 1, 'active'),
('agree',              'v',      '同意',                        '{KET}', '{}', null, false, 1, 'active'),
('air',                'n',      '空氣；航空',                  '{KET}', '{The Natural World}', 'to travel by air', false, 2, 'active'),
('airport',            'n',      '機場',                        '{KET}', '{Places: Town and City, Travel and Transport}', null, false, 5, 'active'),
('alarm clock',        'n',      '鬧鐘',                        '{KET}', '{}', null, false, 5, 'active'),
('album',              'n',      '專輯；相簿',                  '{KET}', '{}', null, false, 4, 'active'),
('all',                'det',    '全部的、所有的',              '{KET}', '{}', null, false, 1, 'active'),
('all kinds of',       'det',    '各種各樣的',                  '{KET}', '{}', null, false, 1, 'active'),
('allow',              'v',      '允許',                        '{KET}', '{}', null, false, 1, 'active'),
('all right',          'adj',    '好的、沒問題',                '{KET}', '{}', null, false, 1, 'active'),
('alright',            'adj',    '好的、沒問題',                '{KET}', '{}', null, false, 1, 'active'),
('all sorts of',       'det',    '各式各樣的',                  '{KET}', '{}', null, false, 1, 'active'),
('all the time',       'det',    '一直、總是',                  '{KET}', '{}', null, false, 1, 'active'),
('almost',             'adv',    '幾乎',                        '{KET}', '{}', null, false, 1, 'active'),
('alone',              'adj',    '獨自的',                      '{KET}', '{Personal Feelings, Opinions and Experiences}', null, false, 2, 'active'),
('along',              'prep',   '沿著',                        '{KET}', '{}', null, false, 2, 'active'),
('already',            'adv',    '已經',                        '{KET}', '{}', null, false, 1, 'active'),
('also',               'adv',    '也',                          '{KET}', '{}', null, false, 1, 'active'),
('always',             'adv',    '總是',                        '{KET}', '{}', null, false, 1, 'active'),
('a.m.',               'adv',    '上午',                        '{KET}', '{Time}', null, false, 2, 'active'),
('amazed',             'adj',    '感到驚奇的',                  '{KET}', '{Personal Feelings, Opinions and Experiences}', null, false, 1, 'active'),
('amazing',            'adj',    '令人驚奇的',                  '{KET}', '{Personal Feelings, Opinions and Experiences}', null, false, 1, 'active'),
('ambulance',          'n',      '救護車',                      '{KET}', '{Health, Medicine and Exercise, Travel and Transport}', null, false, 5, 'active'),
('among',              'prep',   '在……之中',                    '{KET}', '{}', null, false, 1, 'active'),
('and',                'conj',   '和、而且',                    '{KET}', '{}', null, false, 1, 'active'),
('angry',              'adj',    '生氣的',                      '{KET}', '{Personal Feelings, Opinions and Experiences}', null, false, 2, 'active'),
('animal',             'n',      '動物',                        '{KET}', '{}', null, false, 5, 'active'),
('another',            'det',    '另一個',                      '{KET}', '{}', null, false, 1, 'active'),
('answer',             'n',      '答案；回答',                  '{KET}', '{}', null, false, 2, 'active'),
('any',                'det',    '任何的',                      '{KET}', '{}', null, false, 1, 'active'),
('anybody',            'pron',   '任何人',                      '{KET}', '{}', null, false, 1, 'active'),
('anymore',            'adv',    '不再',                        '{KET}', '{}', null, false, 1, 'active'),
('anyone',             'pron',   '任何人',                      '{KET}', '{}', null, false, 1, 'active'),
('anything',           'pron',   '任何事物',                    '{KET}', '{}', null, false, 1, 'active'),
('anyway',             'adv',    '無論如何',                    '{KET}', '{}', null, false, 1, 'active'),
('anywhere',           'adv',    '任何地方',                    '{KET}', '{}', null, false, 1, 'active'),
('apartment',          'n',      '公寓',                        '{KET}', '{House and Home, Places: Buildings}', null, false, 5, 'active'),
('apartment building', 'n',      '公寓大樓',                    '{KET}', '{Places: Buildings}', null, false, 5, 'active'),
('app',                'n',      '應用程式',                    '{KET}', '{Communication and Technology}', null, false, 3, 'active'),
('apple',              'n',      '蘋果',                        '{KET}', '{Food and Drink}', null, false, 5, 'active'),
('appointment',        'n',      '預約、約診',                  '{KET}', '{Health, Medicine and Exercise, Time}', 'an appointment with the doctor', false, 2, 'active'),
('April',              'n',      '四月',                        '{KET}', '{Time}', null, false, 2, 'active'),
('area',               'n',      '地區、區域',                  '{KET}', '{Places: Countryside}', null, false, 2, 'active'),
('arm',                'n',      '手臂',                        '{KET}', '{Health, Medicine and Exercise}', null, false, 5, 'active'),
('armchair',           'n',      '扶手椅',                      '{KET}', '{House and Home}', null, false, 5, 'active'),
('around',             'prep',   '在……周圍；到處',              '{KET}', '{}', 'to sit around the table', false, 2, 'active'),
('arrive',             'v',      '抵達',                        '{KET}', '{}', null, false, 2, 'active'),
('art',                'n',      '藝術、美術',                  '{KET}', '{Education, Entertainment and Media}', null, false, 2, 'active'),
('article',            'n',      '文章',                        '{KET}', '{Documents and Texts}', 'an article about skiing', false, 3, 'active'),
('artist',             'n',      '藝術家',                      '{KET}', '{Work and Jobs}', null, false, 4, 'active'),
('as',                 'conj',   '如同、當作',                  '{KET}', '{}', 'as good as / as soon as possible', false, 1, 'active'),
('ask',                'v',      '問、要求',                    '{KET}', '{}', null, false, 2, 'active'),
('assistant',          'n',      '助理、店員',                  '{KET}', '{Shopping}', null, false, 4, 'active'),
('as well',            'adv',    '也',                          '{KET}', '{}', null, false, 1, 'active'),
('as well as',         'prep',   '除了……之外也',                '{KET}', '{}', null, false, 1, 'active'),
('at',                 'prep',   '在（地點、時間）；@（電子郵件）', '{KET}', '{Communication and Technology}', 'My email address is david@gmail.com', false, 1, 'active'),
('at all',             'prep',   '完全（多用於否定句）',        '{KET}', '{}', null, false, 1, 'active'),
('attractive',         'adj',    '好看的、吸引人的',            '{KET}', '{}', 'The walls are an attractive colour.', false, 2, 'active'),
('August',             'n',      '八月',                        '{KET}', '{Time}', null, false, 2, 'active'),
('aunt',               'n',      '阿姨、姑姑、伯母',            '{KET}', '{Family and Friends}', null, false, 4, 'active'),
('autumn',             'n',      '秋天',                        '{KET}', '{The Natural World, Time}', null, false, 3, 'active'),
('available',          'adj',    '可取得的、有空的',            '{KET}', '{}', null, false, 1, 'active'),
('away',               'adv',    '離開；相距',                  '{KET}', '{}', 'It''s two kilometres away.', false, 1, 'active'),
('awesome',            'adj',    '很棒的',                      '{KET}', '{}', null, false, 1, 'active'),
('awful',              'adj',    '糟糕的、很差的',              '{KET}', '{}', null, false, 1, 'active')
on conflict (headword) do nothing;


-- ============================================================
-- 驗收：預期 97 筆，且 zh 無空值
-- ============================================================
select
  count(*)                                as 本批筆數,
  count(*) filter (where zh is null
                      or trim(zh) = '')   as zh為空,
  count(*) filter (where status <> 'active') as 狀態異常
from words
where headword ~* '^a';
