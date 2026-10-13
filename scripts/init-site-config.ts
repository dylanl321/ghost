/**
 * Initialize Site Configuration in DynamoDB
 *
 * Run this script to populate the ghost-site-config table with default values:
 * npx tsx scripts/init-site-config.ts
 */

import { initializeSiteConfig } from '../server/utils/site-config';

async function main() {
  try {
    console.log('Initializing site configuration in DynamoDB...');
    await initializeSiteConfig();
    console.log('✓ Site configuration initialized successfully!');
    console.log('✓ All default settings have been written to the ghost-site-config table.');
    console.log('\nYou can now:');
    console.log('  - View settings at: http://localhost:3000/admin (System Settings)');
    console.log('  - Use the report scheduler feature');
    console.log('  - Customize feature flags and service URLs');
  } catch (error: any) {
    console.error('✗ Failed to initialize site configuration:', error.message);

    if (error.message.includes('credentials')) {
      console.error('\nMake sure AWS credentials are configured in your .env file:');
      console.error('  - AWS_GOVCLOUD_ACCESS_KEY_ID');
      console.error('  - AWS_GOVCLOUD_SECRET_ACCESS_KEY');
      console.error('  - AWS_GOVCLOUD_REGION');
      console.error('  - AWS_DEPLOYMENT_ACCOUNT_ID');
    }

    if (error.message.includes('not found') || error.name === 'ResourceNotFoundException') {
      console.error('\nThe ghost-site-config DynamoDB table does not exist.');
      console.error('Please create it using Terraform or AWS console first.');
      console.error('\nTable structure:');
      console.error('  - Partition Key: PK (String)');
      console.error('  - Sort Key: SK (String)');
      console.error('  - Billing Mode: PAY_PER_REQUEST or Provisioned');
    }

    process.exit(1);
  }
}

main();
