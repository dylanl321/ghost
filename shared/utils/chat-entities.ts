export const STANDALONE_AWS_ACCOUNT_ID_REGEX = /(?<![A-Za-z0-9-])(\d{12})(?![A-Za-z0-9-])/g

export function findStandaloneAwsAccountIds(value: string): string[] {
  return [...value.matchAll(STANDALONE_AWS_ACCOUNT_ID_REGEX)].map(match => match[1]!)
}
