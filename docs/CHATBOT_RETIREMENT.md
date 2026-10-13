# Chatbot retirement rollout

The Strands chatbot and its stored history are retired. Hosted MCP remains at
`/mcp`, with setup at `/mcp-connections` and capabilities at
`/mcp-connections/details`. Existing MCP OAuth scopes and grants remain valid.
The former MCP setup URLs redirect permanently.

Deploy the chatbot-free application through the existing deployment process
before applying the Terraform resource retirement. This prevents old
application tasks from using tables or queues after their destruction.

The Terraform change removes GHOST's chat threads, messages, async jobs, and
async metrics tables, both chat job queues, and their application IAM and ECS
settings. Applying it retires the stored chat history. Dataset-export queues,
AI usage storage, MCP, OAuth, and shared infrastructure remain.

No live Terraform apply or deployment is part of this change.
