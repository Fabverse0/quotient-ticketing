import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { RequireRole } from "./components/RequireRole";
import { AuthPage } from "./pages/AuthPage";
import { CreateEventPage } from "./pages/CreateEventPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EventDetailPage } from "./pages/EventDetailPage";
import { EventsPage } from "./pages/EventsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OrganizerEventsPage } from "./pages/OrganizerEventsPage";
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
      {
        path: "/organizer",
        element: (
          <RequireRole role="organizer">
            <OrganizerEventsPage />
          </RequireRole>
        ),
      },
      {
        path: "/organizer/event/baru",
        element: (
          <RequireRole role="organizer">
            <CreateEventPage />
          </RequireRole>
        ),
      },
      {
        path: "/organizer/event/:id",
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
