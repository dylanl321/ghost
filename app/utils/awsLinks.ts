// Environment-specific login link generators
export const createCommercialLoginLink = (): string => {
  return 'https://gdms.awsapps.com/start'
}

export const createGovCloudLoginLink = (): string => {
  return 'https://start.us-gov-west-1.us-gov-home.awsapps.com'
}