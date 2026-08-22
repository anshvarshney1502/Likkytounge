// PLACEHOLDER Pikachu artwork. Swap this out the moment the real provided
// image is available: replace this SVG string with
//   `<img src="${chrome.runtime.getURL('pikachu.png')}" alt="Pikachu">`
// and drop the file at public/pikachu.png — no other changes needed, the
// launcher button, hover/click states, and Thunderbolt animation all target
// `.lk-pikachu` regardless of what's inside it.
export const PIKACHU_SVG = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="30" cy="22" rx="9" ry="20" fill="#2b2b2b" transform="rotate(-18 30 22)"/>
  <ellipse cx="70" cy="22" rx="9" ry="20" fill="#2b2b2b" transform="rotate(18 70 22)"/>
  <ellipse cx="30" cy="26" rx="4.5" ry="11" fill="#f5c518" transform="rotate(-18 30 26)"/>
  <ellipse cx="70" cy="26" rx="4.5" ry="11" fill="#f5c518" transform="rotate(18 70 26)"/>
  <circle cx="50" cy="55" r="34" fill="#f5c518"/>
  <ellipse cx="24" cy="60" rx="8" ry="6.5" fill="#e0392b"/>
  <ellipse cx="76" cy="60" rx="8" ry="6.5" fill="#e0392b"/>
  <circle cx="38" cy="50" r="4.2" fill="#1a1a1a"/>
  <circle cx="62" cy="50" r="4.2" fill="#1a1a1a"/>
  <circle cx="39.3" cy="48.5" r="1.1" fill="#fff"/>
  <circle cx="63.3" cy="48.5" r="1.1" fill="#fff"/>
  <path d="M44 62 Q50 68 56 62" stroke="#1a1a1a" stroke-width="2.4" fill="none" stroke-linecap="round"/>
</svg>`;
