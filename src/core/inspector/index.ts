import {
  DeleteItemCommand,
  GetItemCommand,
  UpdateAttributesCommand,
} from "dynamodb-toolbox";
import { InspectorEntity, InspectorEntityType } from "./inspector.entity";
import { ignoreOplockError } from "../util";

export namespace Inspector {
  export async function update(inspector: InspectorEntityType) {
    await InspectorEntity.build(UpdateAttributesCommand)
      .item(inspector)
      .options({
        condition: {
          or: [
            { attr: "oplock", exists: false },
            { attr: "oplock", lte: inspector.oplock },
          ],
        },
      })
      .send()
      .catch(ignoreOplockError);
  }

  export async function get(agencyId: string, email: string) {
    const { Item } = await InspectorEntity.build(GetItemCommand)
      .key({ agencyId, email })
      .send();
    return Item;
  }

  export async function del(agencyId: string, email: string) {
    return InspectorEntity.build(DeleteItemCommand)
      .key({ agencyId, email })
      .send();
  }
}
