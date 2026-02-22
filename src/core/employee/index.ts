import {
  DeleteItemCommand,
  GetItemCommand,
  UpdateAttributesCommand,
} from "dynamodb-toolbox";
import { EmployeeEntity, EmployeeEntityType } from "./employee.entity";
import { ignoreOplockError } from "../util";

export namespace Employee {
  export async function update(employee: EmployeeEntityType) {
    await EmployeeEntity.build(UpdateAttributesCommand)
      .item(employee)
      .options({
        condition: {
          or: [
            { attr: "oplock", exists: false },
            { attr: "oplock", lte: employee.oplock },
          ],
        },
      })
      .send()
      .catch(ignoreOplockError);
  }

  export async function get(agencyId: string, email: string) {
    const { Item } = await EmployeeEntity.build(GetItemCommand)
      .key({ agencyId, email })
      .send();
    return Item;
  }

  export async function del(agencyId: string, email: string) {
    return EmployeeEntity.build(DeleteItemCommand)
      .key({ agencyId, email })
      .send();
  }
}
