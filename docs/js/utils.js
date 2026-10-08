// §5.5 挫折控制：降級後出的題目改用低一階 skill。provider（選卡時查有沒有對應
// 題目）跟 recorder（決定 consecutive_wrong>=3 時要降到哪一階）都要用同一份對照表。
export const SKILL_DEMOTE_MAP = { L1: "L0", L2: "L1" };

// 「今天」用台北時區（UTC+8）算，跟小孩實際感受的一天對齊。
// rewards.js 裡有一份一樣的私有副本（B6 寫的）；凍結前不去動已經在跑的金幣
// 模組，所以那份先不改成 import 這裡，G 階段再合併。
export function taipeiDateKey(date) {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export function taipeiDayStartIso(dateKey) {
  return new Date(Date.parse(`${dateKey}T00:00:00+08:00`)).toISOString();
}

export function shuffle(array) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
