import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { tracer } from "../core/util";

const eventBridge = tracer.captureAWSv3Client(new EventBridgeClient());