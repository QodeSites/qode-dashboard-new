interface FeesData {
  [year: string]: {
    q1: string;
    q2: string;
    q3: string;
    q4: string;
    total: string;
  };
}

export interface CostsSummaryReportProps {
  totalFees: FeesData;
  zerodhaFees: FeesData;
  pmsFees: FeesData;
  sessionUserName: string;
}

const formatIndianCurrency = (value: string): string => {
  if (value === "-" || value === "" || value === undefined || value === null) {
    return "-";
  }
  const numValue = parseFloat(value);
  if (isNaN(numValue)) return "-";
  return numValue.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const buildFeesTableHTML = (title: string, fees: FeesData): string => {
  const years = Object.keys(fees).sort((a, b) => parseInt(a) - parseInt(b));
  const quarters = ["q1", "q2", "q3", "q4", "total"] as const;

  const rows = years
    .map(
      (year) => `
      <tr>
        <td style="font-weight:600;">${year}</td>
        ${quarters
          .map((q) => {
            const val = fees[year][q];
            const formatted = formatIndianCurrency(val);
            return `<td class="right-align">${formatted}</td>`;
          })
          .join("")}
      </tr>`
    )
    .join("");

  return `
    <div class="section-header">${title}</div>
    <div class="section no-split">
      <div class="section-content">
        <table>
          <thead>
            <tr>
              <th>Year</th>
              <th class="right-align">Q1 (₹)</th>
              <th class="right-align">Q2 (₹)</th>
              <th class="right-align">Q3 (₹)</th>
              <th class="right-align">Q4 (₹)</th>
              <th class="right-align">Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows : '<tr><td colspan="6" style="text-align:center;">No data available</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
};

export function buildCostsSummaryReportHTML(props: CostsSummaryReportProps): string {
  const { totalFees, zerodhaFees, pmsFees, sessionUserName } = props;

  const generatedDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Costs Summary - ${sessionUserName}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Lato:wght@300;400;500;600&family=Inria+Serif:wght@300;400;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Lato', sans-serif; background-color: #EFECD3; color: #333; line-height: 1.5; font-size: 12px; }
    .page { width: 210mm; height: 297mm; padding: 5mm; margin: 0; background-color: #EFECD3; page-break-after: always; display: flex; flex-direction: column; position: relative; }
    .page:last-child { page-break-after: auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 3px solid #02422B; }
    .header-left h1 { font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 700; color: #02422B; margin-bottom: 5px; }
    .header-left p { font-size: 14px; color: #666; font-weight: 400; }
    .header-right { text-align: right; }
    .header-right .date { font-size: 11px; color: #666; margin-bottom: 5px; }
    .section { background: #EFECD3; border-radius: 8px; margin-bottom: 15px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .section.no-split { page-break-inside: avoid; -webkit-column-break-inside: avoid; break-inside: avoid; }
    .section-header { color: #02422B; padding: 12px 0px; font-family: 'Playfair Display', serif; font-size: 16px; font-weight: 600; }
    .section-content { padding: 0px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background-color: #02422B; color: white; padding: 10px 8px; text-align: center; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 8px; text-align: center; border-bottom: 1px solid #eee; }
    tr:nth-child(even) { background-color: rgba(255,255,255,0.3); }
    .right-align { text-align: right; }
    .note { font-size: 10px; color: #666; margin-top: 8px; margin-bottom: 4px; font-style: italic; padding: 0 4px; }
    .disclaimer { font-size: 9px; color: #999; line-height: 1.4; max-width: 75%; }
    .footer { margin-top: auto; padding-top: 15px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #666; }
    .page-number { font-family: 'Playfair Display', serif; font-size: 12px; color: #02422B; font-weight: 600; }
    @page { size: A4 portrait; margin: 0; }
    @media print {
      body, .page, .section, .header, th, .section-header {
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>

  <div class="page">
    <div class="header">
      <div class="header-left">
        <h1>${sessionUserName}</h1>
        <p>Costs Summary</p>
      </div>
      <div class="header-right">
        <div class="date">Generated on: ${generatedDate}</div>
      </div>
    </div>

    ${buildFeesTableHTML("Total Costs", totalFees)}

    ${buildFeesTableHTML("Zerodha Costs", zerodhaFees)}
    <div class="note"><strong>Note:</strong> Zerodha costs figures are as of 31 December 2025 and include both collections and accruals.</div>

    ${buildFeesTableHTML("PMS Costs", pmsFees)}
    <div class="note"><strong>Note:</strong> PMS costs figures are as of 31 December 2025 and include both collections and accruals.</div>
    <div class="note"><strong>Disclaimer:</strong> The costs listed for PMS represent the agreed-upon quarterly Management Fee only. This amount excludes the Performance Fee, which is calculated separately and charged at the end of the respective financial year.</div>

    <div class="footer">
      <div class="disclaimer"></div>
      <div class="page-number">1 | Qode</div>
    </div>
  </div>

  <script>
    setTimeout(() => { try { window.print(); } catch(e) {} }, 500);
  </script>
</body>
</html>
  `;

  return html;
}
