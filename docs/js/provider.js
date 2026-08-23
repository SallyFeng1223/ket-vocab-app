// provider：出題來源。唯一的工作是「決定回傳哪些題目、什麼順序」，
// 不碰 DOM、不寫入任何資料表。
//
// 這一版（W1）固定從 items 表撈 80 題診斷清單裡「這個 profile 還沒答過」的部分，
// 打亂順序後最多回傳 40 題。W2 會換成 SRS 排程器，但回傳陣列的形狀必須維持
// 跟下面這個 typedef 一致，renderer.js / recorder.js 才不用跟著改。
//
// @typedef {Object} DiagnosticItem
// @property {string} item_id          - items.id
// @property {string} word_id          - items.word_id
// @property {string} skill            - 例如 'L0'
// @property {string} prompt           - 題幹；L0 就是英文單字本身（items.prompt）
// @property {string} answer           - 正確答案（中文）
// @property {{distractors_zh: string[]}} payload - 題型專屬資料，L0 是 3 個干擾選項
// @property {number} content_version  - 寫進 attempts.item_content_version 用

import { shuffle } from "./utils.js";

const MAX_PER_SESSION = 40;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} profileId
 * @returns {Promise<DiagnosticItem[]>} 最多 40 筆，已打亂順序
 */
export async function getDiagnosticQueue(supabase, profileId) {
  const { data: items, error: itemsError } = await supabase
    .from("items")
    .select("id, word_id, skill, prompt, answer, payload, content_version")
    .eq("skill", "L0")
    .eq("status", "active");

  if (itemsError) {
    throw new Error(`撈題目失敗：${itemsError.message}`);
  }

  const { data: answered, error: answeredError } = await supabase
    .from("attempts")
    .select("item_id, sessions!inner(session_type)")
    .eq("profile_id", profileId)
    .eq("sessions.session_type", "diagnostic");

  if (answeredError) {
    throw new Error(`撈已作答紀錄失敗：${answeredError.message}`);
  }

  const answeredIds = new Set((answered ?? []).map((a) => a.item_id));
  const remaining = (items ?? []).filter((i) => !answeredIds.has(i.id));

  const shuffled = shuffle(remaining).slice(0, MAX_PER_SESSION);

  return shuffled.map((i) => ({
    item_id: i.id,
    word_id: i.word_id,
    skill: i.skill,
    prompt: i.prompt,
    answer: i.answer,
    payload: i.payload,
    content_version: i.content_version,
  }));
}
