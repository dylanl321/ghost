# What is GHOST?

GHOST is a web dashboard that gives GD-MS teams one place to see and act on
data about our AWS accounts across the Commercial and GovCloud partitions:
accounts and organization structure, costs, budgets and forecasts, security
findings, pipeline history, AI usage, scheduled reports, notifications, and a
hosted MCP server for AI clients.

## Quick start

Requirements: Node 26 LTS (Node 22.22.2 or newer still works locally) and
npm 11. The container build pins Node 26.13.0 and npm 11.18.0.

```bash
# On the GD-MS network; the lockfile resolves through the internal Nexus mirror
npm ci --legacy-peer-deps

cp .env.example .env   # then fill in values from another contributor
npm run dev            # http://localhost:3000
```

Swagger UI for the API is at `http://localhost:3000/api/swagger-ui`.

Run the tests with `npm test`, or one area at a time with the `test:*`
scripts in `package.json`.

## Developer guide

See [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md) for setup off the
internal network, the full command list, code layout, authentication, adding
API endpoints, tests, the GitLab pipeline and the container image.

Other references:

- [`AGENTS.md`](AGENTS.md): conventions for AI coding agents working in this repo
- [`VERSIONING.md`](VERSIONING.md) and [`CHANGELOG.md`](CHANGELOG.md): releases
- [`server/README.md`](server/README.md): server API patterns and utilities
- [`docs/`](docs/): internal design and operations notes (alerts, notifications,
  DynamoDB configuration, pipeline data, AI usage, MCP tools, shortlinks)
- `app/content/support/`: the in-app help center articles, which are the user
  documentation

## FAQ

### How much does this cost?

The primary cost of GHOST is ECS usage. As of 2025-08-13, each ECS task uses
2 vCPUs and 4 GB of RAM, which costs about $70/month. There is a dev and a prod
deployment, so roughly $140/month. The services auto scale on load, so extra
tasks add to that. Other costs include AI usage (Bedrock), DynamoDB (minimal),
CloudWatch logs and S3.

### How is this deployed?

To ECS with Terraform and a GitLab pipeline. The pipeline builds the image,
pushes it to ECR tagged `$ENV` and `$ENV-<commit sha>`, and forces a new ECS
deployment. Pushes to `dev` deploy automatically; `master` (prod) deploys are
manual. This is _not_ a Terraform module, and the Terraform and CI/CD here are
independent of our usual Terraform setup. The Terraform lives in `/terraform`.
See section 9 of the developer guide for the job-by-job breakdown.

### How are sensitive environment variables handled (AWS credentials, Entra secrets, etc.)?

App secrets are stored in an AWS Secrets Manager secret and passed into the
container as environment variables, configured in the ECS Terraform. When
running GHOST locally, a `.env` file at the repository root stands in for them.
`.env` files are git-ignored and excluded from the Docker build context.
