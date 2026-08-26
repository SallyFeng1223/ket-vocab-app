// §5.5 挫折控制：降級後出的題目改用低一階 skill。provider（選卡時查有沒有對應
// 題目）跟 recorder（決定 consecutive_wrong>=3 時要降到哪一階）都要用同一份對照表。
export const SKILL_DEMOTE_MAP = { L1: "L0", L2: "L1" };

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
