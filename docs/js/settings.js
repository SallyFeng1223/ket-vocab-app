// settings：讀 app_settings 的共用入口（規劃書 §4.2：參數放資料庫不寫死，
// 調整不用改程式）。缺設定就直接丟錯、不在程式裡塞預設值——跟 rewards.js 讀
// daily_coin_cap 同樣的原則，避免資料庫裡的值跟程式裡的備用值不一致時查不出原因。

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} key - app_settings.key
 * @returns {Promise<any>} app_settings.value（jsonb 解析後的值）
 */
export async function getAppSetting(supabase, key) {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    throw new Error(`讀 app_settings.${key} 失敗：${error.message}`);
  }
  if (!data) {
    throw new Error(`找不到 app_settings.${key}，請先貼對應的 SQL 建立這筆設定`);
  }
  return data.value;
}
