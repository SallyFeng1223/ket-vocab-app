// main：膠水層。處理登入、抓 profile、串起 provider → renderer → recorder，
// 管 session 的開始/收尾。這層不會被 W2 沿用，但 provider/renderer/recorder 都會。

import { supabase } from "./supabaseClient.js?v=4";
import { getDiagnosticQueue } from "./provider.js?v=4";
import { startSession, recordAnswer, finishSession, flushPendingAttempts } from "./recorder.js?v=4";
import { runDiagnostic } from "./renderer.js?v=4";

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
  runDiagnosticFlow();
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

async function runDiagnosticFlow() {
  appSection.innerHTML = `<div class="progress">載入中…</div>`;

  try {
    // 開場先試著把上次沒送出去的 attempts 補上
    await flushPendingAttempts(supabase);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("name", "哥哥")
      .single();
    if (profileError) {
      throw new Error(`找不到哥哥的 profile：${profileError.message}`);
    }
    const profileId = profile.id;

    const items = await getDiagnosticQueue(supabase, profileId);

    if (items.length === 0) {
      // 80 題都做完了：不開新 session，直接顯示完成訊息
      appSection.innerHTML = `<div class="done-message">都做完了，謝謝你。</div>`;
      return;
    }

    const sessionId = await startSession(supabase, profileId);

    const onAnswer = (answer) =>
      recordAnswer(supabase, { profileId, sessionId }, answer);

    const summary = await runDiagnostic({ container: appSection, items, onAnswer });

    await finishSession(supabase, sessionId, summary);
  } catch (err) {
    appSection.innerHTML = `<div class="error-message">發生錯誤，請重新整理再試一次。<br>${
      err && err.message ? err.message : String(err)
    }</div>`;
  }
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
