export interface AWSEnclaveData {
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
  awsStandardAccountID?: string;
  costManagerUsername_guid?: string;
  laaSiteLeadName?: string;
  delegateAccountAdminUsername?: string;
  monitoringCommercialStackSet?: string;
  primaryAccountAdminUsername?: string;
  comments?: string;
  delegateAccountAdminUsername_guid?: string;
  delegateAccountAdminName?: string;
  approvedDataType?: string;
  requestID?: number;
  IAUsername_guid?: string;
  IAName?: string;
  extCollabApproved?: boolean;
  enclaveType?: string;
  costManagerUsername?: string;
  dc_cidr?: string;
  laaSiteLeadUsername_guid?: string;
  BAUsername?: string;
  accountAlias?: string;
  awsGovCloudAccountID?: string;
  isAWSStdEnv?: boolean;
  primaryAccountAdminUsername_guid?: string;
  authorizingManagerUsername_guid?: string;
  authorizingManagerName?: string;
  provisionedWithTf?: boolean;
  SSPtype?: string;
  linesOfBusiness?: string;
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
  estimatedMonthlyCharge?: string;
  authorizingManagerUsername?: string;
  awsAccountEmail?: string;
  primaryAccountID?: string;
  enclaveStatus?: string;
  projectType?: string;
  accountId?: string;
  accountName?: string;
  accountEmail?: string;
  accountStatus?: string;
  organizationArn?: string;
  joinedMethod?: string;
  joinedTimestamp?: string;
  environment?: string;
  govCloudAccountId?: string;
  requestId?: number;
  email?: string;
  name?: string;
  status?: string;
  source?: string;
};


// export interface AWSEnclaveInfo {
//   // Primary identifier (Commercial account ID from Organizations)
//   accountId: string
  
//   // From Organizations (Commercial)
//   accountName?: string
//   accountEmail?: string
//   accountStatus?: string
//   organizationArn?: string
//   joinedMethod?: string
//   joinedTimestamp?: string
//   parentId?: string
//   organizationalUnit?: string
  
//   // From DynamoDB metadata (GovCloud)
//   govCloudAccountId?: string  // Only present if account has GovCloud pairing
//   requestID?: string
//   projectCode?: string
//   costCenter?: string
//   technicalContact?: string
//   businessContact?: string
//   environment?: string  // dev, test, prod, etc.
//   accountType?: 'commercial-only' | 'govcloud-paired'
//   createdDate?: string
//   modifiedDate?: string
//   tags?: Record<string, string>
  
//   // Computed fields
//   hasGovCloud?: boolean  // true if govCloudAccountId is present
// }

// export interface FullAccountInfo {
//   'org_Arn': string;
//   'org_Email': string;
//   'org_Id': string;
//   'org_JoinedMethod': string;
//   'org_JoinedTimestamp': string;
//   'org_Name': string;
//   'org_Status': string;
//   'org_source': string;
//   'dynamo_BAUsername': string;
//   'dynamo_accountAlias': string;
//   'dynamo_dc_region': string;
//   'dynamo_recordLink': string;
//   'dynamo_dc_subnet_mask': string;
//   'dynamo_isolatedEnclave': string;
//   'dynamo_awsGovCloudAccountID': string;
//   'dynamo_isAWSStdEnv': boolean;
//   'dynamo_platformType': string;
//   'dynamo_primaryAccountAdminUsername-guid': string;
//   'dynamo_authorizingManagerUsername-guid': string;
//   'dynamo_projectName': string;
//   'dynamo_isDirectConnect': boolean;
//   'dynamo_provisionedWithTf': boolean;
//   'dynamo_intendedUse': string;
//   'dynamo_linesOfBusiness': string;
//   'dynamo_awsStandardAccountID': string;
//   'dynamo_region': string;
//   'dynamo_costManagerUsername-guid': string;
//   'dynamo_dc_tgw_subnet_mask': string;
//   'dynamo_delegateAccountAdminUsername': string;
//   'dynamo_dataType': string;
//   'dynamo_monitoringCommercialStackSet': string;
//   'dynamo_primaryAccountAdminUsername': string;
//   'dynamo_laaSiteLeadUsername': string;
//   'dynamo_comments': string;
//   'dynamo_delegateAccountAdminUsername-guid': string;
//   'dynamo_approvedDataType': string;
//   'dynamo_requestID': number;
//   'dynamo_iamCommercialStackSet': string;
//   'dynamo_IAUsername-guid': string;
//   'dynamo_BAUsername-guid': string;
//   'dynamo_IAUsername': string;
//   'dynamo_enclaveType': string;
//   'dynamo_costManagerUsername': string;
//   'dynamo_estimatedMonthlyCharge': string;
//   'dynamo_authorizingManagerUsername': string;
//   'dynamo_awsAccountEmail': string;
//   'dynamo_dc_cidr': string;
//   'dynamo_primaryAccountID': string;
//   'dynamo_enclaveStatus': string;
//   'dynamo_projectType': string;
//   'dynamo_laaSiteLeadUsername-guid': string;
//   '_hasCompleteInfo': boolean;
//   '_missingData': string;
// }