import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

import { QueueProvider } from "./context/QueueContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueueProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueueProvider>
  </React.StrictMode>,
);
