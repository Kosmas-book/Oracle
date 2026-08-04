"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

const links = [
  { href: "/", label: "Πρόγραμμα" },
  { href: "/employees", label: "Προσωπικό" },
  { href: "/fuel", label: "Καύσιμα" },
  { href: "/settings", label: "Ρυθμίσεις" },
];

export default function Nav() {
  const path = usePathname();
  const [station, setStation] = useState("");
  useEffect(() => {
    fetch("/api/station").then(async (r) => {
      if (r.status === 401) {
        window.location.href = "/login";
        return;
      }
      const d = await r.json().catch(() => ({}));
      if (d.name) setStation(d.name);
    });
  }, []);
  return (
    <nav className="nav">
      <span className="brand">
        <span className="dot" />
        {station || "Βάρδιες"}{station ? " · Βάρδιες" : ""}
      </span>
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={"link" + (path === l.href ? " active" : "")}
        >
          {l.label}
        </Link>
      ))}
      <span className="spacer" />
    </nav>
  );
}
