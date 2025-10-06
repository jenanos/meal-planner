import "./globals.css";
import { Providers } from "./providers";
import ResponsiveNav from "./components/ResponsiveNav";

export const metadata = { title: "Meal Planner" };

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
          <main className="app-shell mx-auto my-10 max-w-6xl px-6 py-10">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
