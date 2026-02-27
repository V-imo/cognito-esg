import fs from "fs";
import {
  ServerlessSpyListener,
  createServerlessSpyListener,
} from "serverless-spy";
import {
  EmployeeCreatedEvent,
  EmployeeDeletedEvent,
} from "vimo-events";
import { ServerlessSpyEvents } from "../spy";
import { DynamoTableClient, EventBridge } from "../utils";
import {
  generateEmployeeCreatedEventData,
  generateEmployeeDeletedEventData,
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

test("should persist employee on employee-created event", async () => {
  const employee = generateEmployeeCreatedEventData();
  const PK = `AGENCY#${employee.agencyId}`;
  const SK = `EMPLOYEE#${employee.email}`;

  await eventBridge.send(EmployeeCreatedEvent.build(employee));
  await waitForBusEvent(EmployeeCreatedEvent.type);

  await tableClient.expectItemEventually(PK, SK, (item) => {
    expect(item.agencyId).toBe(employee.agencyId);
    expect(item.email).toBe(employee.email);
    expect(item.firstname).toBe(employee.given_name);
    expect(item.lastname).toBe(employee.family_name);
    expect(item.oplock).toEqual(expect.any(Number));
  });
});

test("should remove employee on employee-deleted event", async () => {
    const employee = generateEmployeeCreatedEventData();
    const PK = `AGENCY#${employee.agencyId}`;
    const SK = `EMPLOYEE#${employee.email}`;

    await eventBridge.send(EmployeeCreatedEvent.build(employee));
    await waitForBusEvent(EmployeeCreatedEvent.type);
    await tableClient.expectItemEventually(PK, SK);

    const deletion = generateEmployeeDeletedEventData({
      agencyId: employee.agencyId,
      email: employee.email,
    });
    await eventBridge.send(EmployeeDeletedEvent.build(deletion));
    await waitForBusEvent(EmployeeDeletedEvent.type);

    await tableClient.expectNoItemEventually(PK, SK);
});
