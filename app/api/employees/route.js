import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStation } from "@/lib/stationAuth";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const st = await getStation();
  if (!st) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("all") === "1";
  let q = supabaseAdmin()
    .from("employees")
    .select("*")
    .eq("station_id", st.id);
  if (!includeInactive) q = q.is("deactivated_at", null);
  const { data, error } = await q
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ employees: data });
}

export async function POST(req) {
  const st = await getStation();
  if (!st) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const row = {
    station_id: st.id,
    name: (body.name || "").trim(),
    active: body.active !== false,
    employment_type: body.employment_type === "part" ? "part" : "full",
    min_days: Number(body.min_days) || 3,
    max_days: Number(body.max_days) || 6,
    allowed_shifts: Array.isArray(body.allowed_shifts) ? body.allowed_shifts : [],
    night_rotation: Array.isArray(body.allowed_shifts)
      ? body.allowed_shifts.includes("Β")
      : false,
    sort_order: Number(body.sort_order) || 100,
    fixed_days: (() => {
      const ok = ["Ρ", "Π", "Π2", "Π4", "Α", "Α2", "Α3", "Β", "Ο"];
      const out = {};
      const src =
        body.fixed_days && typeof body.fixed_days === "object"
          ? body.fixed_days
          : {};
      for (const [d, c] of Object.entries(src)) {
        const di = Number(d);
        if (di >= 0 && di <= 6 && ok.includes(c)) out[di] = c;
      }
      return out;
    })(),
  };
  if (!row.name)
    return NextResponse.json({ error: "Λείπει το όνομα." }, { status: 400 });
  if (body.id) row.id = body.id;

  const { data, error } = await supabaseAdmin()
    .from("employees")
    .upsert(row)
    .eq("station_id", st.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ employee: data });
}

// Γ: SOFT DELETE — ο εργαζόμενος απενεργοποιείται, δεν διαγράφεται ποτέ,
// ώστε τα ιστορικά προγράμματα να συνεχίσουν να δείχνουν σωστά ονόματα/ώρες.
export async function DELETE(req) {
  const st = await getStation();
  if (!st) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const restore = searchParams.get("restore") === "1";
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const { data, error } = await supabaseAdmin()
    .from("employees")
    .update({
      // deactivated_at = ΜΟΝΑΔΙΚΗ πηγή αλήθειας. Το active συντηρείται μόνο
      // για συμβατότητα με παλιότερες εγγραφές.
      deactivated_at: restore ? null : new Date().toISOString(),
      active: restore ? true : false,
    })
    .eq("id", id)
    .eq("station_id", st.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, employee: data, restored: restore });
}
