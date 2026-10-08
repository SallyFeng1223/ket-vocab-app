// provider：出題來源。唯一的工作是「決定回傳哪些題目、什麼順序」，
// 不碰 DOM、不寫入任何資料表。
//
// getDiagnosticQueue（W1）固定從 items 表撈 80 題診斷清單裡「這個 profile 還沒答過」
// 的部分，打亂順序後最多回傳 40 題。
//
// getDailyQueue（B4 建立、B2 改寫）是日常模式，用三個桶子（到期複習／易錯加權／
// 新字，配比讀 app_settings.session_mix）組一輪 10 題，細節見該函式註解。
// 不管哪個 provider，回傳陣列的形狀都要維持跟下面這個 typedef 一致，
// renderer.js / recorder.js 才不用跟著改。
//
// @typedef {Object} DiagnosticItem
// @property {string} item_id          - items.id
// @property {string} word_id          - items.word_id
// @property {string} skill            - 例如 'L0'
// @property {string} prompt           - 題幹；L0 就是英文單字本身（items.prompt）
// @property {string} answer           - 正確答案（中文）
// @property {{distractors_zh: string[]}} payload - 題型專屬資料，L0 是 3 個干擾選項
// @property {number} content_version  - 寫進 attempts.item_content_version 用

import { shuffle, taipeiDateKey, taipeiDayStartIso } from "./utils.js?v=11";
import { getAppSetting } from "./settings.js?v=11";

const MAX_PER_SESSION = 40;
const ROUND_SIZE = 10;
// 撈這麼多張「到期」的卡當候選池，比 ROUND_SIZE 大是因為同一字最多出現 2 次、
// 找不到對應題目要跳過都得從候選池裡補，池子太小會補不滿一輪。
const DUE_CANDIDATE_BUFFER = 30;
// 易錯桶放寬到「全部卡片依 lapses 排序」時撈的候選數，理由同上
const LAPSE_CANDIDATE_BUFFER = 30;
const SAME_WORD_MAX_PER_SESSION = 2;
// concreteness 5/4 共 635 字，撈前 200 個當新字候選池——.in() 塞的 id 數量
// 固定在這個大小，不會隨卡片總數成長（避免 URL 過長被擋掉）。
const NEW_WORD_CANDIDATE_POOL = 200;
const NEW_CARD_FETCH_LIMIT = 20;
// 出題時把整張卡帶給 recorder，答完直接在本地算 FSRS、不用回頭再讀一次（B2）
const CARD_COLUMNS =
  "id, word_id, skill, state, stability, difficulty, due_at, last_review_at, reps, lapses, consecutive_wrong, demoted_to";

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

  // 這個 profile 所有 diagnostic session（不分 completed 與否，中途關掉的也算）
  // 底下已經答過的 item，兩段式查詢、不用 embedded join，避免 RLS 卡住 join 卻
  // 不報錯、靜默回傳空陣列的狀況（撈題撈得到，撈已答紀錄撈不到，續作機制就失效）。
  const { data: diagnosticSessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("id")
    .eq("profile_id", profileId)
    .eq("session_type", "diagnostic");

  if (sessionsError) {
    throw new Error(`撈診斷 session 失敗：${sessionsError.message}`);
  }

  const sessionIds = (diagnosticSessions ?? []).map((s) => s.id);

  let answeredIds = new Set();
  if (sessionIds.length > 0) {
    const { data: answered, error: answeredError } = await supabase
      .from("attempts")
      .select("item_id")
      .in("session_id", sessionIds);

    if (answeredError) {
      throw new Error(`撈已作答紀錄失敗：${answeredError.message}`);
    }
    answeredIds = new Set((answered ?? []).map((a) => a.item_id));
  }

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

// ============================================================
// 日常模式（B2）：三個桶子的候選卡各自撈，再依配比挑出一輪 10 題。
// ============================================================

// 到期複習桶的候選：order by due_at asc，逾期多久都不另外算分（9/30 決策），
// 逾期久的卡交給 FSRS 用實際經過天數處理。
//
// 排除 state='new'：B7 把全部 1,398 張 L1 初始卡的 due_at 設成建卡當下的
// now()，不排除的話這些卡會全部從「到期」路徑被撈出來、繞過新字桶的
// concreteness 排序（第一題因此出現虛詞 a，B4 實測踩過）。新卡一律走新字桶。
//
// 沒有 L0 題目的 L0 卡（決策 14：不補）由 B2_2_suspend_l0_without_items.sql
// 設成 suspended，這裡的 suspended=false 就會濾掉。不濾掉的話，這些卡永遠沒
// 人作答、due_at 永遠不會往後推，會一直排在最前面占滿候選池，真正該複習的
// L1/L2 卡反而擠不進來。
async function fetchDueCandidates(supabase, profileId) {
  const { data, error } = await supabase
    .from("cards")
    .select(CARD_COLUMNS)
    .eq("profile_id", profileId)
    .eq("suspended", false)
    .neq("state", "new")
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(DUE_CANDIDATE_BUFFER);

  if (error) {
    throw new Error(`撈到期卡片失敗：${error.message}`);
  }
  return data ?? [];
}

// 易錯桶放寬時的候選：全部卡片依 lapses 排序（不看是否到期，今天剛答錯的卡
// 也會進來，等於後面幾輪還有機會再遇到——9/30 確認的設計）。
// 加 lapses > 0：不然補進來的會是一堆從沒錯過的卡，失去「易錯」的意義。
async function fetchLapseCandidates(supabase, profileId) {
  const { data, error } = await supabase
    .from("cards")
    .select(CARD_COLUMNS)
    .eq("profile_id", profileId)
    .eq("suspended", false)
    .gt("lapses", 0)
    .order("lapses", { ascending: false })
    .limit(LAPSE_CANDIDATE_BUFFER);

  if (error) {
    throw new Error(`撈易錯卡片失敗：${error.message}`);
  }
  return data ?? [];
}

// 新字桶的候選：先從 words 撈 concreteness 5/4（PROGRESS.md 給 B2 的備註第一段，
// 共 635 字）裡最具體的前 NEW_WORD_CANDIDATE_POOL 個 word_id，再拿這個固定
// 大小的 id 清單去 cards 找對應的 state='new' 卡。
//
// 兩段式查詢是 B4 修過的版本：舊版直接把這個 profile 全部 state='new' 的卡
// （1,398 張）一次撈回來，.in() 塞進上千個 UUID，URL 過長被 Supabase 擋掉
// （400 Bad Request）。兩段式把塞進 .in() 的 id 數量鎖在候選池大小。
//
// 不 select freq_rank（不確定欄位是否存在）。
async function fetchNewCandidates(supabase, profileId) {
  const { data: candidateWords, error: candidateWordsError } = await supabase
    .from("words")
    .select("id, headword, concreteness")
    .in("concreteness", [5, 4])
    .order("concreteness", { ascending: false })
    .limit(NEW_WORD_CANDIDATE_POOL);

  if (candidateWordsError) {
    throw new Error(`撈候選新字失敗：${candidateWordsError.message}`);
  }

  // PostgREST 不能 order by length(headword)，這段在 JS 端補第二個排序鍵：
  // concreteness 同分時（實測發現 above/accident/accommodation... 這種
  // a 開頭難字會全部擠在最前面，因為同分退回字母序），改成依 headword 長度
  // 升冪，短字優先，降低第一輪就出現 accommodation 這種 13 字母字的挫折感。
  const sortedCandidateWords = (candidateWords ?? []).slice().sort((a, b) => {
    if (b.concreteness !== a.concreteness) return b.concreteness - a.concreteness;
    return (a.headword ?? "").length - (b.headword ?? "").length;
  });

  const candidateWordIds = sortedCandidateWords.map((w) => w.id);
  if (candidateWordIds.length === 0) return [];
  // .in() 不保證回傳順序跟輸入陣列一致，用這個 rank 記住上面排好的順序，
  // 撈完 cards 後照這個排回去。
  const rankByWordId = new Map(candidateWordIds.map((id, i) => [id, i]));

  const { data, error } = await supabase
    .from("cards")
    .select(CARD_COLUMNS)
    .eq("profile_id", profileId)
    .eq("state", "new")
    .eq("suspended", false)
    .in("word_id", candidateWordIds)
    .limit(NEW_CARD_FETCH_LIMIT);

  if (error) {
    throw new Error(`撈新字卡片失敗：${error.message}`);
  }
  return (data ?? []).sort(
    (a, b) => (rankByWordId.get(a.word_id) ?? 0) - (rankByWordId.get(b.word_id) ?? 0)
  );
}

async function fetchDailyNewLimit(supabase, profileId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("daily_new_limit")
    .eq("id", profileId)
    .single();

  if (error) {
    throw new Error(`讀 daily_new_limit 失敗：${error.message}`);
  }
  if (data.daily_new_limit == null) {
    throw new Error("profiles.daily_new_limit 沒有設定，請先貼 B2_2_profile_limit.sql");
  }
  return data.daily_new_limit;
}

/**
 * 今天（台北時間）已經第一次出現的卡片數——每日新卡上限（§6「每日新卡上限由
 * profiles.daily_new_limit 控制」，含 L2 晉級卡，B2 已確認）就是扣這個數字。
 *
 * 從 attempts 算，不另外記計數器：attempts 是原始紀錄（§3.4），計數器寫失敗
 * 就會跟實際對不上。算法：今天作答過的 (word, skill) 組合裡，今天以前從沒
 * 作答過的，就是今天新出現的卡。兩次查詢都只塞今天碰過的字（一天頂多幾十個），
 * .in() 不會過長。
 *
 * attempts.skill 記的是「實際出的題型」，降級時會比卡片低一階；但降級要連錯
 * 才會發生，降級後出的低一階題型以前一定答過，所以不會被誤算成新卡。
 *
 * main.js 一輪結束後也用這支算出數字寫進 daily_stats.new_words。
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} profileId
 * @returns {Promise<number>}
 */
export async function countNewCardsToday(supabase, profileId) {
  const todayStartIso = taipeiDayStartIso(taipeiDateKey(new Date()));

  const { data: todayRows, error: todayError } = await supabase
    .from("attempts")
    .select("word_id, skill")
    .eq("profile_id", profileId)
    .gte("created_at", todayStartIso);

  if (todayError) {
    throw new Error(`撈今日作答失敗：${todayError.message}`);
  }
  const todayPairs = new Set((todayRows ?? []).map((r) => `${r.word_id}:${r.skill}`));
  if (todayPairs.size === 0) return 0;

  const todayWordIds = [...new Set((todayRows ?? []).map((r) => r.word_id))];
  const { data: earlierRows, error: earlierError } = await supabase
    .from("attempts")
    .select("word_id, skill")
    .eq("profile_id", profileId)
    .lt("created_at", todayStartIso)
    .in("word_id", todayWordIds);

  if (earlierError) {
    throw new Error(`撈過去作答失敗：${earlierError.message}`);
  }
  const earlierPairs = new Set((earlierRows ?? []).map((r) => `${r.word_id}:${r.skill}`));

  let count = 0;
  for (const pair of todayPairs) {
    if (!earlierPairs.has(pair)) count++;
  }
  return count;
}

/**
 * 組一輪 10 題（§5.4，配比讀 app_settings.session_mix）。挑選順序：
 *
 *   1. 到期複習 session_mix.due 張：依 due_at 由舊到新
 *   2. 易錯加權 session_mix.lapse_weighted 張：先從「剩下的到期卡」依 lapses
 *      高到低補；不夠再放寬到全部卡片依 lapses 排序
 *   3. 新字 session_mix.new 張：不能超過今天剩下的新卡額度（daily_new_limit
 *      減今天已出現的新卡）
 *   4. 前面哪個桶子不夠，剩下的名額依「到期 → 易錯 → 新字」互補，新字仍受
 *      每日額度限制。全部候選都用完時這一輪就少於 10 題（跟 B4 行為一樣）
 *
 * 三個桶子可能撈到同一張卡（例如逾期卡同時也是易錯卡），用 card.id 去重。
 *
 * 易錯桶刻意「不」改出低一階題型（§5.4 原文寫「優先出低一階題型」）：§5.5 已經
 * 有連錯降級機制，兩套同時決定題型會互相競爭（B2 已確認）。
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} profileId
 * @returns {Promise<Array<DiagnosticItem & {card_id: string, card: Object, hint_used_forced: boolean}>>}
 *   最多 10 筆。card_id 是這題對應的 cards.id；card 是整列 cards 資料（CARD_COLUMNS），
 *   recorder 答完後用它在本地算 FSRS 與挫折控制；hint_used_forced 代表這張卡目前是
 *   降級狀態，出題時要顯示提示。
 */
export async function getDailyQueue(supabase, profileId) {
  const [mix, newLimit, newToday, dueCards, lapseCards, newCards] = await Promise.all([
    getAppSetting(supabase, "session_mix"),
    fetchDailyNewLimit(supabase, profileId),
    countNewCardsToday(supabase, profileId),
    fetchDueCandidates(supabase, profileId),
    fetchLapseCandidates(supabase, profileId),
    fetchNewCandidates(supabase, profileId),
  ]);

  const allCandidates = dueCards.concat(lapseCards, newCards);
  const candidateWordIds = [...new Set(allCandidates.map((c) => c.word_id))];
  let itemsByWordSkill = new Map();
  if (candidateWordIds.length > 0) {
    const { data: itemsRaw, error: itemsError } = await supabase
      .from("items")
      .select("id, word_id, skill, prompt, answer, payload, content_version")
      .in("word_id", candidateWordIds)
      .eq("status", "active");

    if (itemsError) {
      throw new Error(`撈題目失敗：${itemsError.message}`);
    }
    itemsByWordSkill = new Map(
      (itemsRaw ?? []).map((it) => [`${it.word_id}:${it.skill}`, it])
    );
  }

  // 降級中的卡出低一階題型；如果那個字沒有低一階的題目（例如降級到 L0，但
  // A8 取消後 L0 只有診斷用的 80 字），退回原題型、照樣顯示提示。不退回的話
  // 這張卡永遠出不了題、永遠沒人作答，會一直卡在到期桶裡。
  function resolveItem(card) {
    const preferred = card.demoted_to || card.skill;
    const item = itemsByWordSkill.get(`${card.word_id}:${preferred}`);
    if (item || !card.demoted_to) return item ?? null;
    return itemsByWordSkill.get(`${card.word_id}:${card.skill}`) ?? null;
  }

  const queue = [];
  const usedCardIds = new Set();
  const skippedCardIds = new Set();
  const wordCount = new Map();

  function tryPick(card) {
    if (queue.length >= ROUND_SIZE) return false;
    if (usedCardIds.has(card.id) || skippedCardIds.has(card.id)) return false;
    if ((wordCount.get(card.word_id) ?? 0) >= SAME_WORD_MAX_PER_SESSION) return false;

    const item = resolveItem(card);
    if (!item) {
      // 內容缺口，跳過這張卡，不讓整輪出題失敗；記下來避免後面的桶子重複警告
      skippedCardIds.add(card.id);
      console.warn(
        `daily queue: word_id=${card.word_id} skill=${card.demoted_to || card.skill} 沒有對應題目，跳過`
      );
      return false;
    }

    usedCardIds.add(card.id);
    wordCount.set(card.word_id, (wordCount.get(card.word_id) ?? 0) + 1);
    queue.push({
      item_id: item.id,
      word_id: item.word_id,
      skill: item.skill,
      prompt: item.prompt,
      answer: item.answer,
      payload: item.payload,
      content_version: item.content_version,
      card_id: card.id,
      card,
      hint_used_forced: Boolean(card.demoted_to),
    });
    return true;
  }

  function pickFrom(cards, n) {
    let picked = 0;
    for (const card of cards) {
      if (picked >= n || queue.length >= ROUND_SIZE) break;
      if (tryPick(card)) picked++;
    }
    return picked;
  }

  // 1. 到期複習
  pickFrom(dueCards, mix.due);

  // 2. 易錯加權：先剩下的到期卡依 lapses 排序，不夠再放寬到全部卡片
  const remainingDueByLapses = dueCards
    .filter((c) => !usedCardIds.has(c.id))
    .sort((a, b) => (b.lapses ?? 0) - (a.lapses ?? 0));
  const lapsePicked = pickFrom(remainingDueByLapses, mix.lapse_weighted);
  pickFrom(lapseCards, mix.lapse_weighted - lapsePicked);

  // 3. 新字：受每日新卡額度限制
  let newBudget = Math.max(0, newLimit - newToday);
  newBudget -= pickFrom(newCards, Math.min(mix.new, newBudget));

  // 4. 不夠 10 題：依 到期 → 易錯 → 新字 互補
  pickFrom(dueCards, ROUND_SIZE);
  pickFrom(lapseCards, ROUND_SIZE);
  pickFrom(newCards, newBudget);

  return queue;
}
