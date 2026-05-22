import React from "react";
import ReactDOM from "react-dom/client";
import FlameApp from "./FlameApp.jsx";
import { ThemeProvider } from "./theme.jsx";



ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <FlameApp />
    </ThemeProvider>
  </React.StrictMode>
);
