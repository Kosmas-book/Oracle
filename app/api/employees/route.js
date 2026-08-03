import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from("employees")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ employees: data });
}

export async function POST(req) {
  const body = await req.json();
  const row = {
    name: (body.name || "").trim(),
    active: body.active !== false,
    employment_type: body.employment_type === "part" ? "part" : "full",
    min_days: Number(body.min_days) || 3,
    max_days: Number(body.max_days) || 6,
    allowed_shifts: Array.isArray(body.allowed_shifts) ? body.allowed_shifts : [],
    night_rotation: !!body.night_rotation,
    sort_order: Number(body.sort_order) || 100,
    fixed_days: (() => {
      const ok = ["Ρ", "Π", "Π2", "Π4", "Α", "Α2", "Α3", "Β", "Ο"];
      const out = {};
      const src = body.fixed_days && typeof body.fixed_days === "object" ? body.fixed_days : {};
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
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ employee: data });
}

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const { error } = await supabaseAdmin().from("employees").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
