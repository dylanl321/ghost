import type { FilteredLogEvent, LogStream } from "@aws-sdk/client-cloudwatch-logs";
import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
  DescribeLogStreamsCommand,
  DescribeLogGroupsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { logger } from "./logger";
import { assumeChildAccountRole } from "./credentials/awsAccountCredentials";

const config = useRuntimeConfig();

// Strands ECS service log configuration
const STRANDS_ACCOUNT_ID = "461760157232"; // Deployment account
const STRANDS_REGION = "us-gov-west-1";

// Log group prefix for Strands ECS service (each container has its own log group)
const STRANDS_LOG_GROUP_PREFIX = "/ecs/lz-mcp-servers-dev";
const STRANDS_CLUSTER = "lz-mcp-servers-dev";

// Default containers to monitor (can be overridden by specifying specific log groups)
const DEFAULT_CONTAINERS = ["agent", "mcp-aws-api-mcp-master", "mcp-govcloud-master"];

// Cache the CloudWatch client
let strandsCloudWatchClient: CloudWatchLogsClient | null = null;

/**
 * Initialize CloudWatch Logs client for Strands service
 */
async function initStrandsCloudWatchClient(): Promise<CloudWatchLogsClient> {
  if (strandsCloudWatchClient) {
    return strandsCloudWatchClient;
  }

  try {
    const credentials = await assumeChildAccountRole("govcloud", STRANDS_ACCOUNT_ID);

    strandsCloudWatchClient = new CloudWatchLogsClient({
      region: STRANDS_REGION,
      credentials: {
        accessKeyId: credentials.accessKeyId!,
        secretAccessKey: credentials.secretAccessKey!,
        sessionToken: credentials.sessionToken,
      },
    });

    return strandsCloudWatchClient;
  } catch (error) {
    logger.error("Error initializing Strands CloudWatch client:", error);
    throw error;
  }
}

/**
 * Refresh the CloudWatch client (for expired tokens)
 */
async function refreshStrandsCloudWatchClient(): Promise<void> {
  strandsCloudWatchClient = null;
  await initStrandsCloudWatchClient();
}

export interface StrandsLogQuery {
  startTime?: number; // Unix timestamp in milliseconds
  endTime?: number; // Unix timestamp in milliseconds
  filterPattern?: string; // CloudWatch Logs filter pattern
  logStreamNames?: string[]; // Specific log streams to query
  limit?: number; // Max number of events to return
  containers?: string[]; // Specific containers to query (e.g., ["agent", "mcp-aws-api-mcp-master"])
}

/**
 * List available Strands container log groups
 */
export async function listStrandsLogGroups(): Promise<string[]> {
  try {
    const client = await initStrandsCloudWatchClient();

    const command = new DescribeLogGroupsCommand({
      logGroupNamePrefix: STRANDS_LOG_GROUP_PREFIX,
      limit: 50,
    });

    const response = await client.send(command);
    return (response.logGroups || [])
      .map((lg) => lg.logGroupName || "")
      .filter(Boolean);
  } catch (error) {
    logger.error("Error listing Strands log groups:", error);
    return [];
  }
}

/**
 * List all ECS log groups (for debugging)
 */
export async function listAvailableLogGroups(): Promise<string[]> {
  try {
    const client = await initStrandsCloudWatchClient();

    const command = new DescribeLogGroupsCommand({
      logGroupNamePrefix: "/ecs/",
      limit: 50,
    });

    const response = await client.send(command);
    return (response.logGroups || [])
      .map((lg) => lg.logGroupName || "")
      .filter(Boolean);
  } catch (error) {
    logger.error("Error listing log groups:", error);
    return [];
  }
}

/**
 * Get logs from Strands ECS service (queries multiple container log groups)
 */
export async function getStrandsLogs(
  query: StrandsLogQuery = {}
): Promise<FilteredLogEvent[]> {
  try {
    const client = await initStrandsCloudWatchClient();

    // Default to querying just the "agent" container (main Strands service)
    const containers = query.containers || ["agent"];

    // Build log group names from container names
    const logGroups = containers.map(
      (container) => `${STRANDS_LOG_GROUP_PREFIX}/${container}`
    );

    logger.info(`Fetching logs from containers: ${containers.join(", ")}`);

    const allEvents: FilteredLogEvent[] = [];

    // Default to last 7 days if no time range specified
    const startTime = query.startTime || Date.now() - 7 * 24 * 60 * 60 * 1000;
    const endTime = query.endTime || Date.now();

    // Query each log group
    for (const logGroupName of logGroups) {
      let nextToken: string | undefined;
      let logGroupEvents: FilteredLogEvent[] = [];

      try {
        do {
          const command = new FilterLogEventsCommand({
            logGroupName,
            startTime,
            endTime,
            filterPattern: query.filterPattern,
            logStreamNames: query.logStreamNames,
            nextToken,
            limit: query.limit ? Math.min(query.limit, 10000) : undefined,
          });

          try {
            const response = await client.send(command);
            logGroupEvents.push(...(response.events ?? []));
            nextToken = response.nextToken;

            // If limit specified, stop when reached
            if (query.limit && logGroupEvents.length >= query.limit) {
              break;
            }
          } catch (error: any) {
            // Handle expired token
            if (
              (error instanceof Error ? error.name : "Error") === "ExpiredTokenException" ||
              (error instanceof Error ? error.message : String(error))?.includes("security token included in the request is expired")
            ) {
              logger.warn("Security token expired. Refreshing...");
              await refreshStrandsCloudWatchClient();
              // Retry once after refresh
              const retryClient = await initStrandsCloudWatchClient();
              const response = await retryClient.send(command);
              logGroupEvents.push(...(response.events ?? []));
              nextToken = response.nextToken;
            } else {
              throw error;
            }
          }
        } while (nextToken);

        logger.info(
          `Fetched ${logGroupEvents.length} events from ${logGroupName}`
        );
        allEvents.push(...logGroupEvents);
      } catch (error: any) {
        // If a specific log group doesn't exist, log but continue with others
        if (
          (error instanceof Error ? error.name : "Error") === "ResourceNotFoundException" ||
          (error instanceof Error ? error.message : String(error))?.includes("log group does not exist")
        ) {
          logger.warn(`Log group ${logGroupName} not found, skipping...`);
          continue;
        }
        throw error;
      }
    }

    // Sort by timestamp descending (most recent first)
    return allEvents.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  } catch (error: any) {
    logger.error("Error fetching Strands logs:", error);

    // If there's an error, try to list available log groups to help debug
    if (
      (error instanceof Error ? error.name : "Error") === "ResourceNotFoundException" ||
      (error instanceof Error ? error.message : String(error))?.includes("log group does not exist")
    ) {
      logger.error(
        `Some log groups not found. Attempting to list available Strands containers...`
      );

      try {
        const availableLogGroups = await listStrandsLogGroups();
        logger.error(
          `Available Strands log groups: ${availableLogGroups.join(", ") || "None found"}`
        );

        // Enhance error message with available options
        const containers = availableLogGroups.map((lg) =>
          lg.replace(`${STRANDS_LOG_GROUP_PREFIX}/`, "")
        );
        const enhancedError: any = new Error(
          `Some Strands log groups not found. Available containers: ${containers.join(", ") || "None found"}`
        );
        enhancedError.name = (error instanceof Error ? error.name : "Error");
        enhancedError.availableContainers = containers;
        throw enhancedError;
      } catch (listError) {
        // If listing also fails, just throw the original error
        logger.error("Failed to list available log groups:", listError);
        throw error;
      }
    }

    throw error;
  }
}

/**
 * Get log streams from Strands ECS service
 */
export async function getStrandsLogStreams(
  container: string = "agent",
  limit: number = 50
): Promise<LogStream[]> {
  const logGroupName = `${STRANDS_LOG_GROUP_PREFIX}/${container}`;
  try {
    const client = await initStrandsCloudWatchClient();

    const allStreams: LogStream[] = [];
    let nextToken: string | undefined;

    do {
      const command = new DescribeLogStreamsCommand({
        logGroupName,
        orderBy: "LastEventTime",
        descending: true,
        limit: Math.min(limit, 50),
        nextToken,
      });

      try {
        const response = await client.send(command);
        allStreams.push(...(response.logStreams ?? []));
        nextToken = response.nextToken;

        // Stop when we have enough streams
        if (allStreams.length >= limit) {
          break;
        }
      } catch (error: any) {
        // Handle expired token
        if (
          (error instanceof Error ? error.name : "Error") === "ExpiredTokenException" ||
          (error instanceof Error ? error.message : String(error))?.includes("security token included in the request is expired")
        ) {
          logger.warn("Security token expired. Refreshing...");
          await refreshStrandsCloudWatchClient();
          // Retry once after refresh
          const retryClient = await initStrandsCloudWatchClient();
          const response = await retryClient.send(command);
          allStreams.push(...(response.logStreams ?? []));
          nextToken = response.nextToken;
        } else {
          throw error;
        }
      }
    } while (nextToken && allStreams.length < limit);

    return allStreams.slice(0, limit);
  } catch (error) {
    logger.error("Error fetching Strands log streams:", error);
    throw error;
  }
}

/**
 * Parse log level from log message
 */
export function parseLogLevel(message: string): string {
  const upperMessage = message.toUpperCase();
  if (upperMessage.includes("ERROR")) return "ERROR";
  if (upperMessage.includes("WARN")) return "WARN";
  if (upperMessage.includes("INFO")) return "INFO";
  if (upperMessage.includes("DEBUG")) return "DEBUG";
  return "INFO";
}

/**
 * Try to parse JSON from log message
 */
export function tryParseJSON(message: string): any {
  try {
    return JSON.parse(message);
  } catch {
    return null;
  }
}

/**
 * Format log event for display
 */
export function formatLogEvent(event: FilteredLogEvent) {
  const parsedJSON = tryParseJSON(event.message || "");

  return {
    timestamp: event.timestamp,
    logStreamName: event.logStreamName,
    message: event.message,
    eventId: event.eventId,
    level: parseLogLevel(event.message || ""),
    parsedJSON,
    isJSON: !!parsedJSON,
  };
}

/**
 * Get current Strands log configuration
 */
export function getStrandsLogConfig() {
  return {
    accountId: STRANDS_ACCOUNT_ID,
    region: STRANDS_REGION,
    logGroupPrefix: STRANDS_LOG_GROUP_PREFIX,
    cluster: STRANDS_CLUSTER,
    defaultContainers: DEFAULT_CONTAINERS,
    availableContainers: [
      "agent",
      "mcp-aws-api-mcp-master",
      "mcp-aws-pricing",
      "mcp-billing-cost-mgmt",
      "mcp-cloudtrail",
      "mcp-govcloud-master",
      "mcp-well-architected-security",
    ],
  };
}

// Export constants for use in other files
export const STRANDS_LOG_CONFIG = {
  accountId: STRANDS_ACCOUNT_ID,
  region: STRANDS_REGION,
  logGroupPrefix: STRANDS_LOG_GROUP_PREFIX,
  cluster: STRANDS_CLUSTER,
};
