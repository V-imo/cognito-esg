import {
  Entity,
  item,
  string,
  InputItem,
  number,
  boolean,
} from "dynamodb-toolbox";
import { CognitoEsgTable } from "../dynamodb";

export const EmployeeEntity = new Entity({
  name: "Employee",
  schema: item({
    agencyId: string().key(),
    firstname: string(),
    lastname: string(),
    email: string().key(),
    oplock: number(),
    latched: boolean().optional(),
  }),
  computeKey: ({ agencyId, email }: { agencyId: string; email: string }) => ({
    PK: `AGENCY#${agencyId}`,
    SK: `EMPLOYEE#${email}`,
  }),
  table: CognitoEsgTable,
});
export type EmployeeEntityType = Omit<
  InputItem<typeof EmployeeEntity>,
  "created" | "entity" | "modified"
>;
