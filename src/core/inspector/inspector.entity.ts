import {
  Entity,
  item,
  string,
  InputItem,
  number,
  boolean,
} from "dynamodb-toolbox";
import { CognitoEsgTable } from "../dynamodb";

export const InspectorEntity = new Entity({
  name: "Inspector",
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
    SK: `INSPECTOR#${email}`,
  }),
  table: CognitoEsgTable,
});
export type InspectorEntityType = Omit<
  InputItem<typeof InspectorEntity>,
  "created" | "entity" | "modified"
>;
