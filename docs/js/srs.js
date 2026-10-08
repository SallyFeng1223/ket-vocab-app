// srs：FSRS 排程（規劃書 §6）。只做計算，不寫資料庫——寫入集中在 recorder.js。
//
// 演算法用 ts-fsrs 套件，不手寫 FSRS 公式。參數全用預設值，只有一個例外：
// enable_short_term = false。ts-fsrs 預設會讓新卡在 1 分鐘、10 分鐘後重考，
// 靠 learning_steps 欄位記住走到第幾步，但 cards 表沒有這個欄位（§4.2 定稿
// schema），存不起來就會在學習階段打轉。關掉之後最短間隔是 1 天，答錯的卡
// 最快明天出——以每週 3 天的使用頻率來說影響不大（B2 計畫已確認）。
//
// cards 表的欄位兩種演算法通用：如果 FSRS 卡關要退回簡化 SM-2，只換這支檔案。

import { fsrs, generatorParameters, Rating, State } from "https://esm.sh/ts-fsrs@5.4.2";
import { getAppSetting } from "./settings.js?v=12";

const scheduler = fsrs(generatorParameters({ enable_short_term: false }));

// 反應時間評分用：每個題型取最近這麼多筆「答對、沒用提示」的作答算中位數
const MEDIAN_SAMPLE_SIZE = 200;
// 樣本少於這個數字時中位數不可靠，答對一律給 Good、不看反應時間
const MEDIAN_MIN_SAMPLES = 20;
const SLOW_FACTOR = 1.5; // 比中位數慢 1.5 倍以上 → Hard
const FAST_FACTOR = 0.5; // 比中位數快一半以上 → Easy（只限 L2，見 rateAnswer）
const TIMED_SKILLS = ["L0", "L1", "L2"];

// cards.state 存文字（§4.2），ts-fsrs 用數字列舉，兩邊對照
const STATE_TO_FSRS = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};
const STATE_FROM_FSRS = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
};

function median(numbers) {
  const sorted = numbers.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 每個題型最近的反應時間中位數。樣本不足的題型回傳 null（rateAnswer 看到
 * null 就不用時間判斷）。一輪開始前算一次就好，不用每題重算。
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} profileId
 * @returns {Promise<Record<string, number|null>>} 例 { L0: 2100, L1: 3400, L2: null }
 */
export async function loadResponseMedians(supabase, profileId) {
  const medians = {};
  for (const skill of TIMED_SKILLS) {
    const { data, error } = await supabase
      .from("attempts")
      .select("response_ms")
      .eq("profile_id", profileId)
      .eq("skill", skill)
      .eq("is_correct", true)
      .eq("hint_used", false)
      .not("response_ms", "is", null)
      .order("created_at", { ascending: false })
      .limit(MEDIAN_SAMPLE_SIZE);

    if (error) {
      throw new Error(`撈 ${skill} 反應時間失敗：${error.message}`);
    }
    const samples = (data ?? []).map((r) => r.response_ms);
    medians[skill] = samples.length >= MEDIAN_MIN_SAMPLES ? median(samples) : null;
  }
  return medians;
}

/**
 * 一輪日常模式需要的 SRS 相關資料，開局載入一次，傳給每一題的
 * updateCardAfterAnswer，避免每題都回頭查資料庫。
 *
 * @returns {Promise<{medians: Record<string, number|null>, demoteThreshold: {consecutive_wrong: number, promote_back_after: number}, promotion: {required_state: string, min_stability_days: number}}>}
 */
export async function loadSrsContext(supabase, profileId) {
  const [medians, demoteThreshold, promotion] = await Promise.all([
    loadResponseMedians(supabase, profileId),
    getAppSetting(supabase, "demote_threshold"),
    getAppSetting(supabase, "promotion"),
  ]);
  return { medians, demoteThreshold, promotion };
}

// §5.2 晉級順序。目前只開 L1 → L2：L3/L4 題型還沒做（2027-01 階段 G2），
// 晉級過去也沒有題目可出。L0 → L1 不需要——B7 已經幫每個有 L1 題目的字都建好
// L1 卡（L0 認字已達 96%，L1 是起點）。
const PROMOTE_TO = { L1: "L2" };

/**
 * §5.2：卡片達到 promotion.required_state 且 stability 超過
 * promotion.min_stability_days（app_settings.promotion，目前 review / 7 天）
 * 時，回傳要建立的下一個 skill；不符合回傳 null。
 *
 * L1 連續兩次 Good 大約就會超過 7 天（B2-1 實測 stability 13.8）。三選一
 * 連猜對兩次的機率約 11%，會有少數字誤晉級，但晉級只是多建一張 L2 卡，L1 卡
 * 仍在複習軌道上；L2 字母磚猜不出來，真不會就會連錯觸發降級——L2 本身就是
 * 驗證關卡（B2 已確認，不調門檻）。
 *
 * @param {string} skill - 卡片本身的 skill（不是降級後出的題型）
 * @param {{state: string, stability: number} | null} scheduled - scheduleCard 的回傳值
 * @param {{required_state: string, min_stability_days: number}} promotion
 * @returns {string | null}
 */
export function nextSkillToPromote(skill, scheduled, promotion) {
  const next = PROMOTE_TO[skill];
  if (!next || !scheduled) return null;
  if (scheduled.state !== promotion.required_state) return null;
  if (scheduled.stability < promotion.min_stability_days) return null;
  return next;
}

/**
 * 作答結果 → FSRS 評分（B2 規格）：
 *   答錯                              → Again
 *   答對、用了提示                    → Hard
 *   答對、反應時間 > 中位數 × 1.5     → Hard
 *   答對、反應時間 < 中位數 × 0.5     → Easy（只限 L2）
 *   答對、其他                        → Good
 *
 * Easy 只給 L2：L1 是三選一，亂猜有 33% 命中率而且猜得快，一次幸運快答被評
 * Easy，FSRS 會把間隔拉到好幾週、那個字就消失了。L2 字母磚沒有猜中的可能，
 * 快就是真的會。L0 同理是四選一，也不給 Easy。
 *
 * @param {{skill: string, isCorrect: boolean, hintUsed: boolean, responseMs: number}} answer
 *   skill 是這題實際出的題型（降級時是低一階的那個）
 * @param {Record<string, number|null>} medians
 * @returns {number} ts-fsrs 的 Rating
 */
export function rateAnswer({ skill, isCorrect, hintUsed, responseMs }, medians) {
  if (!isCorrect) return Rating.Again;
  if (hintUsed) return Rating.Hard;

  const m = medians?.[skill];
  if (m == null || responseMs == null) return Rating.Good;

  if (responseMs > m * SLOW_FACTOR) return Rating.Hard;
  if (skill === "L2" && responseMs < m * FAST_FACTOR) return Rating.Easy;
  return Rating.Good;
}

/**
 * 算出這張卡答完之後的 FSRS 新狀態。
 *
 * reps / lapses 不用 ts-fsrs 回傳的版本，由 recorder 自己維護：ts-fsrs 的
 * lapses 只在「複習卡答錯」時 +1，但易錯加權桶要的是「每次答錯都 +1」的
 * 累計數（見 recorder.js 註解）。這兩個欄位不影響 FSRS 的間隔計算。
 *
 * 逾期很久的卡不特殊處理：ts-fsrs 會用 last_review 到 now 的實際天數計算。
 *
 * @param {{state: string, stability: number|null, difficulty: number|null, due_at: string|null, last_review_at: string|null}} card
 *   cards 表的一列
 * @param {number} rating - rateAnswer 的回傳值
 * @param {Date} now
 * @returns {{state: string, stability: number, difficulty: number, due_at: string} | null}
 *   卡片資料不完整、算不出來時回傳 null（呼叫端只更新計數欄位，不動排程欄位）
 */
export function scheduleCard(card, rating, now) {
  const fsrsState = STATE_TO_FSRS[card.state] ?? State.New;

  // 非新卡一定要有 stability / difficulty / last_review_at，否則 ts-fsrs 會算出 NaN。
  // B7 建的 L0 卡原本缺 difficulty 與 last_review_at，B2_1_cards_fsrs_backfill.sql 補齊；
  // 這裡是保險，萬一還有漏網的卡，寧可這次不排程也不要把 NaN 寫進資料庫。
  if (
    fsrsState !== State.New &&
    (card.stability == null || card.difficulty == null || card.last_review_at == null)
  ) {
    console.warn("FSRS：卡片缺 stability/difficulty/last_review_at，這次不排程", card);
    return null;
  }

  const input = {
    state: fsrsState,
    due: card.due_at ? new Date(card.due_at) : now,
    stability: card.stability ?? 0,
    difficulty: card.difficulty ?? 0,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 0,
    lapses: 0,
    last_review: card.last_review_at ? new Date(card.last_review_at) : undefined,
  };

  const { card: next } = scheduler.next(input, now, rating);

  if (!Number.isFinite(next.stability) || !Number.isFinite(next.difficulty)) {
    console.warn("FSRS：算出非有限數值，這次不排程", card, next);
    return null;
  }

  return {
    state: STATE_FROM_FSRS[next.state],
    stability: next.stability,
    difficulty: next.difficulty,
    due_at: next.due.toISOString(),
  };
}
