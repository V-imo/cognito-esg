import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { Table } from "dynamodb-toolbox";
import { env, tracer } from "../util";

export const documentClient = DynamoDBDocumentClient.from(
  tracer.captureAWSv3Client(new DynamoDBClient()),
);

export const CognitoEsgTable = new Table({
  name: env.TABLE_NAME,
  partitionKey: { name: "PK", type: "string" },
  sortKey: { name: "SK", type: "string" },
  documentClient,
});
