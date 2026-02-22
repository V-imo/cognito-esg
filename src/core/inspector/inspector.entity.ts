import {
  Entity,
  item,
  string,
  InputItem,
  number,
  boolean,
} from "dynamodb-toolbox";
import { UsersBffTable } from "../dynamodb";

export const InspectorEntity = new Entity({
  name: "Inspector",
  schema: item({
    agencyId: string().key(),
    firstname: string(),
    lastname: string(),
    email: string().key(),
    timezone: string(),
    oplock: number(),
    latched: boolean().optional(),
  }),
  computeKey: ({ agencyId, email }: { agencyId: string; email: string }) => ({
    PK: `AGENCY#${agencyId}`,
    SK: `INSPECTOR#${email}`,
  }),
  table: UsersBffTable,
});
export type InspectorEntityType = Omit<
  InputItem<typeof InspectorEntity>,
  "created" | "entity" | "modified"
>;
