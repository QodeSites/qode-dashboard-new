/**
 * Dinesh Portfolio API Route
 *
 * Data Source: CSV file (data/dinesh_bifurcated_total_mastersheet.csv)
 * Previously: Database (master_sheet_test)
 *
 * To switch back to database, change import to:
 * import { PortfolioApi } from '@/app/lib/dinesh-utils';
 */
import { PortfolioApiCsv } from '@/app/lib/dinesh-csv-utils';

export const GET = PortfolioApiCsv.GET;
