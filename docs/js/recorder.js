// recorder：所有資料庫寫入都集中在這裡（sessions 建立/收尾、attempts 寫入、
// 失敗重試佇列、cards 的挫折控制更新）。renderer 判完分後只呼叫 onAnswer 回呼，
// 不直接碰資料庫；main.js 決定把 onAnswer 收到的資料交給 recorder。
//
// B4 先加 updateCardAfterAnswer 做 §5.5 挫折控制（consecutive_wrong/demoted_to）。
// B2 接上 FSRS：排程計算在 srs.js（只算不寫），這裡負責把結果寫回 cards。
// renderer.js 不需要改一行。

import { SKILL_DEMOTE_MAP, taipeiDateKey } from "./utils.js?v=12";
import { rateAnswer, scheduleCard, nextSkillToPromote } from "./srs.js?v=12";

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
 * 答完一題後更新這張卡：FSRS 排程（state / stability / difficulty / due_at，
 * B2）、§5.5 挫折控制（consecutive_wrong / demoted_to）、純計數欄位
 * （reps / lapses / last_review_at）。
 *
 * 卡片目前的狀態由 provider 出題時一起帶過來（answer.item.card），不再先讀
 * 一次資料庫——每題只往返一次（寫入），排程在本地算（規劃書 §6）。同一輪裡
 * 一張卡只會出現一次，下一輪 provider 會重新撈，所以這份快照不會過期。
 *
 * 降級門檻讀 app_settings.demote_threshold（B2 起不再寫死）：
 * consecutive_wrong 達門檻 → demoted_to 設為低一階 skill；
 * 降級後連對 promote_back_after 次 → 解除降級。
 *
 * schema 沒有獨立的「降級後連對次數」欄位，這裡用同一個 consecutive_wrong 欄位
 * 兼職：未降級時是正數的連錯計數（達門檻觸發降級）；降級後改成負數的連對計數
 * （答對就往負的方向走一步，到 -promote_back_after 解除降級並歸零；期間只要答錯一次就打斷、
 * 歸零重算，不會因此又重新累積到升級門檻，因為已經在降級狀態了）。
 * 這是刻意的欄位重用，不是新開一個欄位，之後如果覺得不好懂，換成
 * 一個獨立欄位（例如 demotion_correct_streak）也很單純，改這支函式就好。
 *
 * lapses 跟 consecutive_wrong 不是同一件事：lapses 是累計答錯次數，答對
 * 不歸零，B2 排「易錯加權 3 題」要靠它；consecutive_wrong 是連續答錯，
 * 答對就清零，只驅動降級。兩個都要維護，別合併成一個。ts-fsrs 自己也會算
 * reps/lapses，但它的 lapses 只在複習卡答錯時 +1，跟這裡的定義不同，所以
 * 不採用（見 srs.js scheduleCard 註解）。
 *
 * 失敗不拋例外中斷作答流程，只在主控台警告。
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{item: {skill: string, card: Object}, is_correct: boolean, response_ms: number, hint_used: boolean}} answer
 *   renderer 交給 onAnswer 的作答資料；item.card 是 provider 帶過來的 cards 列
 * @param {Awaited<ReturnType<typeof import('./srs.js').loadSrsContext>>} srsContext
 */
export async function updateCardAfterAnswer(supabase, answer, srsContext) {
  const card = answer.item.card;
  const isCorrect = answer.is_correct;
  const { consecutive_wrong: demoteAt, promote_back_after: promoteBackAfter } =
    srsContext.demoteThreshold;

  let consecutiveWrong = card.consecutive_wrong ?? 0;
  let demotedTo = card.demoted_to;

  if (demotedTo) {
    if (isCorrect) {
      consecutiveWrong = Math.min(consecutiveWrong, 0) - 1;
      if (consecutiveWrong <= -promoteBackAfter) {
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
    if (consecutiveWrong >= demoteAt) {
      demotedTo = SKILL_DEMOTE_MAP[card.skill] ?? null;
      consecutiveWrong = 0; // 降級生效，計數器歸零重新開始追蹤「降級後連對次數」
    }
  }

  const reps = (card.reps ?? 0) + 1;
  const lapses = (card.lapses ?? 0) + (isCorrect ? 0 : 1);
  const now = new Date();

  // 評分用這題「實際出的題型」（降級時是低一階那個），中位數才對得上
  const rating = rateAnswer(
    {
      skill: answer.item.skill,
      isCorrect,
      hintUsed: answer.hint_used,
      responseMs: answer.response_ms,
    },
    srsContext.medians
  );
  // 算不出來（卡片資料不完整）時是 null，只更新計數欄位、排程欄位維持原樣
  const scheduled = scheduleCard(card, rating, now);

  const { error: updateError } = await supabase
    .from("cards")
    .update({
      ...(scheduled ?? {}),
      consecutive_wrong: consecutiveWrong,
      demoted_to: demotedTo,
      reps,
      lapses,
      last_review_at: now.toISOString(),
    })
    .eq("id", card.id);

  if (updateError) {
    console.warn(`更新卡片失敗（寫卡 ${card.id}）：${updateError.message}`);
    return;
  }

  const nextSkill = nextSkillToPromote(card.skill, scheduled, srsContext.promotion);
  if (nextSkill) {
    await promoteCard(supabase, card, nextSkill, now);
  }
}

/**
 * §5.2 晉級：幫同一個字建立下一個 skill 的新卡（state='new'，進新字桶，受每日
 * 新卡額度限制）。舊卡不動，繼續在原 skill 的複習軌道上。
 *
 * 那個字沒有下一個 skill 的題目就不建（例如 B0 規則湊不出字母磚的字）——建了
 * 也出不了題，只會一直卡在新字桶的候選裡。
 *
 * 用 upsert + ignoreDuplicates（= insert ... on conflict do nothing）：已經有
 * 這張卡（B7b 種子卡、或之前已晉級過）就什麼都不做。靠的是
 * UNIQUE (profile_id, word_id, skill) 約束，所以重複呼叫是安全的。
 *
 * 失敗不拋例外，只在主控台警告：晉級沒建成，下次這張卡再答對時還會再試。
 */
async function promoteCard(supabase, card, nextSkill, now) {
  const { data: nextItems, error: itemError } = await supabase
    .from("items")
    .select("id")
    .eq("word_id", card.word_id)
    .eq("skill", nextSkill)
    .eq("status", "active")
    .limit(1);

  if (itemError) {
    console.warn(`晉級查題目失敗（word_id=${card.word_id}）：${itemError.message}`);
    return;
  }
  if (!nextItems || nextItems.length === 0) return;

  const { error: insertError } = await supabase.from("cards").upsert(
    {
      profile_id: card.profile_id,
      word_id: card.word_id,
      skill: nextSkill,
      state: "new",
      due_at: now.toISOString(),
    },
    { onConflict: "profile_id,word_id,skill", ignoreDuplicates: true }
  );

  if (insertError) {
    console.warn(
      `晉級建卡失敗（word_id=${card.word_id} → ${nextSkill}）：${insertError.message}`
    );
  }
}

/**
 * 把今天的新卡數寫進 daily_stats.new_words（規劃書 v1.4 §9 F 每週檢查要看這個
 * 數字，決定 daily_new_limit 要不要從 6 上調）。數字由 provider 的
 * countNewCardsToday 從 attempts 算出來，這裡只負責寫入。
 *
 * 用 update 不用 upsert：今天這列 daily_stats 由 rewards.js 的金幣結算建立，
 * 這支在它之後呼叫。用 upsert 的話，萬一 rewards 失敗、這列不存在，就會插入
 * 一列只有 new_words 的不完整資料。update 找不到列就是什麼都不做。
 *
 * 失敗不拋例外，只在主控台警告（統計欄位，不該擋住結算畫面）。
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} profileId
 * @param {number} newWords
 */
export async function updateDailyNewWords(supabase, profileId, newWords) {
  const { error } = await supabase
    .from("daily_stats")
    .update({ new_words: newWords })
    .eq("profile_id", profileId)
    .eq("date", taipeiDateKey(new Date()));

  if (error) {
    console.warn(`寫入 daily_stats.new_words 失敗：${error.message}`);
  }
}
