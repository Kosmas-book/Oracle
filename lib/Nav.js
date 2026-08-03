"use client";
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
  return (
    <nav className="nav">
      <span className="brand">
        <span className="dot" />
        ΚΑΛΥΨΩ · Βάρδιες
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
