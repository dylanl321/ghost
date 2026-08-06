# What is GHOST?

GHOST is a web dashboard to provide a centralized location for useful data and functionality related to our AWS accounts.

## How can I contribute?

See `DEPLOYMENT_STEPS.md` for deployment and environment setup notes.

## Quick start guide

Use Node 22.19 or newer with npm 11. The container build currently pins Node 22.23.1 and npm 11.18.0.

Install the exact locked dependencies:
`npm ci --legacy-peer-deps`

Start the development server on `http://localhost:3000`:
`npm run dev`

You can access the Swagger UI and test your endpoints at `http://localhost:3000/api/swagger-ui`

## User documentation

Work in progress

## FAQ

### How much does this cost?

The primary cost of GHOST is ECS usage. As of 8-13-2025, the ECS tasks that Ghost runs on uses 2vCPUs and 4GB of RAM, which costs about $70/m. There is a dev and prod deployment, so 70 \* 2 = ~$140/m. Additionally, the service are auto scale based on load, which could increase the cost per additional task. This is a rough estimate, the actual cost may vary.

There are be other costs such as AI usage, DynamoDB (minimal), CloudWatch logs, etc.

### How is this deployed?

This is deployed to ECS with Terraform and a GitLab pipeline. The image is first built and pushed to ECR, then retrieved by ECS which creates the container. Note that this is _not_ a Terraform module, and all the TF/CICD in this repo is independent from our typical TF setup. The Terraform for the ECS deployment can be found at `/terraform`

### How are sensitive environment variables handled (such as AWS credentials, Entra secrets, etc.)?

App secrets are stored in an AWS Secret's Manager secret. These secrets get passed into the container as environment variables (this is configured in the ECS Terraform). When running Ghost locally, you need a .env file at the root directory to simulate these environment variables.

## Developer guide

For local development, see the scripts in `package.json` (e.g. `npm run dev`, `npm run check:lint`, `npm run check:types`).
