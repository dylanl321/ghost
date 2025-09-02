export interface AWSEnclaveData {
  // Primary identifier (Commercial account ID from Organizations)
  accountId: string

  // Organizations data
  accountName?: string
  accountEmail?: string
  accountStatus?: string
  organizationArn?: string
  joinedMethod?: string
  joinedTimestamp?: string
  parentId?: string
  organizationalUnit?: string

  // Important data from DynamoDB
  requestID?: number
  awsAccountEmail?: string;
  awsStandardAccountID?: string;
  awsGovCloudAccountID?: string;
  primaryAccountAdminUsername?: string;
  delegateAccountAdminUsername?: string;
  costManagerUsername?: string;
  estimatedMonthlyCharge?: string;
  linesOfBusiness?: string;
  enclaveStatus?: string;

  // Computed fields
  source?: string;
  true_requestID?: string; // Special field that only shows up on accounts that were originally only in DynamoDB as a 9xxx request ID, but were later added to Appian

  // Other (DynamoDB)
  environment?: string // Note: this field does not seem to be accurate
  costCenter?: string
  technicalContact?: string
  businessContact?: string
  modifiedDate?: string
  tags?: Record<string, string>
  recordLink?: string;
  dc_region?: string;
  dc_subnet_mask?: string;
  isolatedEnclave?: string;
  costManagerName?: string;
  platformType?: string;
  departmentNumber?: string;
  projectName?: string;
  isDirectConnect?: boolean;
  intendedUse?: string;
  BAName?: string;
  region?: string;
  costManagerUsername_guid?: string;
  laaSiteLeadName?: string;
  monitoringCommercialStackSet?: string;
  comments?: string;
  delegateAccountAdminUsername_guid?: string;
  delegateAccountAdminName?: string;
  approvedDataType?: string;
  IAUsername_guid?: string;
  IAName?: string;
  extCollabApproved?: boolean;
  enclaveType?: string;
  dc_cidr?: string;
  laaSiteLeadUsername_guid?: string;
  BAUsername?: string;
  accountAlias?: string;
  isAWSStdEnv?: boolean;
  primaryAccountAdminUsername_guid?: string;
  authorizingManagerUsername_guid?: string;
  authorizingManagerName?: string;
  provisionedWithTf?: boolean;
  SSPtype?: string;
  taskNumber?: string;
  dc_tgw_subnet_mask?: string;
  extCollabDetails?: string;
  dataType?: string;
  projectNumber?: string;
  primaryAccountAdminName?: string;
  laaSiteLeadUsername?: string;
  iamCommercialStackSet?: string;
  BAUsername_guid?: string;
  IAUsername?: string;
  shortenedProjectName?: string;
  authorizingManagerUsername?: string;
  primaryAccountID?: string;
  projectType?: string;
  requestId?: number;
  email?: string;
  name?: string;
  status?: string;

  // NOTE: These either do not exist or do not seem to be needed
  // govCloudAccountId?: string  // Only present if account has GovCloud pairing
  // projectCode?: string
  // accountType?: 'commercial-only' | 'govcloud-paired'
  //createdDate?: string
};
