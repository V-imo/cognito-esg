import fs from "fs";
import {
  InspectorCreatedEvent,
  InspectorDeletedEvent,
} from "vimo-events";
import { EventBridge } from "../utils";
import { CognitoUserPoolClient } from "../utils/cognito";
import {
  generateInspectorCreatedEventData,
  generateInspectorDeletedEventData,
} from "../utils/generator";

type TestOutputs = {
  EventBusName: string;
  InspectorPoolId: string;
  ServiceName?: string;
};

const [stackName, outputs] = Object.entries(
  JSON.parse(fs.readFileSync("test.output.json", "utf8")) as Record<
    string,
    TestOutputs
  >,
)[0];

const { EventBusName } = outputs;
const { InspectorPoolId } = outputs;
const ServiceName =
  outputs.ServiceName ??
  (stackName.includes("-") ? stackName.slice(stackName.indexOf("-") + 1) : stackName);

process.env.EVENT_BUS_NAME = EventBusName;
process.env.SERVICE = ServiceName;

const eventBridge = new EventBridge(EventBusName);
let inspectorPoolClient: CognitoUserPoolClient;

beforeAll(async () => {
  inspectorPoolClient = new CognitoUserPoolClient(InspectorPoolId);
});

jest.setTimeout(30000);

test("should create inspector in Cognito with current agency group", async () => {
  const inspector = generateInspectorCreatedEventData();

  await eventBridge.send(InspectorCreatedEvent.build(inspector));

  await inspectorPoolClient.expectUserEventually(inspector.email, (user) => {
    expect(user.attributes.email).toBe(inspector.email);
    expect(user.attributes.given_name).toBe(inspector.given_name);
    expect(user.attributes.family_name).toBe(inspector.family_name);
    expect(user.attributes["custom:currentAgency"]).toBe(inspector.agencyId);
    expect(user.groups).toContain(inspector.agencyId);
  });
});

test("should delete inspector from Cognito when last agency is removed", async () => {
  const inspector = generateInspectorCreatedEventData();

  await eventBridge.send(InspectorCreatedEvent.build(inspector));
  await inspectorPoolClient.expectUserEventually(inspector.email);

  const deletion = generateInspectorDeletedEventData({
    agencyId: inspector.agencyId,
    email: inspector.email,
  });
  await eventBridge.send(InspectorDeletedEvent.build(deletion));

  await inspectorPoolClient.expectNoUserEventually(inspector.email);
});
