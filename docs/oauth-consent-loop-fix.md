# Native client consent and refresh repair

Clicking Allow access could return a native client to the same consent page.
For an existing grant, the approval result contained an empty `consent`
object. The DynamoDB sanitizer removed it, so oidc-provider's
`native_client_prompt` check requested consent again. Persisting the saved
grant ID retains the approval on resume.

Separately, token refresh failed with HTTP 500 because grant revocation
markers queried the administration table using `artifactId`. That table uses
`PK` and `SK`. Markers now use a deployment-scoped partition separate from
grant summaries. Storage errors still propagate, and revoked grants remain
blocked after a process restart.

No requested scopes, consent policy, role permissions, or table schema change.
No live records need deleting. These changes require a server deployment;
updating the Windows installer alone cannot repair the deployed consent route.

Verification: 44 focused tests passed covering consent persistence through the
actual sanitizer and DynamoDB marshalling, provider refresh and request-body
replay, administration lifecycle enforcement, and durable revocation markers.
Live development logs independently showed `native_client_prompt` and the
DynamoDB key-schema validation error. Successful live consent and refresh
remain to be verified after deployment.
