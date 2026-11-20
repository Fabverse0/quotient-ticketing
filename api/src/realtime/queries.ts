import type { Client } from "pg";

export interface CounterRow {
  id: string;
  quota: number;
  sold: number;
  reserved: number;
}

export async function readCounters(client: Client, eventId: string): Promise<CounterRow[]> {
  const { rows } = await client.query<CounterRow>(
    "SELECT id, quota, sold, reserved FROM ticket_types WHERE event_id = $1 ORDER BY kind",
    [eventId],
  );
  return rows;
}
