import { EventBridgeEvent } from "aws-lambda"
import {
  EmployeeCreatedEvent,
  EmployeeDeletedEvent,
  InspectorCreatedEvent,
  InspectorDeletedEvent,
} from "vimo-events";
import { Employee } from "../core/employee";
import { Inspector } from "../core/inspector";
import { logger } from "../core/util";

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
  if (event.detail.source !== process.env.SERVICE) {
    logger.warn("Ignoring event from unauthorized source", {
      detailType: event["detail-type"],
      source: event.detail.source,
    });
    return { ok: true, ignored: true };
  }

  switch (event["detail-type"]) {
    case EmployeeCreatedEvent.type: {
      const parsed = EmployeeCreatedEvent.parse(event.detail);
      await Employee.update({
        agencyId: parsed.data.agencyId,
        email: parsed.data.email,
        firstname: parsed.data.given_name,
        lastname: parsed.data.family_name,
        timezone: "UTC",
        oplock: parsed.timestamp,
      });
      break;
    }
    case EmployeeDeletedEvent.type: {
      const parsed = EmployeeDeletedEvent.parse(event.detail);
      await Employee.del(parsed.data.agencyId, parsed.data.email);
      break;
    }
    case InspectorCreatedEvent.type: {
      const parsed = InspectorCreatedEvent.parse(event.detail);
      await Inspector.update({
        agencyId: parsed.data.agencyId,
        email: parsed.data.email,
        firstname: parsed.data.given_name,
        lastname: parsed.data.family_name,
        timezone: "UTC",
        oplock: parsed.timestamp,
      });
      break;
    }
    case InspectorDeletedEvent.type: {
      const parsed = InspectorDeletedEvent.parse(event.detail);
      await Inspector.del(parsed.data.agencyId, parsed.data.email);
      break;
    }
    default:
      logger.warn("Ignoring unsupported event type", {
        detailType: event["detail-type"],
      });
  }

  return { ok: true };
}
