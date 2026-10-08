-- ============================================================
-- B2-2：哥哥的每日新卡上限 12 → 6（規劃書 v1.4 §13 決策 12）
--
-- 「新卡」含 L2 晉級卡（§6 原文「每日新卡上限」）。排程器每輪開始前讀這個值，
-- 減去今天已經出現過的新卡數，剩下的才是這輪能出的新卡額度。
-- 跑兩週後看 daily_stats.new_words，若每次都頂到 6，考慮改成 8（改這裡就好）。
-- ============================================================

select name, daily_new_limit from profiles;

update profiles
set daily_new_limit = 6
where name = '哥哥';

select name, daily_new_limit from profiles;
