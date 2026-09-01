// petSvg：B6 只要「靜態貓咪看得到」，但結構先照規劃書 §7.2 分層群組
// （body/face/hat），D 階段做表情切換（換 <g id="face"> 內容）跟配件
// （顯示/隱藏對應的 <g>、或换 <g id="hat"> 內容）時不用重畫整隻。
//
// 這階段只有一種表情（普通/開心，笑臉），<g id="hat">留空但保留節點，
// 之後 D 階段直接塞內容進去就會顯示，不用改這支檔案的結構。

export const PET_SVG_MARKUP = `
<svg viewBox="0 0 200 200" width="120" height="120" role="img" aria-label="貓咪">
  <g id="body">
    <ellipse cx="100" cy="150" rx="55" ry="35" fill="#f0a868" />
    <ellipse cx="70" cy="175" rx="10" ry="8" fill="#f0a868" />
    <ellipse cx="130" cy="175" rx="10" ry="8" fill="#f0a868" />
  </g>
  <g id="head">
    <circle cx="100" cy="95" r="50" fill="#f7bd82" />
    <polygon points="60,60 75,20 85,65" fill="#f7bd82" />
    <polygon points="140,60 125,20 115,65" fill="#f7bd82" />
    <polygon points="66,55 74,32 80,58" fill="#f0a868" />
    <polygon points="134,55 126,32 120,58" fill="#f0a868" />
  </g>
  <g id="face">
    <circle cx="80" cy="95" r="6" fill="#333" />
    <circle cx="120" cy="95" r="6" fill="#333" />
    <ellipse cx="100" cy="112" rx="5" ry="4" fill="#e08a5b" />
    <path d="M100 116 Q90 128 76 122" stroke="#333" stroke-width="2" fill="none" stroke-linecap="round" />
    <path d="M100 116 Q110 128 124 122" stroke="#333" stroke-width="2" fill="none" stroke-linecap="round" />
    <line x1="40" y1="100" x2="70" y2="97" stroke="#333" stroke-width="1.5" />
    <line x1="40" y1="110" x2="70" y2="110" stroke="#333" stroke-width="1.5" />
    <line x1="160" y1="100" x2="130" y2="97" stroke="#333" stroke-width="1.5" />
    <line x1="160" y1="110" x2="130" y2="110" stroke="#333" stroke-width="1.5" />
  </g>
  <g id="hat"></g>
</svg>
`.trim();

export function renderPetInto(container) {
  container.innerHTML = PET_SVG_MARKUP;
}
