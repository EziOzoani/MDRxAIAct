import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import "./index.css";

const rootElement = document.getElementById("root");
console.log("Root element found:", rootElement);

if (!rootElement) {
  throw new Error("Failed to find the root element");
}

console.log("Rendering React app...");

createRoot(rootElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

console.log("React render call completed");
