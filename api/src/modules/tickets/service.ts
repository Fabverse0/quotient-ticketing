import type { Database } from "../../shared/db/client.js";
import { listTicketsForBuyer } from "./queries.js";
import { toBuyerTicketView } from "./views.js";

export function createTicketsService({ db }: { db: Database }) {
  return {
    async list(buyerId: string) {
      const rows = await listTicketsForBuyer(db, buyerId);
      return rows.map(toBuyerTicketView);
    },
  };
}

export type TicketsService = ReturnType<typeof createTicketsService>;
