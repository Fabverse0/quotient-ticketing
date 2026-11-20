import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { OrganizerShell } from "./components/OrganizerShell";
import { RequireRole } from "./components/RequireRole";
import { AnalyticsRedirect } from "./pages/AnalyticsRedirect";
import { AuthPage } from "./pages/AuthPage";
import { CreateEventPage } from "./pages/CreateEventPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EventDetailPage } from "./pages/EventDetailPage";
import { EventsPage } from "./pages/EventsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OrganizerEventsPage } from "./pages/OrganizerEventsPage";
import { OverviewPage } from "./pages/OverviewPage";
import { OrderPage } from "./pages/OrderPage";
import { OrdersPage } from "./pages/OrdersPage";
import { TicketsPage } from "./pages/TicketsPage";

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      // Browsing is public; ordering asks for a buyer account.
      { path: "/", element: <EventsPage /> },
      { path: "/event/:id", element: <EventDetailPage /> },
      {
        path: "/pesanan",
        element: (
          <RequireRole role="buyer">
            <OrdersPage />
          </RequireRole>
        ),
      },
      {
        path: "/pesanan/:id",
        element: (
          <RequireRole role="buyer">
            <OrderPage />
          </RequireRole>
        ),
      },
      {
        path: "/tiket",
        element: (
          <RequireRole role="buyer">
            <TicketsPage />
          </RequireRole>
        ),
      },
      { path: "/masuk", element: <AuthPage mode="login" /> },
      { path: "/daftar", element: <AuthPage mode="register" /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
  {
    path: "/organizer",
    element: (
      <RequireRole role="organizer">
        <OrganizerShell />
      </RequireRole>
    ),
    children: [
      { index: true, element: <OverviewPage /> },
      { path: "analitik", element: <AnalyticsRedirect /> },
      { path: "event", element: <OrganizerEventsPage /> },
      { path: "event/baru", element: <CreateEventPage /> },
      { path: "event/:id", element: <DashboardPage /> },
    ],
  },
]);
