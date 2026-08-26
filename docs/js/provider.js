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

import { shuffle, SKILL_DEMOTE_MAP } from "./utils.js?v=5";

const MAX_PER_SESSION = 40;
const ROUND_SIZE = 10;
// 撈這麼多張「到期」的卡當候選池，比 ROUND_SIZE 大是因為同一字最多出現 2 次、
// 找不到對應題目要跳過都得從候選池裡補，池子太小會補不滿一輪。
const DUE_CANDIDATE_BUFFER = 30;
const SAME_WORD_MAX_PER_SESSION = 2;

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

  const { data: dueCards, error: dueError } = await supabase
    .from("cards")
    .select("id, word_id, skill, demoted_to")
    .eq("profile_id", profileId)
    .eq("suspended", false)
    .lte("due_at", nowIso)
    .order("due_at", { ascending: true })
    .limit(DUE_CANDIDATE_BUFFER);

  if (dueError) {
    throw new Error(`撈到期卡片失敗：${dueError.message}`);
  }

  const { data: newCardsRaw, error: newError } = await supabase
    .from("cards")
    .select("id, word_id, skill, demoted_to")
    .eq("profile_id", profileId)
    .eq("state", "new")
    .eq("suspended", false);

  if (newError) {
    throw new Error(`撈新字卡片失敗：${newError.message}`);
  }

  const dueIds = new Set((dueCards ?? []).map((c) => c.id));
  const newCards = (newCardsRaw ?? []).filter((c) => !dueIds.has(c.id));

  // 排新字順序（PROGRESS.md 給 B2 的備註）：
  // 第一段 concreteness in (5,4)，依 concreteness desc、freq_rank asc；
  // 第二段 其餘，依 headword 長度 asc。
  const newCardWordIds = newCards.map((c) => c.word_id);
  let wordMeta = new Map();
  if (newCardWordIds.length > 0) {
    const { data: words, error: wordsError } = await supabase
      .from("words")
      .select("id, headword, concreteness, freq_rank")
      .in("id", newCardWordIds);

    if (wordsError) {
      throw new Error(`撈 words 排序資料失敗：${wordsError.message}`);
    }
    wordMeta = new Map((words ?? []).map((w) => [w.id, w]));
  }

  const sortedNewCards = newCards.slice().sort((a, b) => {
    const wa = wordMeta.get(a.word_id) ?? {};
    const wb = wordMeta.get(b.word_id) ?? {};
    const aHigh = (wa.concreteness ?? 0) >= 4;
    const bHigh = (wb.concreteness ?? 0) >= 4;
    if (aHigh !== bHigh) return aHigh ? -1 : 1;
    if (aHigh) {
      const cDiff = (wb.concreteness ?? 0) - (wa.concreteness ?? 0);
      if (cDiff !== 0) return cDiff;
      const fa = wa.freq_rank ?? Number.MAX_SAFE_INTEGER;
      const fb = wb.freq_rank ?? Number.MAX_SAFE_INTEGER;
      return fa - fb;
    }
    return (wa.headword ?? "").length - (wb.headword ?? "").length;
  });

  return (dueCards ?? []).concat(sortedNewCards);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} profileId
 * @returns {Promise<Array<DiagnosticItem & {card_id: string, hint_used_forced: boolean}>>}
 *   最多 10 筆。card_id 是這題對應的 cards.id（挫折控制要用來更新 consecutive_wrong/
 *   demoted_to）；hint_used_forced 代表這張卡目前是降級狀態，出題時要顯示提示。
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
      hint_used_forced: Boolean(card.demoted_to),
    });
  }

  return queue;
}
