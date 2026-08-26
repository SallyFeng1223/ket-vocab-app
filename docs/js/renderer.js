// renderer：顯示題目、接收點選、判分。不碰資料庫——判完分後只呼叫 onAnswer
// 這個回呼，資料要交給誰、要不要順便更新 SRS 卡片，是 main.js 決定的事。
//
// 目前認得 L0（英→中四選一）、L1（辨形三選一）、L2（字母磚）三種 payload 形狀。
// 之後 L3–L6 上線時，在 buildChoicesForItem() / showItemAndCollectAnswer() 依
// item.skill 加對應分支即可，其他部分不用動。

import { shuffle, escapeHtml } from "./utils.js?v=5";

function buildChoicesForItem(item) {
  if (item.skill === "L0") {
    return shuffle([item.answer, ...item.payload.distractors_zh]);
  }
  if (item.skill === "L1") {
    return shuffle([item.answer, ...item.payload.wrong_spellings]);
  }
  throw new Error(`buildChoicesForItem 不支援 skill=${item.skill}`);
}

// L0（四選一）、L1（三選一）互動完全相同：顯示題幹＋按鈕，點一下就判分。
// showHint：§5.5 降級後出題要顯示提示，這裡用「開頭是哪個字母」當提示——
// L3 首字母提示題型還沒做，先用這個最簡單的形式頂著，不用為了一個提示新開題型。
function showChoiceItemAndWaitForAnswer(container, item, choices, index, total, showHint) {
  return new Promise((resolve) => {
    const hintHtml = showHint
      ? `<div class="hint">提示：開頭是「${escapeHtml(item.answer[0])}」</div>`
      : "";
    container.innerHTML = `
      <div class="progress">第 ${index} / ${total} 題</div>
      <div class="prompt">${escapeHtml(item.prompt)}</div>
      ${hintHtml}
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

// L2（字母磚）：點擊組字，不用拖曳（iPad 上拖曳對小三容易失敗）。
// tiles 跟 extra_tiles 合併後「再洗牌一次」才顯示——如果直接把 extra_tiles
// 接在 tiles 後面，最後 2–3 塊的位置永遠是假字母，玩幾次就會被看出規律。
function showTileItemAndWaitForAnswer(container, item, index, total, _showHint) {
  return new Promise((resolve) => {
    const pool = shuffle([...item.payload.tiles, ...item.payload.extra_tiles]);
    const targetLength = item.payload.tiles.length;
    const used = pool.map(() => false);
    let answerIndices = [];
    let submitted = false;
    let shownAt = 0;

    container.innerHTML = `
      <div class="progress">第 ${index} / ${total} 題</div>
      <div class="prompt">${escapeHtml(item.prompt)}</div>
      <div class="answer-area"></div>
      <div class="tile-pool"></div>
      <div class="tile-controls">
        <button type="button" class="tile-control-btn clear-btn">清除</button>
        <button type="button" class="tile-control-btn submit-btn">完成</button>
      </div>
    `;

    const answerEl = container.querySelector(".answer-area");
    const poolEl = container.querySelector(".tile-pool");
    const clearBtn = container.querySelector(".clear-btn");
    const submitBtn = container.querySelector(".submit-btn");

    function renderAnswerArea() {
      answerEl.innerHTML = "";
      answerIndices.forEach((poolIdx, slot) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tile-btn answer-tile";
        btn.textContent = pool[poolIdx];
        btn.addEventListener("click", () => {
          if (submitted) return;
          answerIndices = answerIndices.filter((_, i) => i !== slot);
          used[poolIdx] = false;
          renderAnswerArea();
          renderPool();
        });
        answerEl.appendChild(btn);
      });
    }

    function renderPool() {
      poolEl.innerHTML = "";
      pool.forEach((letter, poolIdx) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tile-btn pool-tile";
        btn.textContent = letter;
        btn.disabled = used[poolIdx];
        btn.addEventListener("click", () => {
          if (submitted || used[poolIdx]) return;
          used[poolIdx] = true;
          answerIndices.push(poolIdx);
          renderAnswerArea();
          renderPool();
          if (answerIndices.length === targetLength) {
            submit();
          }
        });
        poolEl.appendChild(btn);
      });
    }

    function submit() {
      if (submitted) return;
      submitted = true;
      const chosen = answerIndices.map((i) => pool[i]).join("");
      const response_ms = Math.round(performance.now() - shownAt);
      resolve({ chosen, response_ms });
    }

    clearBtn.addEventListener("click", () => {
      if (submitted) return;
      answerIndices = [];
      used.fill(false);
      renderAnswerArea();
      renderPool();
    });

    submitBtn.addEventListener("click", submit);

    // 從畫面實際畫出來那一刻開始算反應時間，磚塊也是這時候才畫出來、
    // 才能點——跟 L0/L1 的量測基準一致
    requestAnimationFrame(() => {
      shownAt = performance.now();
      renderAnswerArea();
      renderPool();
    });
  });
}

function showItemAndCollectAnswer(container, item, index, total) {
  // item.hint_used_forced：daily provider 標記這張卡目前是降級狀態（見 provider.js
  // getDailyQueue）。診斷模式的 item 沒有這個欄位，undefined 視同 false。
  const showHint = Boolean(item.hint_used_forced);
  if (item.skill === "L0" || item.skill === "L1") {
    const choices = buildChoicesForItem(item);
    return showChoiceItemAndWaitForAnswer(container, item, choices, index, total, showHint);
  }
  if (item.skill === "L2") {
    // L2 從沒被降級進來過（demote map 只有 L1→L0、L2→L1），showHint 這裡用不到，
    // 但還是把旗標傳進去，之後如果 demote map 改了不用回頭找這裡漏改。
    return showTileItemAndWaitForAnswer(container, item, index, total, showHint);
  }
  throw new Error(`renderer 目前還不支援 skill=${item.skill}`);
}

// L2 的 tiles 全部是小寫（B0 的決定，避免大寫磚塊洩漏正確字母），但
// items.answer 保留原始大小寫（例如 April），所以 L2 判分必須忽略大小寫。
// L0/L1 的選項本來就跟 answer 同一個大小寫來源，用精確比對即可。
function isCorrectAnswer(item, chosen) {
  if (item.skill === "L2") {
    return chosen.toLowerCase() === item.answer.toLowerCase();
  }
  return chosen === item.answer;
}

/**
 * 跑一輪題目（診斷模式跟日常模式共用，見規劃書 §2.2——差別只在 provider
 * 給的是固定 80 題清單還是 SRS 排出來的 10 題，這支函式不需要知道差在哪）。
 *
 * @param {Object} args
 * @param {HTMLElement} args.container
 * @param {import('./provider.js').DiagnosticItem[]} args.items
 * @param {(a: {item: import('./provider.js').DiagnosticItem, chosen: string, is_correct: boolean, response_ms: number, hint_used: boolean}) => Promise<void>} args.onAnswer
 * @returns {Promise<{itemCount: number, correctCount: number}>}
 */
export async function runRound({ container, items, onAnswer }) {
  let correctCount = 0;
  const total = items.length;

  for (let i = 0; i < total; i++) {
    const item = items[i];
    const { chosen, response_ms } = await showItemAndCollectAnswer(
      container,
      item,
      i + 1,
      total
    );
    const is_correct = isCorrectAnswer(item, chosen);
    if (is_correct) correctCount++;

    await onAnswer({
      item,
      chosen,
      is_correct,
      response_ms,
      hint_used: Boolean(item.hint_used_forced),
    });
  }

  container.innerHTML = `<div class="done-message">做完了，謝謝你。</div>`;

  return { itemCount: total, correctCount };
}
