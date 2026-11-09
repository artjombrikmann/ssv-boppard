import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { VereinProvider } from "./VereinContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <VereinProvider>
      <App />
    </VereinProvider>
  </StrictMode>
);
