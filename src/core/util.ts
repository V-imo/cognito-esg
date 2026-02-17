import { Logger } from "@aws-lambda-powertools/logger";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { z } from "zod";

export const env = z
  .object({
    SERVICE: z.string(),
    USER_POOL_ID: z.string(),
    COGNITO_CLIENT_ID: z.string(),
  })
  .parse(process.env);

export const logger = new Logger({ serviceName: env.SERVICE });
export const tracer = new Tracer({ serviceName: env.SERVICE });
