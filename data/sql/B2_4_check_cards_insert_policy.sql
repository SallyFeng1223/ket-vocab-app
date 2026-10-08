-- ============================================================
-- B2-4：確認 cards 表允許已登入帳號 INSERT（L1→L2 晉級要從前端建卡）
--
-- 為什麼要查：之前所有建卡（B7、B7b）都是你在 SQL Editor 貼的，SQL Editor 用的
-- 是管理者權限，會繞過 RLS。B2-4 是第一次由 app 自己建卡，走的是共用帳號的
-- 權限，受 RLS 限制。如果沒有允許 INSERT 的政策，晉級會靜默失敗（主控台會有
-- 「晉級建卡失敗」警告，作答不受影響）。
-- ============================================================

-- 列出 cards 表的所有 RLS 政策。看 cmd 欄：
--   有一列是 INSERT 或 ALL，且 roles 含 authenticated → 已經可以，不用做任何事
--   只有 SELECT / UPDATE → 需要補 INSERT 政策，把結果貼給我，我再寫對應的 SQL
select policyname, cmd, roles, qual, with_check
from pg_policies
where tablename = 'cards';
