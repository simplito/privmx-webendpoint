import { createRoot } from "react-dom/client";
import { App } from "./App";

// No StrictMode: its double-invoked effects would initialise the WASM core
// twice, and the core is a process-wide singleton.
createRoot(document.getElementById("root")!).render(<App />);
