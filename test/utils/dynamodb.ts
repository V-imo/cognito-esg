import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { eventualAssertion } from "./index";

type DynamoRecord = Record<string, unknown>;

export class DynamoTableClient {
  private readonly client = new DynamoDBClient({});

  constructor(private readonly tableName: string) {}

  async getItem(PK: string, SK: string): Promise<DynamoRecord | undefined> {
    const res = await this.client.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: {
          PK: { S: PK },
          SK: { S: SK },
        },
      }),
    );

    if (!res.Item) {
      return undefined;
    }

    return unmarshall(res.Item) as DynamoRecord;
  }

  async expectItemEventually(
    PK: string,
    SK: string,
    assertion?: (item: DynamoRecord) => void,
  ) {
    return eventualAssertion(async () => this.getItem(PK, SK), (item) => {
      expect(item).toBeDefined();
      assertion?.(item as DynamoRecord);
    });
  }

  async expectNoItemEventually(PK: string, SK: string) {
    return eventualAssertion(async () => this.getItem(PK, SK), (item) => {
      expect(item).toBeUndefined();
    });
  }
}
