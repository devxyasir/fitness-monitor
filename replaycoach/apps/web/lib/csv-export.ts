/** RFC4180 field quoting — wrap in quotes and escape embedded quotes only
 * when the field actually needs it (contains a comma, quote, or newline). */
function quoteField(value: string | number | boolean | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Builds a CSV from an array of flat row objects (columns = the first row's
 * keys, in insertion order) and downloads it — same blob -> ObjectURL ->
 * synthetic-click -> revoke pattern as downloadClipVideo(), just building
 * the blob from a string directly instead of fetching a URL.
 */
export function downloadCsv(filename: string, rows: Record<string, string | number | boolean | null | undefined>[]): void {
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]!);
  const lines = [headers.map(quoteField).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => quoteField(row[h])).join(','));
  }

  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
