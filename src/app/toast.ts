let hideTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string, isError = false): void {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.style.background = isError ? "var(--err)" : "var(--ink)";
  el.classList.add("show");
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => el.classList.remove("show"), 2400);
}
