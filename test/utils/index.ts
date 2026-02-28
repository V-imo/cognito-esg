import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import { backOff } from "exponential-backoff";

export const eventualAssertion = async <T>(
  fn: () => Promise<T>,
  assertion?: (res: T) => void
): Promise<T> => {
  return backOff(
    async () => {
      const res = await fn();
      assertion?.(res);
      return res;
    },
    {
      maxDelay: 50000,
    }
  );
};

export class EventBridge {
  private eventBridgeClient: EventBridgeClient;

  constructor(private eventBusName: string) {
    this.eventBridgeClient = new EventBridgeClient({});
    this.eventBusName = eventBusName;
  }

  async send(event: PutEventsCommand) {
    return this.eventBridgeClient.send(event);
  }
}
