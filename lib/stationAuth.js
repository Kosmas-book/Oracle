import { cookies } from "next/headers";
import { supabaseAdmin } from "./supabaseAdmin";

// Βρίσκει το κατάστημα από το PIN του cookie. null = μη έγκυρη σύνδεση.
export async function getStation() {
  const pin = cookies().get("vardia_pin")?.value;
  if (!pin) return null;
  const { data } = await supabaseAdmin()
    .from("stations")
    .select("id,name")
    .eq("pin", pin)
    .maybeSingle();
  return data || null;
}
