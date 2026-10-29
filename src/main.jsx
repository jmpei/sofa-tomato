// Entry point: mounts <App /> into #root.
import App from "./App.jsx";

document.documentElement.lang = "en";
const root = document.getElementById("root");
if (!window.React || !window.ReactDOM) {
  // The CDN script did not load (offline, or blocked by an extension).
  root.textContent = "Sofa Tomato could not load. Check your connection and reload the page.";
} else {
  ReactDOM.createRoot(root).render(<App />);
}
