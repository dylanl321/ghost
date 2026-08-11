# Organization AI Usage

The AI Usage workspace at `/account/ai-usage` combines Cost Explorer actuals with hourly CloudWatch telemetry for Commercial and GovCloud accounts.

## Data Sources

- `AWS/Bedrock`: model invocations, tokens, cache tokens, latency, errors, and throttles.
- `AWS/BedrockMantle`: inferences and tokens by Mantle project and model.
- Cost Explorer: billable and Commercial proforma actual costs for the AWS AI service catalog.
- AWS public Price List: token-based estimates for usage newer than Cost Explorer's `dataThroughDate`.

Prompts and model responses are never collected. Bedrock model invocation logging and Mantle CloudTrail data events are not required.

## Deployment

Terraform creates the `ghost-ai-usage` DynamoDB table, grants the ECS task access, and enables the hourly collector. Hourly facts expire after 90 days; daily facts expire after 400 days.

The cross-account `GDMSOrganizationsRole` in member accounts must allow:

```json
{
  "Effect": "Allow",
  "Action": [
    "cloudwatch:GetMetricData",
    "cloudwatch:ListMetrics"
  ],
  "Resource": "*"
}
```

The existing payer credentials must retain Cost Explorer access. Set `AI_USAGE_COMMERCIAL_REGIONS` and `AI_USAGE_GOVCLOUD_REGIONS` when AI is permitted outside the default US regions.

The first enabled collection performs an idempotent 400-day daily backfill. Administrators can also start a bounded backfill with `POST /api/ai-usage/collect` and `{ "backfillDays": 400 }`.

## Cost Semantics

- Default: Commercial proforma plus GovCloud billable actuals.
- Billable mode: billable actuals in both environments.
- Bedrock costs that Cost Explorer cannot distinguish by endpoint appear as `bedrock-cost` rather than being assigned to Runtime or Mantle.
- Estimates are shown separately and are omitted when a model/token rate cannot be matched safely.
