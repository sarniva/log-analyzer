export const QUICKWIT_URL = process.env.QUICKWIT_URL || "http://localhost:7280";
const QUICKWIT_INDEX = "logs-v1";

export async function ensureQuickwitIndex() {
  const response = await fetch(`${QUICKWIT_URL}/api/v1/indexes/${QUICKWIT_INDEX}`);

  if (response.ok) {
    return;
  }

  if (response.status !== 404) {
    const errText = await response.text();
    throw new Error(`Failed to inspect Quickwit index: ${response.status} ${response.statusText} - ${errText}`);
  }

  const createResponse = await fetch(`${QUICKWIT_URL}/api/v1/indexes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      version: "0.8",
      index_id: QUICKWIT_INDEX,
      doc_mapping: {
        field_mappings: [
          { name: "id", type: "text", stored: true, indexed: true },
          { name: "tenantId", type: "text", stored: true, indexed: true, fast: true },
          { name: "message", type: "text", stored: true, indexed: true, tokenizer: "default" },
          { name: "level", type: "text", stored: true, indexed: true, fast: true },
          {
            name: "timestamp",
            type: "datetime",
            input_formats: ["iso8601"],
            output_format: "iso8601",
            stored: true,
            fast: true,
          },
        ],
        timestamp_field: "timestamp",
      },
      search_settings: {
        default_search_fields: ["message"],
      },
    }),
  });

  if (!createResponse.ok) {
    const errText = await createResponse.text();
    throw new Error(`Failed to create Quickwit index: ${createResponse.status} ${createResponse.statusText} - ${errText}`);
  }
}

export async function bulkInsertLexical(logs: any[]) {
  if (!logs || logs.length === 0) return;

  const ndjson = logs
    .map((log) =>
      JSON.stringify({
        id: log.id,
        tenantId: log.tenantId,
        message: log.message,
        level: log.level,
        timestamp: log.timestamp,
      })
    )
    .join("\n") + "\n";

  const response = await fetch(`${QUICKWIT_URL}/api/v1/${QUICKWIT_INDEX}/ingest?commit=force`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-ndjson",
    },
    body: ndjson,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to insert logs into Quickwit: ${response.status} ${response.statusText} - ${errText}`);
  }
}
