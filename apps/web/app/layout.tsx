import "./globals.css";
import { Providers } from "./providers";
import Link from "next/link";

export const metadata = { title: "Meal Planner" };

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/recipes", label: "Recipes" },
  { href: "/ingredients", label: "Ingredients" },
  { href: "/shopping-list", label: "Shopping list" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Providers>
          <header className="app-header border-b">
            <nav className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
              {NAV_ITEMS.map(({ href, label }) => (
                <Link key={href} href={href} className="app-nav-link">
                  {label}
                </Link>
              ))}
            </nav>
          </header>
          <main className="app-shell mx-auto my-10 max-w-6xl px-6 py-10">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
