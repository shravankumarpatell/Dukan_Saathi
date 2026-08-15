/** Local-calendar helpers. Avoid UTC date-only strings shifting the shop's day. */

export function startOfLocalDay(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}

export function toYMD(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

export function fromYMD(ymd) {
  const [y, m, day] = String(ymd || "").split("-").map(Number);
  if (!y || !m || !day) return startOfLocalDay();
  return new Date(y, m - 1, day);
}

export function toYM(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
}

export function fromYM(ym) {
  const [y, m] = String(ym || "").split("-").map(Number);
  if (!y || !m) return startOfMonth();
  return new Date(y, m - 1, 1);
}

export function addDays(d, n) {
  const x = startOfLocalDay(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate() + n);
}

export function addMonths(d, n) {
  const x = d instanceof Date ? d : new Date(d);
  return new Date(x.getFullYear(), x.getMonth() + n, 1);
}

export function startOfMonth(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), 1);
}

export function endOfMonth(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  return new Date(x.getFullYear(), x.getMonth() + 1, 0);
}

export function startOfYear(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  return new Date(x.getFullYear(), 0, 1);
}

export function endOfYear(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  return new Date(x.getFullYear(), 11, 31);
}

export function minDate(a, b) {
  return startOfLocalDay(a) <= startOfLocalDay(b) ? startOfLocalDay(a) : startOfLocalDay(b);
}

export function maxDate(a, b) {
  return startOfLocalDay(a) >= startOfLocalDay(b) ? startOfLocalDay(a) : startOfLocalDay(b);
}

export function clampToToday(d, today = new Date()) {
  return minDate(d, today);
}

export function daysInRange(start, end) {
  const a = startOfLocalDay(start);
  const b = startOfLocalDay(end);
  return Math.round((b - a) / 86400000) + 1;
}

export function eachDay(start, end) {
  const out = [];
  let cur = startOfLocalDay(start);
  const last = startOfLocalDay(end);
  if (cur > last) return out;
  while (cur <= last) {
    out.push(new Date(cur));
    cur = addDays(cur, 1);
  }
  return out;
}

export function eachMonth(start, end) {
  const out = [];
  let cur = startOfMonth(start);
  const last = startOfMonth(end);
  if (cur > last) return out;
  while (cur <= last) {
    out.push(new Date(cur));
    cur = addMonths(cur, 1);
  }
  return out;
}

/** Same-length window immediately before `start`. */
export function previousPeriod(start, end) {
  const days = daysInRange(start, end);
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(days - 1));
  return { start: prevStart, end: prevEnd };
}

/** Same calendar alignment: Aug 1–15 vs July 1–15; 2026 YTD vs 2025 YTD. */
export function alignedPreviousPeriod(start, end, grain = "day") {
  if (grain === "year") {
    return {
      start: new Date(start.getFullYear() - 1, start.getMonth(), start.getDate()),
      end: new Date(end.getFullYear() - 1, end.getMonth(), end.getDate()),
    };
  }
  if (grain === "month") {
    const prevStart = addMonths(startOfMonth(start), -1);
    const endDay = startOfLocalDay(end).getDate();
    const cap = endOfMonth(prevStart).getDate();
    const prevEnd = new Date(prevStart.getFullYear(), prevStart.getMonth(), Math.min(endDay, cap));
    return { start: prevStart, end: prevEnd };
  }
  return previousPeriod(start, end);
}

export function inLocalRange(iso, start, end) {
  if (!iso) return false;
  const d = startOfLocalDay(new Date(iso));
  if (Number.isNaN(d.getTime())) return false;
  return d >= startOfLocalDay(start) && d <= startOfLocalDay(end);
}

/** Noon local → ISO, so PDF/filename keep the shop's calendar day. */
export function localNoonISO(ymdOrDate) {
  const d = typeof ymdOrDate === "string" ? fromYMD(ymdOrDate) : startOfLocalDay(ymdOrDate);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

export function fmtDayLabel(d) {
  return startOfLocalDay(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function fmtMonthLabel(d) {
  return startOfLocalDay(d).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

export function fmtYearLabel(d) {
  return String(startOfLocalDay(d).getFullYear());
}

export function fmtLongDate(d) {
  return startOfLocalDay(d).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function isTodayYmd(ymd, today = new Date()) {
  return ymd === toYMD(today);
}

export function isYesterdayYmd(ymd, today = new Date()) {
  return ymd === toYMD(addDays(today, -1));
}

export function earliestYMD(records) {
  let min = "";
  for (const r of records || []) {
    if (!r?.date) continue;
    const y = toYMD(new Date(r.date));
    if (!y) continue;
    if (!min || y < min) min = y;
  }
  return min;
}
