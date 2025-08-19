// import { defineEventHandler, createError } from 'h3';
import { getBulkAccountInfo } from '../utils/bulkAccountInfo';

export default defineEventHandler(async (_event) => {
  try {
    console.log('Fetching bulk account information...');
    
    const accountInfoMap = await getBulkAccountInfo();
    
    console.log(`Retrieved ${Object.keys(accountInfoMap).length} accounts in bulk`);
    
    // Return the old format for backward compatibility
    return {
      accounts: accountInfoMap,
      timestamp: Date.now(),
      count: Object.keys(accountInfoMap).length
    };
  } catch (error: unknown) {
    console.error('Error in bulk-account-info:', error);
    return createError({
      statusCode: 500,
      message: 'Failed to fetch bulk account info',
      cause: String(error)
    });
  }
}); 