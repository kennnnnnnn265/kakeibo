import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
createRoot(document.getElementById("app")).render(<App />);
if ("serviceWorker" in navigator && !window.KK_CONFIG?.mock) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
