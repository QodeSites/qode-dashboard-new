import * as fs from 'fs';

const csv = fs.readFileSync('data/satidham_old_qye_mastersheet.csv', 'utf-8');
const lines = csv.trim().split('\n');
const headers = lines[0].split(',');

console.log('=== HEADERS ===');
console.log(headers);

// Parse all data
const data: Record<string, any>[] = [];
for (let i = 1; i < lines.length; i++) {
  const values = lines[i].split(',');
  const row: Record<string, any> = {};
  headers.forEach((h, idx) => {
    row[h] = values[idx];
  });
  data.push(row);
}

console.log('\n=== UNIQUE SYSTEM TAGS ===');
const systemTags = [...new Set(data.map(d => d['System Tag']))];
console.log('Total unique tags:', systemTags.length);
systemTags.forEach(tag => console.log('-', tag));

console.log('\n=== DATE RANGE ===');
const dates = [...new Set(data.map(d => d['Date']))].sort();
console.log('First date:', dates[0]);
console.log('Last date:', dates[dates.length - 1]);
console.log('Total unique dates:', dates.length);

// Focus on the main aggregated tag (likely "QYE Total Portfolio Value" or "QYE Zerodha Total Portfolio")
console.log('\n=== QYE Total Portfolio Value DATA ===');
const totalPortfolioData = data.filter(d => d['System Tag'] === 'QYE Total Portfolio Value');
console.log('Total records:', totalPortfolioData.length);

if (totalPortfolioData.length > 0) {
  const first = totalPortfolioData[0];
  const last = totalPortfolioData[totalPortfolioData.length - 1];
  
  console.log('\nFirst record:', first);
  console.log('\nLast record:', last);
  
  // Calculate key metrics
  const totalCashInOut = totalPortfolioData.reduce((sum, d) => sum + parseFloat(d['Cash In/Out'] || '0'), 0);
  const totalPnL = totalPortfolioData.reduce((sum, d) => sum + parseFloat(d['PnL'] || '0'), 0);
  
  console.log('\n=== KEY METRICS ===');
  console.log('Total Cash In/Out (Amount Invested):', totalCashInOut.toFixed(2));
  console.log('Total PnL:', totalPnL.toFixed(2));
  console.log('Final Portfolio Value:', last['Portfolio Value']);
  console.log('Final NAV:', last['NAV']);
  console.log('Initial NAV:', first['NAV']);
  
  // Max Drawdown
  const drawdowns = totalPortfolioData.map(d => parseFloat(d['Drawdown %'] || '0'));
  const maxDrawdown = Math.min(...drawdowns);
  console.log('Max Drawdown %:', maxDrawdown);
  console.log('Current Drawdown %:', last['Drawdown %']);
}

console.log('\n=== QYE Zerodha Total Portfolio DATA ===');
const zerodhaData = data.filter(d => d['System Tag'] === 'QYE Zerodha Total Portfolio');
console.log('Total records:', zerodhaData.length);
if (zerodhaData.length > 0) {
  const first = zerodhaData[0];
  const last = zerodhaData[zerodhaData.length - 1];
  console.log('\nFirst record:', first);
  console.log('\nLast record:', last);
}
