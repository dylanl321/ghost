/**
 * Activity log messages sent by the browser (/api/logging/activity-logs).
 * Kept free of runtime imports so it can be unit tested.
 */

const MAX_ACTIVITY_MESSAGE_LENGTH = 2000;

/**
 * Prepare an activity message sent by the browser. The USER field is what the
 * activity reports group by, so it is set from the session rather than trusted
 * from the client. Returns null when the message has no USER field.
 */
export function normalizeActivityMessage(message: string, username: string): string | null {
  const singleLine = message.replace(/[\r\n]+/g, " ").trim().slice(0, MAX_ACTIVITY_MESSAGE_LENGTH);
  if (!/USER:[^,\s]*/.test(singleLine)) return null;
  return singleLine.replace(/USER:[^,\s]*/, `USER:${username}`);
}
