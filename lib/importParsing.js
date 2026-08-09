export function excelToISO(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date)
    return isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 20000 && value < 60000) {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match)
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  match = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (!match) return null;
  let year = match[3];
  if (year.length === 2) year = "20" + year;
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

export function parseCsv(text) {
  const source = String(text || "");
  const firstLine = source.split(/\r?\n/, 1)[0] || "";
  const choices = [",", ";", "\t"];
  const delimiter = choices.sort(
    (a, b) => firstLine.split(b).length - firstLine.split(a).length
  )[0];
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((value) => String(value).trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => String(value).trim() !== "")) rows.push(row);
  return rows;
}
