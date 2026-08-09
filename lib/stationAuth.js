import { cookies } from "next/headers";
import { supabaseAdmin } from "./supabaseAdmin";
import {
  createSessionToken,
  verifySessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "./authSecurity";

// Επαληθεύει υπογεγραμμένο session και επιστρέφει μόνο το αντίστοιχο κατάστημα.
export async function getStation() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) return null;
  const { data } = await supabaseAdmin()
    .from("stations")
    .select("id,name,session_version")
    .eq("id", session.stationId)
    .maybeSingle();
  if (!data || Number(data.session_version) !== session.sessionVersion) return null;
  return { id: data.id, name: data.name };
}

export function setSessionCookie(response, station) {
  response.cookies.set(
    SESSION_COOKIE,
    createSessionToken(station.id, station.session_version),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: SESSION_MAX_AGE,
      path: "/",
    }
  );
  // Καθαρισμός του παλιού cookie που περιείχε το PIN.
  response.cookies.set("vardia_pin", "", { path: "/", maxAge: 0 });
}

export function clearSessionCookies(response) {
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set("vardia_pin", "", { path: "/", maxAge: 0 });
}
