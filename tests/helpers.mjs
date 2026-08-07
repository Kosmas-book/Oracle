export const mk = (id, name, o = {}) => ({
  id,
  name,
  active: true,
  employment_type: "full",
  min_days: 3,
  max_days: 6,
  allowed_shifts: ["Π", "Π2", "Π4", "Α", "Α2", "Α3"],
  fixed_days: {},
  sort_order: 100,
  ...o,
});

export const WEEKDAY = { "Π": 3, "Α": 3, "Π4": 1, "Α3": 1 };
export const SUNDAY = { "Π": 2, "Π2": 1, "Π4": 1, "Α": 2, "Α2": 1 };

export function team(n = 11) {
  const out = [
    mk("n1", "ΒΡΑΔ-1", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"] }),
    mk("n2", "ΒΡΑΔ-2", { allowed_shifts: ["Π", "Π4", "Α", "Α3", "Β"] }),
  ];
  for (let i = 3; i <= n; i++) out.push(mk("e" + i, "ΥΠ-" + i));
  return out;
}

export const workedDays = (row) =>
  (row || []).filter((c) => c && c !== "Ρ" && c !== "Ο").length;

export const countIn = (grid, emps, day, code) =>
  emps.filter((e) => (grid[e.id] || [])[day] === code).length;
