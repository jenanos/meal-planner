import "./globals.css";
import { Providers } from "./providers";
import Link from "next/link";
import { GridBeams } from "@repo/ui";

export const metadata = { title: "Meal Planner" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <GridBeams className="opacity-40 dark:opacity-50">
          <Providers>
            <header className="border-b">
              <nav className="mx-auto max-w-6xl px-4 py-3 flex gap-4">
                <Link href="/">Home</Link>
                <Link href="/recipes">Recipes</Link>
                <Link href="/ingredients">Ingredients</Link>
                <Link href="/shopping-list">Shopping list</Link>
              </nav>
            </header>
            <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
          </Providers>
        </GridBeams>
      </body>
    </html>
  );
}
