import fs from "fs";
import {
  EmployeeCreatedEvent,
  EmployeeDeletedEvent,
} from "vimo-events";
import { EventBridge } from "../utils";
import { CognitoUserPoolClient } from "../utils/cognito";
import {
  generateEmployeeCreatedEventData,
  generateEmployeeDeletedEventData,
} from "../utils/generator";

type TestOutputs = {
  EventBusName: string;
  UserPoolId: string;
  ServiceName?: string;
};

const [stackName, outputs] = Object.entries(
  JSON.parse(fs.readFileSync("test.output.json", "utf8")) as Record<
    string,
    TestOutputs
  >,
)[0];

const { EventBusName } = outputs;
const { UserPoolId } = outputs;
const ServiceName =
  outputs.ServiceName ??
  (stackName.includes("-") ? stackName.slice(stackName.indexOf("-") + 1) : stackName);

process.env.EVENT_BUS_NAME = EventBusName;
process.env.SERVICE = ServiceName;

const eventBridge = new EventBridge(EventBusName);
let userPoolClient: CognitoUserPoolClient;

beforeAll(async () => {
  userPoolClient = new CognitoUserPoolClient(UserPoolId);
});

jest.setTimeout(30000);

test("should create employee in Cognito with current agency group", async () => {
  const employee = generateEmployeeCreatedEventData();

  await eventBridge.send(EmployeeCreatedEvent.build(employee));

  await userPoolClient.expectUserEventually(employee.email, (user) => {
    expect(user.attributes.email).toBe(employee.email);
    expect(user.attributes.given_name).toBe(employee.given_name);
    expect(user.attributes.family_name).toBe(employee.family_name);
    expect(user.attributes["custom:currentAgency"]).toBe(employee.agencyId);
    expect(user.groups).toContain(employee.agencyId);
  });
});

test("should delete employee from Cognito when last agency is removed", async () => {
  const employee = generateEmployeeCreatedEventData();

  await eventBridge.send(EmployeeCreatedEvent.build(employee));
  await userPoolClient.expectUserEventually(employee.email);

  const deletion = generateEmployeeDeletedEventData({
    agencyId: employee.agencyId,
    email: employee.email,
  });
  await eventBridge.send(EmployeeDeletedEvent.build(deletion));

  await userPoolClient.expectNoUserEventually(employee.email);
});
