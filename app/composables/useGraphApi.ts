// Microsoft Graph is the official REST API for Entra ID
// Use this to get information on groups, roles, users, etc.

// Microsoft Graph API interfaces
interface GraphGroup {
  id: string;
  displayName?: string;
  '@odata.type'?: string;
  mail?: string;
}

interface GraphMemberOfResponse {
  value: GraphGroup[];
  '@odata.nextLink'?: string;
}

// Fetches all groups with detailed information on each one
const fetchAllGroupsRaw = async (accessToken: string) => {
  const allGroups: GraphGroup[] = [];
  let nextUrl = 'https://graph.microsoft.us/v1.0/me/memberOf?$top=999';

  try {
    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const data: GraphMemberOfResponse = await response.json();

      if (!response.ok) throw new Error(JSON.stringify(data));
      
      allGroups.push(...data.value); // Use spread operator to push each individual item into the array

      nextUrl = data['@odata.nextLink'] || '';
    }

    console.log(`Fetched ${allGroups.length} total groups with pagination`);
    return allGroups;
  } catch (error) {
    console.error('Error fetching raw groups:', error);
    throw error;
  }
};

// Take raw group data and parse it into AWS group and distribution group data
const parseAwsGroups = (groups: GraphGroup[]) => {
  const parsedGroups = {
    awsRoleGroups: {} as Record<string, { accountId: string; role: string; groupName: string }>,
    distributionGroups: {} as Record<string, { accountName: string; groupName: string }>
  };

  // Support both AWS-ID_ROLE and AWS-ID-ROLE patterns
  const awsGroupRegex = /^AWS-(\d{12})[_-](.+)$/;
  // Pattern for distribution groups: ACCOUNTNAME.AWS
  const distributionGroupRegex = /^(.+)\.AWS$/i;

  groups.forEach((group: GraphGroup) => {
    const groupName = group.displayName;
    if (!groupName) return;

    try {
      // Check for AWS role groups (Something like "AWS-266632029214_GDSSO_IAMAdmin")
      const awsMatch = groupName.match(awsGroupRegex);
      if (awsMatch) {
        const [, accountId, roleName] = awsMatch;
        parsedGroups.awsRoleGroups[`${accountId}-${roleName}`] = {
          accountId: accountId!,
          role: roleName!,
          groupName
        };
        return;
      }

      // Check for distribution groups (Something like "GDMSCloud.AWS")
      const distroMatch = groupName.match(distributionGroupRegex);
      if (distroMatch) {
        const [, accountName] = distroMatch;
        parsedGroups.distributionGroups[accountName!.toLowerCase()] = {
          accountName: accountName!,
          groupName
        };
        return;
      }
    } catch {
      // Silently ignore groups that don't match our patterns
      console.debug(`Skipped group that couldn't be parsed: ${groupName}`);
    }
  });

  const awsCount = Object.keys(parsedGroups.awsRoleGroups).length;
  const distroCount = Object.keys(parsedGroups.distributionGroups).length;

  console.log(`Parsed ${awsCount} AWS role groups and ${distroCount} distribution groups`);
  return parsedGroups;
};

export const useGraphApi = () => {
  const fetchGroups = async (accessToken: string) => {
    const allGroupsRaw = await fetchAllGroupsRaw(accessToken);
    const filteredGroups = parseAwsGroups(allGroupsRaw);

    // const accountInfoMap = await fetchBulkAccountInfo();

    return filteredGroups;
  };

  return {
    fetchGroups
  };
};
