import { Commissioner } from "next/font/google";
import "./globals.css";

// next/font: η γραμματοσειρά κατεβαίνει στο build και σερβίρεται self-hosted.
// Καμία εξωτερική κλήση στο Google Fonts κατά την εκτέλεση.
const commissioner = Commissioner({
  subsets: ["greek", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-commissioner",
  fallback: ["Segoe UI", "system-ui", "sans-serif"],
});

export const metadata = {
  title: "Turno · Πρόγραμμα βαρδιών",
  description: "Εβδομαδιαίο πρόγραμμα εργασίας και πρόβλεψη καυσίμων",
};

export default function RootLayout({ children }) {
  return (
    <html lang="el" className={commissioner.variable}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  );
}
