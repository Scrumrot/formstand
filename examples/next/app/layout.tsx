import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "formstand with Next.js server actions",
  description:
    "A formstand form submitting through a server action that re-validates with the same zod schema.",
};

export type RootLayoutProps = Readonly<{ children: ReactNode }>;

const RootLayout = ({ children }: RootLayoutProps) => (
  <html lang="en">
    <body>{children}</body>
  </html>
);

// Next's app router requires the layout as the module's default export.
export default RootLayout;
