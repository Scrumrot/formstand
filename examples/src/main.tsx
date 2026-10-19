import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// Only the shell's own stylesheet loads up front. Kit stylesheets (Mantine's
// 568 kB sheet, notably) arrive with their tab's lazy chunk; see
// demo/MantineBridge.tsx for how the cascade order stays correct.
import "./app.css";

const root = document.getElementById("root");
if (root === null) throw new Error("root element missing");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
