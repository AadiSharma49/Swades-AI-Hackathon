"use client";

import { Toaster } from "@my-better-t-app/ui/components/sonner";

import { ThemeProvider } from "./theme-provider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider defaultTheme="system">
      {children}
      <Toaster richColors />
    </ThemeProvider>
  );
}
