// recorder：所有資料庫寫入都集中在這裡（sessions 建立/收尾、attempts 寫入、
// 失敗重試佇列）。renderer 判完分後只呼叫 onAnswer 回呼，不直接碰資料庫；
// main.js 決定把 onAnswer 收到的資料交給 recorder。
//
// W2 加 SRS 時，cards 的更新邏輯會加在這裡（或另一支跟這裡並列的模組），
// renderer.js 不需要改一行。

const PENDING_KEY = "ket_pending_attempts";

function readPending() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writePending(list) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch {
    // localStorage 滿了或被封鎖也不該讓作答中斷，安靜放棄即可
  }
}

/**
 * 把還沒送出去的 attempts 重試一次。送成功的就從佇列移除，失敗的留著。
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function flushPendingAttempts(supabase) {
  const pending = readPending();
  if (pending.length === 0) return;

  const stillPending = [];
  for (const row of pending) {
    const { error } = await supabase.from("attempts").insert(row);
    if (error) {
      stillPending.push(row);
    }
  }
  writePending(stillPending);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} profileId
 * @returns {Promise<string>} 新建立的 session id
 */
export async function startSession(supabase, profileId) {
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      profile_id: profileId,
      started_at: new Date().toISOString(),
      session_type: "diagnostic",
      completed: false,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`建立 session 失敗：${error.message}`);
  }
  return data.id;
}

/**
 * 寫一筆作答紀錄。失敗不丟例外中斷作答，改進 localStorage 佇列等下一次重試。
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{profileId: string, sessionId: string}} ctx
 * @param {{item: import('./provider.js').DiagnosticItem, chosen: string, is_correct: boolean, response_ms: number, hint_used: boolean}} answer
 */
export async function recordAnswer(supabase, { profileId, sessionId }, answer) {
  const { item, chosen, is_correct, response_ms, hint_used } = answer;

  const row = {
    profile_id: profileId,
    session_id: sessionId,
    item_id: item.item_id,
    word_id: item.word_id,
    skill: item.skill,
    item_content_version: item.content_version,
    is_correct,
    answer_given: chosen,
    response_ms,
    hint_used,
    attempt_no_in_item: 1,
  };

  // 先試著把之前失敗的補上，不管成不成功都繼續往下寫這一筆
  await flushPendingAttempts(supabase);

  const { error } = await supabase.from("attempts").insert(row);
  if (error) {
    const pending = readPending();
    pending.push(row);
    writePending(pending);
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} sessionId
 * @param {{itemCount: number, correctCount: number}} summary
 */
export async function finishSession(supabase, sessionId, { itemCount, correctCount }) {
  const { error } = await supabase
    .from("sessions")
    .update({
      ended_at: new Date().toISOString(),
      item_count: itemCount,
      correct_count: correctCount,
      completed: true,
    })
    .eq("id", sessionId);

  if (error) {
    throw new Error(`結算 session 失敗：${error.message}`);
  }
}
