import type { FilteredLogEvent } from "@aws-sdk/client-cloudwatch-logs";
import { 
  CloudWatchLogsClient, 
  PutLogEventsCommand, 
  CreateLogStreamCommand, 
  FilterLogEventsCommand
} from "@aws-sdk/client-cloudwatch-logs";
import { logger } from './logger'

const config = useRuntimeConfig();

// --- Constants ---
const accountId = "461760157232";
const region = "us-gov-west-1";
const logGroupName =
  config.public.environment === "prod"
    ? "/ecs/ghost-dashboard-specific"
    : "/ecs/ghost-dashboard-dev-specific";
const logStreamName = `${logGroupName}/custom-logs`;

// --- Globals ---
let cloudWatchClient: CloudWatchLogsClient | null = null;
let isLoggingSetup = false;

// --- Helper: Timeout wrapper ---
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 10_000
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Operation timed out")), timeoutMs)
    ),
  ]);
}

// --- Initialize CloudWatch client ---
async function initCloudWatchClient(): Promise<void> {
  const credentials = await assumeChildAccountRole("govcloud", accountId);

  cloudWatchClient = new CloudWatchLogsClient({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId!,
      secretAccessKey: credentials.secretAccessKey!,
      sessionToken: credentials.sessionToken,
    },
  });
}

// --- Setup logging (create log stream if needed) ---
async function setupLogging(): Promise<void> {
  if (isLoggingSetup && cloudWatchClient) return;

  try {
    await initCloudWatchClient();

    try {
      await withTimeout(
        cloudWatchClient!.send(
          new CreateLogStreamCommand({ logGroupName, logStreamName })
        ),
        5_000
      );
    } catch (error: any) {
      if ((error instanceof Error ? error.name : "Error") !== "ResourceAlreadyExistsException") {
        logger.error("Error creating log stream:", error);
      }
    }

    isLoggingSetup = true;
  } catch (error) {
    logger.error("Error setting up logging:", error);
    throw error;
  }
}

// --- Log message ---
export async function logMessage(message: string): Promise<void> {
  try {
    await withTimeout(setupLogging(), 8_000);
    const timestamp = Date.now();

    const sendLog = async () => {
      const command = new PutLogEventsCommand({
        logGroupName,
        logStreamName,
        logEvents: [{ message, timestamp }],
      });
      return withTimeout(cloudWatchClient!.send(command), 5_000);
    };

    try {
      await sendLog();
      logger.info("Log sent successfully");
    } catch (error: any) {
      if (
        (error instanceof Error ? error.name : "Error") === "ExpiredTokenException" ||
        (error instanceof Error ? error.message : String(error))?.includes("security token included in the request is expired")
      ) {
        logger.info("Security token expired. Refreshing...");
        isLoggingSetup = false;
        await withTimeout(setupLogging(), 8_000);
        await sendLog();
        logger.debug("Log sent successfully after token refresh");
      } else {
        logger.error("Error sending log:", error);
      }
    }
  } catch (error) {
    logger.error("Failed to log message:", error);
  }
}

// --- Get logs ---
export async function getLogs(durationSeconds: number, filterPattern?: string): Promise<FilteredLogEvent[]> {
  try {
    await withTimeout(setupLogging(), 8_000);

    const allEvents: FilteredLogEvent[] = [];
    let nextToken: string | undefined;
    const startTime = Date.now() - durationSeconds * 1000;

    do {
      const command = new FilterLogEventsCommand({
        logGroupName,
        startTime,
        filterPattern,
        nextToken,
      });

      const response = await cloudWatchClient!.send(command);
      allEvents.push(...(response.events ?? []));
      nextToken = response.nextToken;
    } while (nextToken);

    return allEvents.sort(
      (a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)
    );
  } catch (error) {
    logger.error("Error fetching logs:", error);
    return [];
  }
}
