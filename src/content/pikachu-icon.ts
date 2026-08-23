// The launcher artwork. Bundled as a web-accessible resource (see
// manifest.json) so the content script can reference it on any host page.
export function pikachuImgTag(): string {
  const url = chrome.runtime.getURL("pikachu.png");
  return `<img class="lk-pika-img" src="${url}" alt="" draggable="false">`;
}
