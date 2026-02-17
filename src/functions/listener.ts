import { EventBridgeEvent } from "aws-lambda"

type EventEnvelope = {
  type: string;
  data: Record<string, any>;
  timestamp: number;
  source: string;
  id: string;
};

export const handler = async (
  event: EventBridgeEvent<string, EventEnvelope>,
) => {
  }

