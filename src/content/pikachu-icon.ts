// PLACEHOLDER Pikachu artwork. Swap this out the moment the real provided
// image is available: replace this SVG string with
//   `<img src="${chrome.runtime.getURL('pikachu.png')}" alt="Pikachu">`
// and drop the file at public/pikachu.png — no other changes needed, the
// launcher button, hover/click states, and Thunderbolt animation all target
// `.lk-pikachu` regardless of what's inside it.
export const PIKACHU_SVG = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="lk-face" cx="38%" cy="32%" r="75%">
      <stop offset="0%" stop-color="#fff6d0"/>
      <stop offset="55%" stop-color="#ffd93d"/>
      <stop offset="100%" stop-color="#f3b800"/>
    </radialGradient>
    <linearGradient id="lk-ear" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3a3a3a"/>
      <stop offset="100%" stop-color="#141414"/>
    </linearGradient>
    <radialGradient id="lk-earIn" cx="50%" cy="30%" r="80%">
      <stop offset="0%" stop-color="#ffe36b"/>
      <stop offset="100%" stop-color="#f3b800"/>
    </radialGradient>
  </defs>

  <!-- ears -->
  <path d="M27 30 C14 16 10 2 12 1 C22 -2 34 12 39 26 Z" fill="url(#lk-ear)" transform="rotate(-6 25 20)"/>
  <path d="M73 30 C86 16 90 2 88 1 C78 -2 66 12 61 26 Z" fill="url(#lk-ear)" transform="rotate(6 75 20)"/>
  <path d="M29.5 27 C21 17 18 7 19 6 C26 4 34 14 37.5 24 Z" fill="url(#lk-earIn)" transform="rotate(-6 25 20)"/>
  <path d="M70.5 27 C79 17 82 7 81 6 C74 4 66 14 62.5 24 Z" fill="url(#lk-earIn)" transform="rotate(6 75 20)"/>

  <!-- face -->
  <circle cx="50" cy="56" r="35" fill="url(#lk-face)"/>

  <!-- cheeks -->
  <ellipse cx="21" cy="61" rx="9" ry="7.2" fill="#ef4136"/>
  <ellipse cx="79" cy="61" rx="9" ry="7.2" fill="#ef4136"/>
  <ellipse cx="18.5" cy="58.5" rx="2.6" ry="2" fill="#ff8a7a" opacity="0.7"/>
  <ellipse cx="81.5" cy="58.5" rx="2.6" ry="2" fill="#ff8a7a" opacity="0.7"/>

  <!-- eyes -->
  <ellipse cx="37" cy="51" rx="4.6" ry="5.6" fill="#171310"/>
  <ellipse cx="63" cy="51" rx="4.6" ry="5.6" fill="#171310"/>
  <circle cx="38.6" cy="48.3" r="1.5" fill="#fff"/>
  <circle cx="64.6" cy="48.3" r="1.5" fill="#fff"/>

  <!-- nose + mouth -->
  <path d="M47.3 60.5 Q50 62.3 52.7 60.5" stroke="#171310" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  <path d="M42 65 Q50 72 58 65" stroke="#171310" stroke-width="2.2" fill="none" stroke-linecap="round"/>

  <!-- brow hints -->
  <path d="M31 43 Q37 39 43 43" stroke="#c98f00" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.55"/>
  <path d="M57 43 Q63 39 69 43" stroke="#c98f00" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.55"/>
</svg>`;
