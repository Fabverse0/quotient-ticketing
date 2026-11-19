import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { RequireRole } from "./components/RequireRole";
import { AuthPage } from "./pages/AuthPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EventDetailPage } from "./pages/EventDetailPage";
import { EventsPage } from "./pages/EventsPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      // Browsing is public; ordering asks for a buyer account.
      { path: "/", element: <EventsPage /> },
      { path: "/event/:id", element: <EventDetailPage /> },
      {
        path: "/organizer",
        element: (
          <RequireRole role="organizer">
            <DashboardPage />
          </RequireRole>
        ),
      },
      { path: "/masuk", element: <AuthPage mode="login" /> },
      { path: "/daftar", element: <AuthPage mode="register" /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
