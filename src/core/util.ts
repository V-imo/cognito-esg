import { Logger } from "@aws-lambda-powertools/logger";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { z } from "zod";

export const env = z
  .object({
    SERVICE: z.string(),
    USER_POOL_ID: z.string().default(""),
    COGNITO_CLIENT_ID: z.string().default(""),
    TABLE_NAME: z.string().default(""),
    EVENT_BUS_NAME: z.string().default(""),
    STAGE: z.string().default(""),
  })
  .parse(process.env);

export const logger = new Logger({ serviceName: env.SERVICE });
export const tracer = new Tracer({ serviceName: env.SERVICE });

export const ignoreOplockError = (error: Error) => {
  if (error.name === "ConditionalCheckFailedException") {
    return;
  }
  throw error;
};
