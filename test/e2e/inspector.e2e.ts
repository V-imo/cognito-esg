import fs from "fs";
import {
  ServerlessSpyListener,
  createServerlessSpyListener,
} from "serverless-spy";
import {
  InspectorCreatedEvent,
  InspectorDeletedEvent,
} from "vimo-events";
import { ServerlessSpyEvents } from "../spy";
import { DynamoTableClient, EventBridge } from "../utils";
import {
  generateInspectorCreatedEventData,
  generateInspectorDeletedEventData,
} from "../utils/generator";

type TestOutputs = {
  EventBusName: string;
  ServerlessSpyWsUrl: string;
  UsersBffTableName: string;
  ServiceName?: string;
};

const [stackName, outputs] = Object.entries(
  JSON.parse(fs.readFileSync("test.output.json", "utf8")) as Record<
    string,
    TestOutputs
  >,
)[0];

const { EventBusName, ServerlessSpyWsUrl, UsersBffTableName } = outputs;
const ServiceName =
  outputs.ServiceName ??
  (stackName.includes("-") ? stackName.slice(stackName.indexOf("-") + 1) : stackName);

process.env.EVENT_BUS_NAME = EventBusName;
process.env.SERVICE = ServiceName;

const eventBridge = new EventBridge(EventBusName);
const tableClient = new DynamoTableClient(UsersBffTableName);

let serverlessSpyListener: ServerlessSpyListener<ServerlessSpyEvents>;
beforeEach(async () => {
  serverlessSpyListener =
    await createServerlessSpyListener<ServerlessSpyEvents>({
      serverlessSpyWsUrl: ServerlessSpyWsUrl,
    });
}, 10000);

afterEach(async () => {
  serverlessSpyListener.stop();
});

jest.setTimeout(30000);

const waitForBusEvent = async (detailType: string) => {
  await serverlessSpyListener.waitForEventBridgeEventBus<any>({
    condition: ({ detail, detailType: currentDetailType }) =>
      currentDetailType === detailType && detail.source === ServiceName,
  });
};

test("should persist inspector on inspector-created event", async () => {
  const inspector = generateInspectorCreatedEventData();
  const PK = `AGENCY#${inspector.agencyId}`;
  const SK = `INSPECTOR#${inspector.email}`;

  await eventBridge.send(InspectorCreatedEvent.build(inspector));
  await waitForBusEvent(InspectorCreatedEvent.type);

  await tableClient.expectItemEventually(PK, SK, (item) => {
    expect(item.agencyId).toBe(inspector.agencyId);
    expect(item.email).toBe(inspector.email);
    expect(item.firstname).toBe(inspector.given_name);
    expect(item.lastname).toBe(inspector.family_name);
    expect(item.oplock).toEqual(expect.any(Number));
  });
});

test("should remove inspector on inspector-deleted event", async () => {
    const inspector = generateInspectorCreatedEventData();
    const PK = `AGENCY#${inspector.agencyId}`;
    const SK = `INSPECTOR#${inspector.email}`;

    await eventBridge.send(InspectorCreatedEvent.build(inspector));
    await waitForBusEvent(InspectorCreatedEvent.type);
    await tableClient.expectItemEventually(PK, SK);

    const deletion = generateInspectorDeletedEventData({
      agencyId: inspector.agencyId,
      email: inspector.email,
    });
    await eventBridge.send(InspectorDeletedEvent.build(deletion));
    await waitForBusEvent(InspectorDeletedEvent.type);

    await tableClient.expectNoItemEventually(PK, SK);
});
