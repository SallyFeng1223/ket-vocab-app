// renderer：顯示題目、接收點選、判分。不碰資料庫——判完分後只呼叫 onAnswer
// 這個回呼，資料要交給誰、要不要順便更新 SRS 卡片，是 main.js 決定的事。
//
// 目前只認得 L0（英→中四選一）的 payload 形狀。之後 L1–L6 上線時，
// 在 buildChoicesForItem() 依 item.skill 加對應分支即可，其他部分不用動。

import { shuffle, escapeHtml } from "./utils.js";

function buildChoicesForItem(item) {
  if (item.skill === "L0") {
    return shuffle([item.answer, ...item.payload.distractors_zh]);
  }
  throw new Error(`renderer 目前還不支援 skill=${item.skill}`);
}

function showItemAndWaitForAnswer(container, item, choices, index, total) {
  return new Promise((resolve) => {
    container.innerHTML = `
      <div class="progress">第 ${index} / ${total} 題</div>
      <div class="prompt">${escapeHtml(item.prompt)}</div>
      <div class="choices"></div>
    `;
    const choicesEl = container.querySelector(".choices");
    const buttons = choices.map((text) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn";
      btn.textContent = text;
      choicesEl.appendChild(btn);
      return btn;
    });

    // 從畫面實際畫出來那一刻開始算反應時間，不算撈資料/渲染前的時間
    requestAnimationFrame(() => {
      const shownAt = performance.now();
      buttons.forEach((btn, idx) => {
        btn.addEventListener("click", () => {
          if (btn.disabled) return;
          buttons.forEach((b) => (b.disabled = true));
          const response_ms = Math.round(performance.now() - shownAt);
          resolve({ chosen: choices[idx], response_ms });
        });
      });
    });
  });
}

/**
 * @param {Object} args
 * @param {HTMLElement} args.container
 * @param {import('./provider.js').DiagnosticItem[]} args.items
 * @param {(a: {item: import('./provider.js').DiagnosticItem, chosen: string, is_correct: boolean, response_ms: number, hint_used: boolean}) => Promise<void>} args.onAnswer
 * @returns {Promise<{itemCount: number, correctCount: number}>}
 */
export async function runDiagnostic({ container, items, onAnswer }) {
  let correctCount = 0;
  const total = items.length;

  for (let i = 0; i < total; i++) {
    const item = items[i];
    const choices = buildChoicesForItem(item);
    const { chosen, response_ms } = await showItemAndWaitForAnswer(
      container,
      item,
      choices,
      i + 1,
      total
    );
    const is_correct = chosen === item.answer;
    if (is_correct) correctCount++;

    await onAnswer({ item, chosen, is_correct, response_ms, hint_used: false });
  }

  container.innerHTML = `<div class="done-message">做完了，謝謝你。</div>`;

  return { itemCount: total, correctCount };
}
