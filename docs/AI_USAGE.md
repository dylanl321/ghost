# Organization AI Usage

The AI Usage workspace at `/account/ai-usage` combines Cost Explorer actuals with hourly CloudWatch telemetry for Commercial and GovCloud accounts.

## Data Sources

- `AWS/Bedrock`: model invocations, tokens, cache tokens, latency, errors, and throttles.
- `AWS/BedrockMantle`: inferences and tokens by Mantle project and model.
- Cost Explorer: billable and Commercial proforma actual costs for the AWS AI service catalog.
- AWS public Price List: token-based estimates for usage newer than Cost Explorer's `dataThroughDate`.

Prompts and model responses are never collected. Runtime cause enrichment uses Security Lake CloudTrail data. Mantle drill-downs use Bedrock model invocation logging in CloudWatch and retain only error code, model, operation, account, region, request ID, and timestamp. Those CloudWatch events represent all Bedrock causes in scope; they are not project-attributed.

## Deployment

Terraform creates the `ghost-ai-usage` DynamoDB table, grants the ECS task access, and enables the hourly collector. Hourly facts expire after 90 days; daily facts expire after 400 days.

The cross-account `GDMSOrganizationsRole` in member accounts must allow:

```json
{
  "Effect": "Allow",
  "Action": [
    "cloudwatch:GetMetricData",
    "cloudwatch:ListMetrics",
    "logs:StartQuery",
    "logs:GetQueryResults",
    "logs:StopQuery",
    "bedrock:GetModelInvocationLoggingConfiguration"
  ],
  "Resource": "*"
}
```

The existing payer credentials must retain Cost Explorer access. Set `AI_USAGE_COMMERCIAL_REGIONS` and `AI_USAGE_GOVCLOUD_REGIONS` when AI is permitted outside the default US regions.

The first enabled collection performs an idempotent 400-day daily backfill. Administrators can review status and errors or start incremental and full backfills from **Admin > AI & Agents > Usage Collection**. The admin-only trigger is `POST /api/admin/ai-usage/collect`.

## Cost Semantics

- Default: Commercial proforma plus GovCloud billable actuals.
- Billable mode: billable actuals in both environments.
- Bedrock costs that Cost Explorer cannot distinguish by endpoint appear as `bedrock-cost` rather than being assigned to Runtime or Mantle.
- Estimates are shown separately and are omitted when a model/token rate cannot be matched safely.
