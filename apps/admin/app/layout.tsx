import "./globals.css";
import { Providers } from "./providers";

export const metadata = {
  title: "Butta – Admin",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nb">
      <body className="min-h-screen antialiased">
        <Providers>
          <header className="border-b bg-card px-4 py-3">
            <h1 className="text-lg font-semibold text-foreground">
              🛠️ Butta Admin
            </h1>
          </header>
          <main className="mx-auto w-full px-4 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
