import "./globals.css";
import { Providers } from "./providers";
import ResponsiveNav from "./components/ResponsiveNav";

export const metadata = {
  title: "Butta – Måltidsplanlegger",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
  },
};

const NAV_ITEMS = [
  { href: "/", label: "Ukesplan" },
  { href: "/recipes", label: "Oppskrifter" },
  { href: "/ingredients", label: "Ingredienser" },
  { href: "/shopping-list", label: "Handleliste" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Providers>
          <header className="app-header border-b">
            <nav>
              <ResponsiveNav items={NAV_ITEMS} />
            </nav>
          </header>
          <main className="app-shell mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-12 md:px-8 md:py-10">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
