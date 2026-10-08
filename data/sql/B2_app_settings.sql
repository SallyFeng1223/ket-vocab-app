-- ============================================================
-- B2-3：app_settings 調整
--
-- (1) 新增 pool_filter（規劃書 v1.4 §9 F「本期詞池設定」、決策 11）
--     排程器撈新字時讀這筆，依 level_tags 篩詞池。只影響「新字」桶，
--     到期複習與易錯桶不受影響（避免複習中的 KET-only 字突然消失）。
--     2027-01-05 改成 '{"enabled": false}' 即回到全 A2 表，不用改程式。
--
-- (2) 刪除 coin_rules（10/08 決定）
--     這筆從沒被任何程式讀過；實際生效的是 daily_coin_cap = 50 與 rewards.js
--     寫死的今日目標大獎 20。兩套並存查帳會查不出金幣為什麼停在某個數字。
--     金幣數值要調是 2027-01 階段 G9 的事。
--
-- session_mix / promotion / demote_threshold 已存在，不重建。
-- ============================================================

insert into app_settings (key, value)
values ('pool_filter', '{"enabled": true, "level_tags": ["FLYERS"]}'::jsonb)
on conflict (key) do nothing;

delete from app_settings where key = 'coin_rules';

-- 確認：應該剩 session_mix / promotion / demote_threshold / daily_coin_cap / pool_filter 五筆
select key, value from app_settings order by key;
