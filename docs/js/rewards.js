// rewards：獎勵模組（規劃書 §7，刻意跟核心 SRS/出題解耦，之後換主題不動 provider/
// renderer/recorder）。只有日常模式（session_type='daily'）結束後呼叫，診斷模式
// 不給金幣。
//
// 金幣綁「正確率 + 連續天數」，不綁作答量（§7.1）：
//   - 每輪依正確率給金幣
//   - 連續天數獎勵，每天只發一次（當天第一輪完成時）
//   - 「今日目標達成」（完成 DAILY_GOAL_ROUNDS 輪）給一次性大獎
//   - 每日金幣上限存 app_settings（daily_coin_cap），不寫死——缺這筆設定就丟錯，
//     不在程式裡塞預設值後就不管（跟 B2 出題配比同樣的原則）
//
// 下面四個數字是 Claude 先定的暫定值，不是規劃書給的精確數字，需要你實際玩過
// 之後依小孩的感受調整：
const ROUND_COIN_BASE = 10; // 正確率 100% 這一輪拿到的金幣
const STREAK_BONUS_PER_DAY = 5; // 連續天數獎勵，每天只發一次
const DAILY_GOAL_ROUNDS = 3; // 今日目標＝完成 3 輪（跟 §5.4/B7 用的「3輪×10題」算法一致）
const DAILY_GOAL_BONUS = 20; // 達成今日目標的一次性大獎

function taipeiDateKey(date) {
  // 用台北時區（UTC+8）算「今天」，避免用 UTC 日期在台北時間早上 8 點前就換日，
  // 造成連續天數/今日目標判斷跟小孩實際感受的「今天」對不上。
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function addDaysToDateKey(dateKey, days) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function taipeiDayRangeUtc(dateKey) {
  const startMs = Date.parse(`${dateKey}T00:00:00+08:00`);
  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(startMs + 24 * 60 * 60 * 1000).toISOString(),
  };
}

async function getDailyCoinCap(supabase) {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "daily_coin_cap")
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      "找不到 app_settings.daily_coin_cap，請先貼 data/sql/B6_app_settings.sql 建立這筆設定"
    );
  }
  return Number(data.value);
}

/**
 * 一輪日常模式結束、`finishSession` 之後呼叫。依正確率算這輪金幣，視情況加
 * 連續天數獎勵和今日目標達成獎勵，寫回 wallet 和 daily_stats，回傳這次實際
 * 入帳的金幣數（給結算畫面顯示；可能因為每日上限而低於算出來的原始值）。
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} profileId
 * @param {{itemCount: number, correctCount: number}} summary
 * @returns {Promise<number>}
 */
export async function updateWalletAfterSession(supabase, profileId, { itemCount, correctCount }) {
  const cap = await getDailyCoinCap(supabase);

  const accuracy = itemCount > 0 ? correctCount / itemCount : 0;
  const roundCoins = Math.round(accuracy * ROUND_COIN_BASE);

  const todayKey = taipeiDateKey(new Date());
  const yesterdayKey = addDaysToDateKey(todayKey, -1);

  const { data: todayStats, error: todayError } = await supabase
    .from("daily_stats")
    .select("items_done, correct, coins_earned, streak_day, target_met")
    .eq("profile_id", profileId)
    .eq("date", todayKey)
    .maybeSingle();

  if (todayError) {
    console.warn(`讀今日 daily_stats 失敗：${todayError.message}`);
  }

  const isFirstSessionToday = !todayStats;

  let streakDay = todayStats?.streak_day ?? 1;
  if (isFirstSessionToday) {
    const { data: yesterdayStats } = await supabase
      .from("daily_stats")
      .select("streak_day")
      .eq("profile_id", profileId)
      .eq("date", yesterdayKey)
      .maybeSingle();
    streakDay = (yesterdayStats?.streak_day ?? 0) + 1;
  }

  // 這一輪的 finishSession 已經先跑過，這裡查到的「今天完成的輪數」含這一輪。
  const { startIso, endIso } = taipeiDayRangeUtc(todayKey);
  const { data: todaySessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("id")
    .eq("profile_id", profileId)
    .eq("session_type", "daily")
    .eq("completed", true)
    .gte("started_at", startIso)
    .lt("started_at", endIso);

  if (sessionsError) {
    console.warn(`讀今日 session 數失敗：${sessionsError.message}`);
  }
  const roundsToday = (todaySessions ?? []).length;

  const alreadyMetGoal = todayStats?.target_met ?? false;
  const justMetGoal = !alreadyMetGoal && roundsToday >= DAILY_GOAL_ROUNDS;

  const streakBonus = isFirstSessionToday ? STREAK_BONUS_PER_DAY : 0;
  const goalBonus = justMetGoal ? DAILY_GOAL_BONUS : 0;
  const rawCoins = roundCoins + streakBonus + goalBonus;

  const coinsEarnedTodaySoFar = todayStats?.coins_earned ?? 0;
  const coinsToAdd = Math.max(0, Math.min(rawCoins, cap - coinsEarnedTodaySoFar));

  const { error: upsertError } = await supabase.from("daily_stats").upsert(
    {
      profile_id: profileId,
      date: todayKey,
      items_done: (todayStats?.items_done ?? 0) + itemCount,
      correct: (todayStats?.correct ?? 0) + correctCount,
      coins_earned: coinsEarnedTodaySoFar + coinsToAdd,
      streak_day: streakDay,
      target_met: alreadyMetGoal || justMetGoal,
    },
    { onConflict: "profile_id,date" }
  );

  if (upsertError) {
    console.warn(`更新 daily_stats 失敗：${upsertError.message}`);
  }

  if (coinsToAdd > 0) {
    const { data: wallet, error: walletFetchError } = await supabase
      .from("wallet")
      .select("coins")
      .eq("profile_id", profileId)
      .maybeSingle();

    if (walletFetchError) {
      console.warn(`讀 wallet 失敗：${walletFetchError.message}`);
    } else {
      const { error: walletUpsertError } = await supabase.from("wallet").upsert(
        {
          profile_id: profileId,
          coins: (wallet?.coins ?? 0) + coinsToAdd,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" }
      );
      if (walletUpsertError) {
        console.warn(`寫 wallet 失敗：${walletUpsertError.message}`);
      }
    }
  }

  return coinsToAdd;
}

/**
 * 顯示用：目前錢包總金幣。讀不到（例如還沒有任何 wallet 記錄）就當 0。
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} profileId
 * @returns {Promise<number>}
 */
export async function getWalletCoins(supabase, profileId) {
  const { data, error } = await supabase
    .from("wallet")
    .select("coins")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) {
    console.warn(`讀 wallet 失敗：${error.message}`);
    return 0;
  }
  return data?.coins ?? 0;
}
