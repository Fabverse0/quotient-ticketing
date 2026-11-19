import "./styles/index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "./components/Button";
import { Cover } from "./components/Cover";
import { Field } from "./components/Field";
import { LiveNumber } from "./components/LiveNumber";
import { Reveal } from "./components/Reveal";
import { StatusLabel } from "./components/StatusLabel";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Reveal>
      <Cover seed="x" className="h-20 w-20" />
      <Field label="Email" />
      <Button>Masuk</Button>
      <StatusLabel tone="sage">Tersedia</StatusLabel>
      <LiveNumber value={3} />
    </Reveal>
  </StrictMode>,
);
