import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { QueueProvider } from "./context/QueueContext";
import { AuthProvider } from "./context/AuthContext";
import { PlaylistProvider } from "./context/PlaylistContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <QueueProvider>
        <PlaylistProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </PlaylistProvider>
      </QueueProvider>
    </AuthProvider>
  </React.StrictMode>,
);
