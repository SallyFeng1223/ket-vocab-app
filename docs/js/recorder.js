// recorder：所有資料庫寫入都集中在這裡（sessions 建立/收尾、attempts 寫入、
// 失敗重試佇列、cards 的挫折控制更新）。renderer 判完分後只呼叫 onAnswer 回呼，
// 不直接碰資料庫；main.js 決定把 onAnswer 收到的資料交給 recorder。
//
// B4 先加 updateCardAfterAnswer 做 §5.5 挫折控制（consecutive_wrong/demoted_to）。
// B2 的完整 SRS（stability/difficulty/due_at）之後會加在另一支跟這裡並列的模組，
// renderer.js 不需要改一行。

import { SKILL_DEMOTE_MAP } from "./utils.js?v=10";

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
 * @param {'diagnostic' | 'daily'} sessionType
 * @returns {Promise<string>} 新建立的 session id
 */
export async function startSession(supabase, profileId, sessionType) {
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      profile_id: profileId,
      started_at: new Date().toISOString(),
      session_type: sessionType,
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

/**
 * §5.5 挫折控制，外加三個跟演算法無關的純計數欄位（B5 要求，不等 B2）：
 * reps / lapses / last_review_at。state / stability / difficulty /
 * retrievability 仍然不動，那些要接 FSRS 才有意義，現在寫會跟 B2 打架。
 *
 * cards.consecutive_wrong >= 3 → demoted_to 設為低一階 skill；
 * 降級後連對 2 次 → 解除降級。
 *
 * schema 沒有獨立的「降級後連對次數」欄位，這裡用同一個 consecutive_wrong 欄位
 * 兼職：未降級時是正數的連錯計數（>=3 觸發降級）；降級後改成負數的連對計數
 * （答對就往負的方向走一步，到 -2 解除降級並歸零；期間只要答錯一次就打斷、
 * 歸零重算，不會因此又重新累積到升級門檻，因為已經在降級狀態了）。
 * 這是刻意的欄位重用，不是新開一個欄位，之後如果覺得不好懂，換成
 * 一個獨立欄位（例如 demotion_correct_streak）也很單純，改這支函式就好。
 *
 * lapses 跟 consecutive_wrong 不是同一件事：lapses 是累計答錯次數，答對
 * 不歸零，B2 排「易錯加權 3 題」要靠它；consecutive_wrong 是連續答錯，
 * 答對就清零，只驅動降級。兩個都要維護，別合併成一個。
 *
 * due_at 是 TEMPORARY：答對 = now()+1 天、答錯 = now()（今天再出），純粹
 * 防止同一張卡在 B2 排程器接上前卡在同一天反覆出現，不是排程演算法。
 * B2 接上 FSRS 後這段（標 TEMPORARY 的三行）整段刪除。
 *
 * 失敗不拋例外中斷作答流程，只在主控台警告。
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} cardId
 * @param {boolean} isCorrect
 */
export async function updateCardAfterAnswer(supabase, cardId, isCorrect) {
  const { data: card, error: fetchError } = await supabase
    .from("cards")
    .select("skill, consecutive_wrong, demoted_to, reps, lapses")
    .eq("id", cardId)
    .single();

  if (fetchError) {
    console.warn(`挫折控制更新失敗（讀卡 ${cardId}）：${fetchError.message}`);
    return;
  }

  let consecutiveWrong = card.consecutive_wrong ?? 0;
  let demotedTo = card.demoted_to;

  if (demotedTo) {
    if (isCorrect) {
      consecutiveWrong = Math.min(consecutiveWrong, 0) - 1;
      if (consecutiveWrong <= -2) {
        demotedTo = null;
        consecutiveWrong = 0;
      }
    } else {
      consecutiveWrong = 0;
    }
  } else if (isCorrect) {
    consecutiveWrong = 0;
  } else {
    consecutiveWrong += 1;
    if (consecutiveWrong >= 3) {
      demotedTo = SKILL_DEMOTE_MAP[card.skill] ?? null;
      consecutiveWrong = 0; // 降級生效，計數器歸零重新開始追蹤「降級後連對次數」
    }
  }

  const reps = (card.reps ?? 0) + 1;
  const lapses = (card.lapses ?? 0) + (isCorrect ? 0 : 1);
  const now = new Date();
  // TEMPORARY：B2 接上 FSRS 後刪除，改由排程器算 due_at
  const dueAt = isCorrect
    ? new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
    : now.toISOString();

  const { error: updateError } = await supabase
    .from("cards")
    .update({
      consecutive_wrong: consecutiveWrong,
      demoted_to: demotedTo,
      reps,
      lapses,
      last_review_at: now.toISOString(),
      due_at: dueAt, // TEMPORARY
    })
    .eq("id", cardId);

  if (updateError) {
    console.warn(`挫折控制更新失敗（寫卡 ${cardId}）：${updateError.message}`);
  }
}
