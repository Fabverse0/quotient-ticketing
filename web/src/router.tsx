import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { RequireRole } from "./components/RequireRole";
import { DashboardPage } from "./pages/DashboardPage";
import { EventsPage } from "./pages/EventsPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      {
        path: "/",
        element: (
          <RequireRole role="buyer">
            <EventsPage />
          </RequireRole>
        ),
      },
      {
        path: "/organizer",
        element: (
          <RequireRole role="organizer">
            <DashboardPage />
          </RequireRole>
        ),
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
