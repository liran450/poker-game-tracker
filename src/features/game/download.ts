/**
 * Triggers a browser file download for a JSON-serializable value — the export feature's one DOM
 * touch (08-gaps-and-open-questions.md#a16-data-export). Lives here rather than in `src/data/`
 * (which is the Supabase seam, not a DOM one) or `core/` (which may not touch the DOM at all).
 */
export function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
