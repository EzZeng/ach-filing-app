import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/styles.css";
import { AppProviders } from "@/theme/AppProviders";
import { AppShell } from "@/app/AppShell";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <AppShell />
    </AppProviders>
  </StrictMode>,
);
