import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// Mantine requires its global stylesheet (component classes + the CSS
// variables MantineProvider fills in). Imported BEFORE app.css so the
// playground shell's own body/typography rules keep winning on ties.
import "@mantine/core/styles.css";
import "./app.css";

const root = document.getElementById("root");
if (root === null) throw new Error("root element missing");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
