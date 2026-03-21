
import { unmarshall } from "@aws-sdk/util-dynamodb"
import { DynamoDBStreamEvent } from "aws-lambda"
import { EntityParser } from "dynamodb-toolbox"
import { createUserOrInspector, deleteUserOrInspector } from "../core/cognito"
import { EmployeeEntity } from "../core/employee/employee.entity"
import { InspectorEntity } from "../core/inspector/inspector.entity"

export const handler = async (event: DynamoDBStreamEvent) => {
  await Promise.all(
    event.Records.map(async (record) => {
      const object = record.dynamodb?.NewImage || record.dynamodb?.OldImage

      if (object?._et.S === EmployeeEntity.entityName) {
        const { item } = EmployeeEntity.build(EntityParser).parse(
          unmarshall(object as Record<string, any>),
        )
        if (item.latched) return
        if (record.eventName === "INSERT") {
          await createUserOrInspector(process.env.USER_POOL_ID!, item)
        } else if (record.eventName === "REMOVE") {
          await deleteUserOrInspector(process.env.USER_POOL_ID!, item)
        }
      } else if (object?._et.S === InspectorEntity.entityName) {
        const { item } = InspectorEntity.build(EntityParser).parse(
          unmarshall(object as Record<string, any>),
        )
        if (item.latched) return
        if (record.eventName === "INSERT") {
          await createUserOrInspector(process.env.INSPECTOR_POOL_ID!, item)
        } else if (record.eventName === "REMOVE") {
          await deleteUserOrInspector(process.env.INSPECTOR_POOL_ID!, item)
        }
      }
    }),
  )
}
