// provider：出題來源。唯一的工作是「決定回傳哪些題目、什麼順序」，
// 不碰 DOM、不寫入任何資料表。
//
// getDiagnosticQueue（W1）固定從 items 表撈 80 題診斷清單裡「這個 profile 還沒答過」
// 的部分，打亂順序後最多回傳 40 題。
//
// getDailyQueue（B4）是日常模式，從 cards 表撈到期＋新字組一輪 10 題。B2 的真
// SRS 排程器還沒做，內部的 selectDueAndNewCards() 先用固定規則頂著，之後只換
// 那一個函式。不管哪個 provider，回傳陣列的形狀都要維持跟下面這個 typedef 一致，
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

import { shuffle, SKILL_DEMOTE_MAP } from "./utils.js?v=11";

const MAX_PER_SESSION = 40;
const ROUND_SIZE = 10;
// 撈這麼多張「到期」的卡當候選池，比 ROUND_SIZE 大是因為同一字最多出現 2 次、
// 找不到對應題目要跳過都得從候選池裡補，池子太小會補不滿一輪。
const DUE_CANDIDATE_BUFFER = 30;
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
// 日常模式（B4）。B2 的 SRS 排程器還沒做，這裡先用固定規則頂著：
// 撈到期的卡，不夠 10 題就用 concreteness 排序補新字。
//
// **這是暫時的取題邏輯**——B2 做好以後，只要把這支函式換掉（保持回傳同樣
// 形狀：card 物件陣列，含 id/word_id/skill/demoted_to），下面 getDailyQueue()
// 其餘部分（word 上限、降級查題、item 缺漏處理）都不用動。
// ============================================================

async function selectDueAndNewCards(supabase, profileId) {
  const nowIso = new Date().toISOString();

  // 排除 state='new'：B7 把全部 1,398 張 L1 初始卡的 due_at 設成建卡當下的
  // now()，不是分散的。這裡如果不排除 state='new'，這些卡會全部符合
  // due_at<=now、從「到期」路徑被撈出來——due_at 幾乎同一時間戳記，同分時
  // 退回資料庫回傳順序，完全繞過下面「新字」路徑的 concreteness 排序（B2
  // 那條備註警告過的狀況）。「到期」路徑目前應該只處理真正的複習卡（L0，
  // state='review'），新字一律走 concreteness 排序那條路徑。
  const { data: dueCards, error: dueError } = await supabase
    .from("cards")
    .select(CARD_COLUMNS)
    .eq("profile_id", profileId)
    .eq("suspended", false)
    .neq("state", "new")
    .lte("due_at", nowIso)
    .order("due_at", { ascending: true })
    .limit(DUE_CANDIDATE_BUFFER);

  if (dueError) {
    throw new Error(`撈到期卡片失敗：${dueError.message}`);
  }

  // 新字候選：先從 words 撈 concreteness 5/4（PROGRESS.md 給 B2 的備註第一段，
  // 共 635 字）裡最具體的前 NEW_WORD_CANDIDATE_POOL 個 word_id，再拿這個固定
  // 大小的 id 清單去 cards 找對應的 state='new' 卡。
  //
  // 這是修過的版本：舊版直接把這個 profile 全部 state='new' 的卡（現在 1,398
  // 張）一次撈回來，導致下面 .in() 塞進上千個 UUID，URL 過長被 Supabase 擋掉
  // （400 Bad Request）。兩段式查詢把塞進 .in() 的 id 數量鎖在候選池大小，
  // 不會隨卡片總數成長。
  //
  // 不 select freq_rank（不確定欄位是否存在）。原本備註的第二段「其餘字依
  // headword 長度排序」這次沒做——635 字的新字池可以撐好幾個月，等真的撈不到
  // 候選（見下面 length===0 判斷）才需要處理，先不做。
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
  // .in() 不保證回傳順序跟輸入陣列一致，用這個 rank 記住上面排好的順序，
  // 撈完 cards 後照這個排回去。
  const rankByWordId = new Map(candidateWordIds.map((id, i) => [id, i]));

  const dueIds = new Set((dueCards ?? []).map((c) => c.id));
  let newCards = [];
  if (candidateWordIds.length > 0) {
    const { data: newCardsRaw, error: newError } = await supabase
      .from("cards")
      .select(CARD_COLUMNS)
      .eq("profile_id", profileId)
      .eq("state", "new")
      .eq("suspended", false)
      .in("word_id", candidateWordIds)
      .limit(NEW_CARD_FETCH_LIMIT);

    if (newError) {
      throw new Error(`撈新字卡片失敗：${newError.message}`);
    }

    newCards = (newCardsRaw ?? [])
      .filter((c) => !dueIds.has(c.id))
      .sort((a, b) => (rankByWordId.get(a.word_id) ?? 0) - (rankByWordId.get(b.word_id) ?? 0));
  }

  return (dueCards ?? []).concat(newCards);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} profileId
 * @returns {Promise<Array<DiagnosticItem & {card_id: string, card: Object, hint_used_forced: boolean}>>}
 *   最多 10 筆。card_id 是這題對應的 cards.id；card 是整列 cards 資料（CARD_COLUMNS），
 *   recorder 答完後用它在本地算 FSRS 與挫折控制；hint_used_forced 代表這張卡目前是降級狀態，出題時要顯示提示。
 */
export async function getDailyQueue(supabase, profileId) {
  const candidates = await selectDueAndNewCards(supabase, profileId);

  const candidateWordIds = [...new Set(candidates.map((c) => c.word_id))];
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

  const wordCount = new Map();
  const queue = [];

  for (const card of candidates) {
    if (queue.length >= ROUND_SIZE) break;

    const countSoFar = wordCount.get(card.word_id) ?? 0;
    if (countSoFar >= SAME_WORD_MAX_PER_SESSION) continue;

    const effectiveSkill = card.demoted_to || card.skill;
    const item = itemsByWordSkill.get(`${card.word_id}:${effectiveSkill}`);
    if (!item) {
      // 內容缺口（例如降級到 L0 但這個字沒有 L0 題目——A8 取消後 L0 只覆蓋
      // 診斷用的 80 字）。跳過這張卡，不讓整輪出題失敗。
      console.warn(
        `daily queue: word_id=${card.word_id} skill=${effectiveSkill} 沒有對應題目，跳過`
      );
      continue;
    }

    wordCount.set(card.word_id, countSoFar + 1);
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
  }

  return queue;
}
