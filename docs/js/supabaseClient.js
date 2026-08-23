// Supabase 連線設定。
//
// URL 跟 anon key 設計上就是公開的（真正的保護來自 RLS，已開啟），
// 可以直接寫在這裡、commit 進 repo。
// 絕對不可以寫進來的是共用帳號的密碼——那個由使用者在登入表單手動輸入。
//
// 去 Supabase 專案設定 → API 頁面複製這兩個值填進來：
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "REPLACE_WITH_YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "REPLACE_WITH_YOUR_SUPABASE_ANON_KEY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
