// app/layout.tsx
import "./globals.css";

export const metadata = {
  title: "Sui zkLogin Demo",
  description: "Step-by-step walkthrough of zkLogin flow",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
