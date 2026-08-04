import "./globals.css";

export const metadata = {
  title: "Βάρδιες Πρατηρίου",
  description: "Εβδομαδιαίο πρόγραμμα εργασίας πρατηρίου",
};

export default function RootLayout({ children }) {
  return (
    <html lang="el">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Commissioner:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  );
}
