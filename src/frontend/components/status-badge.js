export function statusBadge(label, tone = 'default') {
  const safe = String(label).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  return `<span class="status-pill ${tone}" aria-label="Status: ${safe}">${safe}</span>`;
}
