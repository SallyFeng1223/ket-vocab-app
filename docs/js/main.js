// main：膠水層。處理登入、抓 profile、串起 provider → renderer → recorder，
// 管 session 的開始/收尾、模式切換（診斷 → 日常）。這層不會被 W2 沿用，
// 但 provider/renderer/recorder 都會。

import { supabase } from "./supabaseClient.js?v=7";
import { getDiagnosticQueue, getDailyQueue } from "./provider.js?v=7";
import {
  startSession,
  recordAnswer,
  finishSession,
  flushPendingAttempts,
  updateCardAfterAnswer,
} from "./recorder.js?v=7";
import { runRound } from "./renderer.js?v=7";

const loginSection = document.getElementById("login-section");
const appSection = document.getElementById("app-section");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");

function showLogin() {
  loginSection.style.display = "block";
  appSection.style.display = "none";
}

function showApp() {
  loginSection.style.display = "none";
  appSection.style.display = "block";
  runAppFlow();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    loginError.textContent = `登入失敗：${error.message}`;
    return;
  }
  showApp();
});

async function getProfileId() {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("name", "哥哥")
    .single();
  if (error) {
    throw new Error(`找不到哥哥的 profile：${error.message}`);
  }
  return profile.id;
}

function showErrorMessage(err) {
  appSection.innerHTML = `<div class="error-message">發生錯誤，請重新整理再試一次。<br>${
    err && err.message ? err.message : String(err)
  }</div>`;
}

// 80 題診斷做完之前先跑診斷；診斷做完了自動轉進日常模式（cards 由 B7 用
// 診斷結果初始化好了，日常模式撈得到卡）。
async function runAppFlow() {
  appSection.innerHTML = `<div class="progress">載入中…</div>`;

  try {
    // 開場先試著把上次沒送出去的 attempts 補上
    await flushPendingAttempts(supabase);

    const profileId = await getProfileId();

    const diagnosticItems = await getDiagnosticQueue(supabase, profileId);
    if (diagnosticItems.length > 0) {
      await runDiagnosticSession(profileId, diagnosticItems);
      return;
    }

    await runDailySession(profileId);
  } catch (err) {
    showErrorMessage(err);
  }
}

async function runDiagnosticSession(profileId, items) {
  const sessionId = await startSession(supabase, profileId, "diagnostic");

  const onAnswer = (answer) => recordAnswer(supabase, { profileId, sessionId }, answer);

  const summary = await runRound({ container: appSection, items, onAnswer });

  await finishSession(supabase, sessionId, summary);
}

async function runDailySession(profileId) {
  const items = await getDailyQueue(supabase, profileId);

  if (items.length === 0) {
    // 沒有到期或新字可出：不開新 session，直接顯示訊息
    appSection.innerHTML = `<div class="done-message">今天沒有新題目了，明天再來。</div>`;
    return;
  }

  const sessionId = await startSession(supabase, profileId, "daily");

  const onAnswer = async (answer) => {
    await recordAnswer(supabase, { profileId, sessionId }, answer);
    // §5.5 挫折控制（consecutive_wrong/demoted_to）。完整 SRS（stability/difficulty/
    // due_at）是 B2 的事，這裡先只更新這兩個欄位。
    await updateCardAfterAnswer(supabase, answer.item.card_id, answer.is_correct);
  };

  const summary = await runRound({ container: appSection, items, onAnswer });

  await finishSession(supabase, sessionId, summary);

  // 結算畫面：本輪答對幾題、獲得金幣。金幣是 B6 才做，這裡先顯示 0，
  // 不顯示正確率百分比（規劃書 §8.1：完成度不用「答對次數 ÷ 總數」）。
  appSection.innerHTML = `
    <div class="summary">
      <div class="summary-line">這一輪答對 ${summary.correctCount} / ${summary.itemCount} 題</div>
      <div class="summary-line">獲得金幣：0</div>
    </div>
  `;
}

async function main() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) {
    showApp();
  } else {
    showLogin();
  }
}

main();
