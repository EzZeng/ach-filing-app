import type { ReactNode } from "react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { achTheme } from "./achTheme";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={achTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
