# MCP Tool Simplification

Operational MCP tools resolve friendly account references through one shared scope service. A supplied account that cannot be resolved must fail closed and must never become an organization-wide query. Canonical tools accept scalar or list inputs while compatibility aliases preserve older contracts.

CloudTrail audit searches use the organization trail CloudWatch log group in each partition's management account. Queries are narrowed with the organization/account log-stream prefix before event filters are applied. They do not use CloudTrail `LookupEvents` or Security Lake.

Advanced direct-query guidance is only returned for non-central workload accounts where the authenticated user has an effective IAM Identity Center assignment. Credential issuance independently validates the account and role and requires confirmation.

## Future Account Read Authorization

Centralized MCP reads remain organization-wide for this release. Future work will add an authorization policy at the shared account-scope resolver so explicit and organization-wide reads can be limited to the authenticated user's effective Identity Center accounts. Because all canonical operational tools use the shared resolver, that policy can be enabled without adding authorization logic to each tool.
