/**
 * Script to investigate Satidham accounts (QUS0010 and QUS00081)
 *
 * Run with: npx ts-node scripts/investigate-satidham.ts
 * Or: npx tsx scripts/investigate-satidham.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('='.repeat(80));
  console.log('SATIDHAM ACCOUNT INVESTIGATION');
  console.log('='.repeat(80));

  // Query 1: Check if QUS00081 exists in clients table
  console.log('\n--- Query 1: Check if QUS00081 exists in clients table ---\n');
  const newSatidhamClient = await prisma.clients.findUnique({
    where: { icode: 'QUS00081' },
    select: { icode: true, user_name: true, email: true }
  });

  if (newSatidhamClient) {
    console.log('QUS00081 found:', newSatidhamClient);
  } else {
    console.log('QUS00081 NOT FOUND in clients table');
  }

  // Query 2: Check what accounts QUS00081 has access to
  console.log('\n--- Query 2: Accounts QUS00081 has access to ---\n');
  const newSatidhamAccounts = await prisma.pooled_account_users.findMany({
    where: { icode: 'QUS00081' },
    include: {
      accounts: {
        select: { qcode: true, account_name: true, account_type: true, broker: true }
      }
    }
  });

  if (newSatidhamAccounts.length > 0) {
    console.log('QUS00081 has access to:');
    newSatidhamAccounts.forEach(pau => {
      console.log(`  - ${pau.qcode}: ${pau.accounts.account_name} (${pau.accounts.account_type}, ${pau.accounts.broker}) [${pau.access_level}]`);
    });
  } else {
    console.log('QUS00081 has NO accounts in pooled_account_users');
  }

  // Query 3: Check what accounts QUS0010 (old Satidham) has access to
  console.log('\n--- Query 3: Accounts QUS0010 (old Satidham) has access to ---\n');
  const oldSatidhamAccounts = await prisma.pooled_account_users.findMany({
    where: { icode: 'QUS0010' },
    include: {
      accounts: {
        select: { qcode: true, account_name: true, account_type: true, broker: true }
      }
    }
  });

  if (oldSatidhamAccounts.length > 0) {
    console.log('QUS0010 has access to:');
    oldSatidhamAccounts.forEach(pau => {
      console.log(`  - ${pau.qcode}: ${pau.accounts.account_name} (${pau.accounts.account_type}, ${pau.accounts.broker}) [${pau.access_level}]`);
    });
  } else {
    console.log('QUS0010 has NO accounts in pooled_account_users');
  }

  // Query 4: Check all Satidham-related accounts
  console.log('\n--- Query 4: All accounts with "Satidham" in name ---\n');
  const satidhamAccounts = await prisma.accounts.findMany({
    where: {
      account_name: { contains: 'satidham', mode: 'insensitive' }
    },
    select: { qcode: true, account_name: true, account_type: true, broker: true }
  });

  if (satidhamAccounts.length > 0) {
    console.log('Satidham accounts found:');
    satidhamAccounts.forEach(acc => {
      console.log(`  - ${acc.qcode}: ${acc.account_name} (${acc.account_type}, ${acc.broker})`);
    });
  } else {
    console.log('No accounts with "Satidham" in name found');
  }

  // Query 5: Check master_sheet data for known Satidham qcode (QAC00046)
  console.log('\n--- Query 5: master_sheet system_tags for QAC00046 ---\n');
  const masterSheetTags = await prisma.$queryRaw<Array<{ qcode: string; system_tag: string; record_count: bigint }>>`
    SELECT qcode, system_tag, COUNT(*)::bigint as record_count
    FROM master_sheet
    WHERE qcode = 'QAC00046'
    GROUP BY qcode, system_tag
    ORDER BY qcode, system_tag
  `;

  if (masterSheetTags.length > 0) {
    console.log('master_sheet data for QAC00046:');
    masterSheetTags.forEach(row => {
      console.log(`  - ${row.qcode} | ${row.system_tag || '(null)'} | ${row.record_count} records`);
    });
  } else {
    console.log('No master_sheet data found for QAC00046');
  }

  // Query 6: Check PMS data for Satidham
  console.log('\n--- Query 6: pms_master_sheet for Satidham (QAW00041) ---\n');
  const pmsData = await prisma.pms_master_sheet.findMany({
    where: { account_code: 'QAW00041' },
    select: { account_code: true, client_name: true, report_date: true },
    orderBy: { report_date: 'desc' },
    take: 5
  });

  if (pmsData.length > 0) {
    console.log('PMS data for QAW00041 (latest 5 records):');
    pmsData.forEach(row => {
      console.log(`  - ${row.account_code} | ${row.client_name} | ${row.report_date.toISOString().split('T')[0]}`);
    });

    // Get total count
    const pmsCount = await prisma.pms_master_sheet.count({
      where: { account_code: 'QAW00041' }
    });
    console.log(`  Total records: ${pmsCount}`);
  } else {
    console.log('No PMS data found for QAW00041');
  }

  // Query 7: Check if there are any other PMS accounts with Satidham
  console.log('\n--- Query 7: All PMS accounts with "Satidham" in client_name ---\n');
  const allSatidhamPms = await prisma.$queryRaw<Array<{ account_code: string; client_name: string; record_count: bigint }>>`
    SELECT account_code, client_name, COUNT(*)::bigint as record_count
    FROM pms_master_sheet
    WHERE client_name ILIKE '%satidham%'
    GROUP BY account_code, client_name
    ORDER BY account_code
  `;

  if (allSatidhamPms.length > 0) {
    console.log('PMS accounts with "Satidham":');
    allSatidhamPms.forEach(row => {
      console.log(`  - ${row.account_code} | ${row.client_name} | ${row.record_count} records`);
    });
  } else {
    console.log('No PMS accounts with "Satidham" in client_name');
  }

  // Query 8: Compare QUS0010 and QUS00081 in clients table
  console.log('\n--- Query 8: Compare QUS0010 and QUS00081 in clients table ---\n');
  const bothClients = await prisma.clients.findMany({
    where: {
      icode: { in: ['QUS0010', 'QUS00081'] }
    },
    select: { icode: true, user_name: true, email: true, contact_number: true }
  });

  if (bothClients.length > 0) {
    console.log('Client records:');
    bothClients.forEach(client => {
      console.log(`  - ${client.icode}: ${client.user_name} | ${client.email} | ${client.contact_number}`);
    });
  } else {
    console.log('Neither QUS0010 nor QUS00081 found in clients table');
  }

  // Query 9: Check master_sheet data for QAC00066 (new Satidham account)
  console.log('\n--- Query 9: master_sheet system_tags for QAC00066 (NEW account) ---\n');
  const newAccountMasterSheet = await prisma.$queryRaw<Array<{ qcode: string; system_tag: string; record_count: bigint }>>`
    SELECT qcode, system_tag, COUNT(*)::bigint as record_count
    FROM master_sheet
    WHERE qcode = 'QAC00066'
    GROUP BY qcode, system_tag
    ORDER BY qcode, system_tag
  `;

  if (newAccountMasterSheet.length > 0) {
    console.log('master_sheet data for QAC00066:');
    newAccountMasterSheet.forEach(row => {
      console.log(`  - ${row.qcode} | ${row.system_tag || '(null)'} | ${row.record_count} records`);
    });
  } else {
    console.log('NO master_sheet data found for QAC00066');
  }

  // Query 10: Check if QAC00066 has any PMS linkage
  console.log('\n--- Query 10: Check account_custodian_codes for both accounts ---\n');
  const custodianCodes = await prisma.account_custodian_codes.findMany({
    where: {
      qcode: { in: ['QAC00046', 'QAC00066'] }
    },
    select: { qcode: true, custodian_code: true }
  });

  if (custodianCodes.length > 0) {
    console.log('Custodian code mappings:');
    custodianCodes.forEach(row => {
      console.log(`  - ${row.qcode} -> ${row.custodian_code}`);
    });
  } else {
    console.log('No custodian codes found for either account');
  }

  // Query 11: Check equity_holding data for both accounts
  console.log('\n--- Query 11: equity_holding data for both accounts ---\n');
  const equityHoldings = await prisma.$queryRaw<Array<{ qcode: string; record_count: bigint; latest_date: Date }>>`
    SELECT qcode, COUNT(*)::bigint as record_count, MAX(date) as latest_date
    FROM equity_holding
    WHERE qcode IN ('QAC00046', 'QAC00066')
    GROUP BY qcode
  `;

  if (equityHoldings.length > 0) {
    console.log('Equity holdings:');
    equityHoldings.forEach(row => {
      console.log(`  - ${row.qcode}: ${row.record_count} records (latest: ${row.latest_date?.toISOString().split('T')[0] || 'N/A'})`);
    });
  } else {
    console.log('No equity holdings found for either account');
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`
Old Satidham:
  - Client: QUS0010
  - Account: QAC00046
  - Has master_sheet data: YES (3 system tags)
  - Has PMS data: YES (QAW00041)

New Satidham:
  - Client: QUS00081
  - Account: QAC00066
  - Has master_sheet data: ${newAccountMasterSheet.length > 0 ? 'YES' : 'NO'}
  - System tags: ${newAccountMasterSheet.length > 0 ? newAccountMasterSheet.map(r => r.system_tag).join(', ') : 'None'}
`);

  console.log('='.repeat(80));
  console.log('INVESTIGATION COMPLETE');
  console.log('='.repeat(80));
}

main()
  .catch((e) => {
    console.error('Error running investigation:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
