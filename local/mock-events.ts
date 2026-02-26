// In-memory event bus to replace SNS/SQS locally

import { BaseEvent } from '../libs/shared/src/events';

type EventHandler = (event: BaseEvent) => Promise<void>;

const subscribers: Record<string, EventHandler[]> = {};
const eventLog: BaseEvent[] = [];

export function subscribe(eventType: string, handler: EventHandler) {
  if (!subscribers[eventType]) {
    subscribers[eventType] = [];
  }
  subscribers[eventType].push(handler);
}

export async function publish(event: BaseEvent) {
  console.log(`[EventBus] Publishing: ${event.eventType} (${event.eventId})`);
  eventLog.push(event);

  const handlers = subscribers[event.eventType] || [];
  for (const handler of handlers) {
    try {
      await handler(event);
    } catch (error) {
      console.error(`[EventBus] Handler failed for ${event.eventType}:`, error);
    }
  }
}

export function getEventLog() {
  return eventLog;
}

export function clearEventLog() {
  eventLog.length = 0;
}
