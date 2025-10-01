// Microsoft Graph is the official REST API for Entra ID
// Use this to get information on groups, roles, users, etc.

// Microsoft Graph API interfaces
interface GraphGroup {
  displayName?: string;
  id?: string;
  '@odata.type'?: string;
  mail?: string;
}

interface GraphMemberOfResponse {
  value: GraphGroup[];
  '@odata.nextLink'?: string;
}

// Fetches all groups with detailed information on each one
const fetchAllGroupsRaw = async (accessToken: string) => {
  const allGroups: GraphGroup[] = []
  let nextUrl = 'https://graph.microsoft.us/v1.0/me/memberOf?$top=999'

  try {
    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      const data: GraphMemberOfResponse = await response.json()

      if (!response.ok) throw new Error(JSON.stringify(data))
      
      allGroups.push(...data.value) // Use spread operator to push each individual item into the array

      nextUrl = data['@odata.nextLink'] || ''
    }

    console.log(`Fetched ${allGroups.length} total groups with pagination`)
    return allGroups
  } catch (error) {
    console.error('Error fetching raw groups:', error)
    throw error
  }
}

// Take raw group data and parse it into AWS group and distribution group data
const parseAwsGroups = (groups: GraphGroup[]) => {
  const parsedGroups = {
    awsRoleGroups: {} as Record<string, { accountId: string; role: string; groupName: string }>,
    distributionGroups: {} as Record<string, { accountName: string; groupName: string }>
  }

  // Support both AWS-ID_ROLE and AWS-ID-ROLE patterns
  const awsGroupRegex = /^AWS-(\d{12})[_-](.+)$/
  // Pattern for distribution groups: ACCOUNTNAME.AWS
  const distributionGroupRegex = /^(.+)\.AWS$/i

  groups.forEach((group: GraphGroup) => {
    const groupName = group.displayName
    if (!groupName) return

    try {
      // Check for AWS role groups (Something like "AWS-266632029214_GDSSO_IAMAdmin")
      const awsMatch = groupName.match(awsGroupRegex)
      if (awsMatch) {
        const [, accountId, roleName] = awsMatch
        parsedGroups.awsRoleGroups[`${accountId}-${roleName}`] = {
          accountId: accountId!,
          role: roleName!,
          groupName
        }
        return
      }

      // Check for distribution groups (Something like "GDMSCloud.AWS")
      const distroMatch = groupName.match(distributionGroupRegex)
      if (distroMatch) {
        const [, accountName] = distroMatch
        parsedGroups.distributionGroups[accountName!.toLowerCase()] = {
          accountName: accountName!,
          groupName
        }
        return
      }
    } catch {
      // Silently ignore groups that don't match our patterns
      console.debug(`Skipped group that couldn't be parsed: ${groupName}`)
    }
  })

  const awsCount = Object.keys(parsedGroups.awsRoleGroups).length
  const distroCount = Object.keys(parsedGroups.distributionGroups).length

  console.log(`Parsed ${awsCount} AWS role groups and ${distroCount} distribution groups`)
  return parsedGroups
}

export const useGraphApi = () => {
  const fetchAllGroupsWithPagination = async (accessToken: string): Promise<GraphGroup[]> => {
    const allGroups: GraphGroup[] = []
    let nextUrl = 'https://graph.microsoft.us/v1.0/me/memberOf?$top=999'

    console.log("in fetchAllGroupsWithPagination with access token (first 20 characters): ", accessToken.slice(0, 20))

    try {
      while (nextUrl) {
        const response = await fetch(nextUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        })

        if (!response.ok) {
          throw new Error(`Graph API Error: ${response.statusText}`)
        }

        const data: GraphMemberOfResponse = await response.json()
        allGroups.push(...data.value)

        nextUrl = data['@odata.nextLink'] || ''

        console.log("here is the response from the /me/memberOf endpoint: ", data)
      }

      console.log(`Fetched ${allGroups.length} total groups with pagination`)
      return allGroups
    } catch (error) {
      console.error('Error fetching groups with pagination:', error)
      throw error
    }
  }

  const fetchGroups = async (accessToken: string) => {
    const allGroupsRaw = await fetchAllGroupsRaw(accessToken)
    const filteredGroups = parseAwsGroups(allGroupsRaw)

    // const accountInfoMap = await fetchBulkAccountInfo();

    return filteredGroups
  }

  const searchUsers = async (accessToken: string, searchQuery: string, top: number = 25) => {
    try {
      const cleanQuery = searchQuery.trim().replace(/'/g, "''") // Escape single quotes
      const results = new Map() // Use Map to avoid duplicates
      
      // Helper function to add results while avoiding duplicates
      const addResults = (newResults: any[]) => {
        newResults.forEach(user => {
          if (!results.has(user.id)) {
            results.set(user.id, user)
          }
        })
      }

      // Helper function to make API call
      const makeSearchCall = async (filter: string) => {
        try {
          const response = await fetch(
            `https://graph.microsoft.us/v1.0/users?$filter=${encodeURIComponent(filter)}&$top=${top}&$select=id,displayName,userPrincipalName,mail,jobTitle,department`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          )

          if (response.ok) {
            const data = await response.json()
            return data.value || []
          }
        } catch (err) {
          console.warn('Search call failed:', err)
        }
        return []
      }

      // 1. Search by display name (startswith - most relevant results first)
      let filter = `startswith(displayName,'${cleanQuery}')`
      let searchResults = await makeSearchCall(filter)
      addResults(searchResults)

      // 2. Search by email/userPrincipalName (startswith)
      filter = `startswith(userPrincipalName,'${cleanQuery}')`
      searchResults = await makeSearchCall(filter)
      addResults(searchResults)

      // 3. Search by mail field (startswith) 
      filter = `startswith(mail,'${cleanQuery}')`
      searchResults = await makeSearchCall(filter)
      addResults(searchResults)

      // 4. If query contains space, try searching individual parts
      if (cleanQuery.includes(' ')) {
        const parts = cleanQuery.split(' ').filter(part => part.length > 1)
        
        for (const part of parts) {
          // Search each part in display name
          filter = `contains(displayName,'${part}')`
          searchResults = await makeSearchCall(filter)
          addResults(searchResults)
        }

        // Also try "Last, First" format common in Entra
        if (parts.length >= 2) {
          const lastFirst = `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`
          filter = `startswith(displayName,'${lastFirst}')`
          searchResults = await makeSearchCall(filter)
          addResults(searchResults)
        }
      }

      // 5. Broader contains searches if we don't have many results yet
      if (results.size < 5) {
        // Contains search in display name
        filter = `contains(displayName,'${cleanQuery}')`
        searchResults = await makeSearchCall(filter)
        addResults(searchResults)

        // Contains search in userPrincipalName
        filter = `contains(userPrincipalName,'${cleanQuery}')`
        searchResults = await makeSearchCall(filter)
        addResults(searchResults)

        // Contains search in mail
        filter = `contains(mail,'${cleanQuery}')`
        searchResults = await makeSearchCall(filter)
        addResults(searchResults)
      }

      // 6. If still limited results and single word, try searching for it as part of names
      if (results.size < 3 && !cleanQuery.includes(' ') && cleanQuery.length > 2) {
        // Search for names that contain the query anywhere (like middle names, nicknames)
        const broadFilters = [
          `contains(displayName,' ${cleanQuery}')`, // Space before to catch middle names
          `contains(displayName,', ${cleanQuery}')`, // After comma for first names in "Last, First" format
          `endswith(displayName,' ${cleanQuery}')`, // Ending with the query
        ]

        for (const broadFilter of broadFilters) {
          searchResults = await makeSearchCall(broadFilter)
          addResults(searchResults)
        }
      }

      // Convert Map back to array and limit results
      const finalResults = Array.from(results.values()).slice(0, top)
      
      console.log(`Search for "${searchQuery}" returned ${finalResults.length} users`)
      return finalResults

    } catch (error) {
      console.error('Error searching users:', error)
      throw error
    }
  }

  const fetchUserProfile = async (userPrincipalName: string, accessToken: string) => {
    const url = `https://graph.microsoft.us/v1.0/users/${encodeURIComponent(userPrincipalName)}?$select=id,displayName,userPrincipalName,mail,jobTitle,department,businessPhones,mobilePhone,officeLocation,manager`
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch user profile: ${response.statusText}`)
    }
    
    return await response.json()
  }

  const fetchUserMemberOf = async (accessToken: string, userPrincipalName: string) => {
    const allGroups: GraphGroup[] = []
    let nextUrl = `https://graph.microsoft.us/v1.0/users/${encodeURIComponent(userPrincipalName)}/memberOf?$top=999`

    try {
      while (nextUrl) {
        const response = await fetch(nextUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        })

        const data: GraphMemberOfResponse = await response.json()

        if (!response.ok) throw new Error(JSON.stringify(data))
        
        allGroups.push(...data.value)

        nextUrl = data['@odata.nextLink'] || ''
      }

      return allGroups
    } catch (error) {
      console.error('Error fetching user memberOf:', error)
      throw error
    }
  }

  const fetchGroupDetails = async (accessToken: string, groupId: string) => {
    const url = `https://graph.microsoft.us/v1.0/groups/${encodeURIComponent(groupId)}?$select=id,displayName,description,mail,mailEnabled,securityEnabled`
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch group details: ${response.statusText}`)
    }
    
    return await response.json()
  }

  const fetchAllGroups = async (accessToken: string, searchQuery?: string, top: number = 100) => {
    try {
      let url = `https://graph.microsoft.us/v1.0/groups?$top=${top}&$select=id,displayName,description,mailEnabled,securityEnabled,createdDateTime`
      
      if (searchQuery) {
        const filter = `startswith(displayName,'${searchQuery}')`
        url += `&$filter=${encodeURIComponent(filter)}`
      }

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`Graph API Error: ${response.statusText}`)
      }

      const data = await response.json()
      return data.value || []
    } catch (error) {
      console.error('Error fetching all groups:', error)
      throw error
    }
  }

  return {
    fetchGroups,
    searchUsers,
    fetchUserProfile,
    fetchUserMemberOf,
    fetchGroupDetails,
    fetchAllGroups,
    fetchAllGroupsWithPagination
  }
}
