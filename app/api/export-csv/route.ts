import { prisma } from "@/lib/prisma";

function formatNumber(value: any) {
  const num = Number(value);
  if (!num) return "0.00";
  return num.toFixed(2);
}

// CSV escape (IMPORTANT)
function escapeCSV(value: any) {
  if (value === null || value === undefined) return "";

  const str = String(value);

  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export async function POST(req: Request) {
  try {
    const { qcodes } = await req.json();

    if (!Array.isArray(qcodes)) {
      return new Response("Invalid input", { status: 400 });
    }

    const batchSize = 5000;

    // changed from lastId → composite cursor
    let lastCursor:
      | { date_id: { date: Date; id: number } }
      | undefined = undefined;

    const COLUMNS = [
      { header: "System Tag", accessor: (row: any) => row.system_tag },
      {
        header: "Date",
        accessor: (row: any) =>
          row.date
            ? new Date(row.date).toISOString().split("T")[0]
            : "",
      },
      {
        header: "Portfolio Value",
        accessor: (row: any) => formatNumber(row.portfolio_value),
      },
      {
        header: "Cash In/Out",
        accessor: (row: any) => formatNumber(row.capital_in_out),
      },
      { header: "NAV", accessor: (row: any) => formatNumber(row.nav) },
      { header: "Prev NAV", accessor: (row: any) => formatNumber(row.prev_nav) },
      { header: "PnL", accessor: (row: any) => formatNumber(row.pnl) },
      {
        header: "Daily P/L %",
        accessor: (row: any) => formatNumber(row.daily_p_l),
      },
      {
        header: "Exposure Value",
        accessor: (row: any) => formatNumber(row.exposure_value),
      },
      {
        header: "Prev Portfolio Value",
        accessor: (row: any) =>
          formatNumber(row.prev_portfolio_value),
      },
      {
        header: "Prev Exposure Value",
        accessor: (row: any) =>
          formatNumber(row.prev_exposure_value),
      },
      {
        header: "Prev PnL",
        accessor: (row: any) => formatNumber(row.prev_pnl),
      },
      {
        header: "Drawdown %",
        accessor: (row: any) => formatNumber(row.drawdown),
      },
    ];

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let headersWritten = false;

        try {
          while (true) {
            const rows = await prisma.master_sheet.findMany({
              where: {
                qcode: { in: qcodes },
              },
              take: batchSize,
              ...(lastCursor && {
                cursor: lastCursor,
                skip: 1,
              }),
              // FIX: proper ordering
              orderBy: [
                { date: "asc" },
                { id: "asc" },
              ],
            });

            if (rows.length === 0) break;

            // headers
            if (!headersWritten) {
              const headerLine =
                COLUMNS.map((col) => col.header).join(",") + "\n";

              controller.enqueue(encoder.encode(headerLine));
              headersWritten = true;
            }

            // rows
            for (const row of rows) {
              const line =
                COLUMNS.map((col) =>
                  escapeCSV(col.accessor(row))
                ).join(",") + "\n";

              controller.enqueue(encoder.encode(line));
            }

            // FIX: composite cursor update
            const lastRow = rows[rows.length - 1];
            lastCursor = {
              date_id: {
                date: lastRow.date,
                id: lastRow.id,
              },
            };
          }

          controller.close();
        } catch (err) {
          console.error("Streaming error:", err);
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition":
          "attachment; filename=master_sheet.csv",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("API error:", err);
    return new Response("Internal Server Error", {
      status: 500,
    });
  }
}