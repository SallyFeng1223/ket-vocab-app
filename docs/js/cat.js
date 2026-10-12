// cat：哥哥的黑貓（凍結例外 X1，取代 B6 的靜態橘貓 petSvg.js）。
// 獎勵層的一部分，跟核心 SRS/出題解耦（規劃書 §7.1）。
//
// 美術資料在 catArt.js（由 scripts/build_cat_art.py 從 assets/cat/ 原稿自動產生）：
//   HEAD  —— head 群組內容，四個姿態共用一份
//   POSES —— 每個姿態各自的 shadow / tail / feet / body / arms 與 headTransform
// 姿態只改 head 的 transform；配件掛在 head 裡的 slot-hat / slot-face / slot-neck，
// 所以一個配件畫一次就適用所有姿態（X1 設計決策，影響 D3）。

import { CAT_STYLE, HEAD, POSES } from "./catArt.js?v=15";

export const POSE_NAMES = Object.keys(POSES);

// 顯示尺寸：寬 120，高依 viewBox 200×280 等比例 = 168（X1 決定用寬度 120 的版本）
const DISPLAY_WIDTH = 120;
const DISPLAY_HEIGHT = 168;

const SLOT_NAMES = ["hat", "face", "neck"];

/**
 * 組出一隻完整的貓 SVG 字串。
 *
 * @param {string} pose - POSE_NAMES 其中之一（sit / stand / wave / tilt）
 * @param {string} mood - 目前只有 'normal'。先保留參數，face 維持原稿；表情切換是
 *   2027-01 階段 G9 的事（X1 範圍不含心情）
 * @param {{hat?: string, face?: string, neck?: string}} [equipped] - 各掛點要放的配件
 *   SVG 片段，座標用 head 的本地座標（錨點：hat (0,-44)、face (0,-4)、neck (0,42)）。
 *   沒給或空字串就留空。片段是程式內建的常數，不是使用者輸入，所以不做跳脫。
 * @returns {string}
 */
export function renderCat(pose, mood = "normal", equipped = {}) {
  const art = POSES[pose];
  if (!art) {
    throw new Error(`renderCat：沒有這個姿態 ${pose}`);
  }

  let head = HEAD;
  for (const slot of SLOT_NAMES) {
    const fragment = equipped?.[slot];
    if (fragment) {
      head = head.replace(`<g id="cat-slot-${slot}"/>`, `<g id="cat-slot-${slot}">${fragment}</g>`);
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280" ` +
    `width="${DISPLAY_WIDTH}" height="${DISPLAY_HEIGHT}" role="img" aria-label="貓咪">` +
    `<defs><style>${CAT_STYLE}</style></defs>` +
    `<g id="cat-cat" data-pose="${pose}" data-mood="${mood}">` +
    art.shadow +
    art.tail +
    art.feet +
    art.body +
    art.arms +
    `<g id="cat-head" transform="${art.headTransform}">${head}</g>` +
    `</g></svg>`
  );
}

function lastPoseKey(profileId) {
  return `catLastPose:${profileId}`;
}

/**
 * 進入主畫面時抽一個姿態：隨機、但不跟這個 profile 上一次相同。上一次的
 * 姿態存在 localStorage（key 依 profile 分開）。localStorage 讀寫一律包
 * try/catch——iPad Safari 私密瀏覽或被清掉時讀不到，就當作沒有上一次。
 *
 * @param {string} profileId
 * @returns {string} 姿態名稱
 */
export function pickPose(profileId) {
  let last = null;
  try {
    last = localStorage.getItem(lastPoseKey(profileId));
  } catch {
    last = null;
  }

  const choices = POSE_NAMES.filter((p) => p !== last);
  const pose = choices[Math.floor(Math.random() * choices.length)];

  try {
    localStorage.setItem(lastPoseKey(profileId), pose);
  } catch {
    // 存不起來也不影響顯示，下次就當作沒有上一次
  }
  return pose;
}
