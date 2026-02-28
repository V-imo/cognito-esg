import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminDeleteUserCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  CreateGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider"
import { unmarshall } from "@aws-sdk/util-dynamodb"
import type { DynamoDBStreamEvent, DynamoDBRecord } from "aws-lambda"
import { EmployeeEntity } from "../core/employee/employee.entity"
import { InspectorEntity } from "../core/inspector/inspector.entity"
import { env, logger, tracer } from "../core/util"

type StreamEntity = {
  _et?: string
  agencyId?: string
  email?: string
  firstname?: string
  lastname?: string
}

const cognito = tracer.captureAWSv3Client(new CognitoIdentityProviderClient())

export const handler = async (event: DynamoDBStreamEvent) => {
  await Promise.all(event.Records.map((record) => handleRecord(record)))
}

const handleRecord = async (record: DynamoDBRecord) => {
  const image = record.dynamodb?.NewImage ?? record.dynamodb?.OldImage
  if (!image) {
    return
  }

  const object = unmarshall(image as Record<string, any>) as StreamEntity
  if (!object._et || !object.email) {
    return
  }

  if (object._et === InspectorEntity.entityName) {
    if (record.eventName === "INSERT") {
      await createInspector(object)
    } else if (record.eventName === "REMOVE") {
      await deleteUserFromAgency(env.INSPECTOR_POOL_ID, object.email, object.agencyId)
    }
    return
  }

  if (object._et === EmployeeEntity.entityName) {
    if (record.eventName === "INSERT") {
      await createEmployee(object)
    } else if (record.eventName === "REMOVE") {
      await deleteUserFromAgency(env.USER_POOL_ID, object.email, object.agencyId)
    }
  }
}

const createEmployee = async (employee: StreamEntity) => {
  if (!employee.agencyId) {
    logger.warn("Skipping employee create: agencyId is missing", {
      email: employee.email,
    })
    return
  }

  await createEmployeeUser({
    email: employee.email!,
    firstname: employee.firstname,
    lastname: employee.lastname,
    agencyId: employee.agencyId,
  })
}

const createInspector = async (inspector: StreamEntity) => {
  if (!inspector.agencyId) {
    logger.warn("Skipping inspector create: agencyId is missing", {
      email: inspector.email,
    })
    return
  }

  await createInspectorUser({
    email: inspector.email!,
    firstname: inspector.firstname,
    lastname: inspector.lastname,
    agencyId: inspector.agencyId,
  })
}

const createEmployeeUser = async (user: {
  email: string
  firstname?: string
  lastname?: string
  agencyId: string
}) => {
  await createUser(env.USER_POOL_ID, user)
  await ensureGroup(env.USER_POOL_ID, user.agencyId)
  await addUserToGroup(env.USER_POOL_ID, user.agencyId, user.email)
}

const createInspectorUser = async (user: {
  email: string
  firstname?: string
  lastname?: string
  agencyId: string
}) => {
  await createUser(env.INSPECTOR_POOL_ID, user)
  await ensureGroup(env.INSPECTOR_POOL_ID, user.agencyId)
  await addUserToGroup(env.INSPECTOR_POOL_ID, user.agencyId, user.email)
}

const createUser = async (
  userPoolId: string,
  user: {
    email: string
    firstname?: string
    lastname?: string
    agencyId?: string
  },
) => {
  const attributes = [
    { Name: "email", Value: user.email },
    { Name: "email_verified", Value: "true" },
    ...(user.firstname ? [{ Name: "given_name", Value: user.firstname }] : []),
    ...(user.lastname ? [{ Name: "family_name", Value: user.lastname }] : []),
    ...(user.agencyId
      ? [{ Name: "custom:currentAgency", Value: user.agencyId }]
      : []),
  ]

  try {
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: user.email,
        UserAttributes: attributes,
      }),
    )
  } catch (error) {
    const e = error as Error
    if (e.name === "UsernameExistsException") {
      await updateUserAttributes(userPoolId, user)
      logger.info("User already exists in Cognito, skipping create", {
        poolId: userPoolId,
        email: user.email,
      })
      return
    }
    throw error
  }
}

const updateUserAttributes = async (
  userPoolId: string,
  user: {
    email: string
    firstname?: string
    lastname?: string
    agencyId?: string
  },
) => {
  const attributes = [
    ...(user.firstname ? [{ Name: "given_name", Value: user.firstname }] : []),
    ...(user.lastname ? [{ Name: "family_name", Value: user.lastname }] : []),
    ...(user.agencyId
      ? [{ Name: "custom:currentAgency", Value: user.agencyId }]
      : []),
  ]

  if (attributes.length === 0) {
    return
  }

  await cognito.send(
    new AdminUpdateUserAttributesCommand({
      UserPoolId: userPoolId,
      Username: user.email,
      UserAttributes: attributes,
    }),
  )
}

const ensureGroup = async (userPoolId: string, groupName: string) => {
  try {
    await cognito.send(
      new CreateGroupCommand({
        GroupName: groupName,
        UserPoolId: userPoolId,
      }),
    )
  } catch (error) {
    const e = error as Error
    if (e.name === "GroupExistsException") {
      return
    }
    throw error
  }
}

const addUserToGroup = async (userPoolId: string, groupName: string, email: string) => {
  await cognito.send(
    new AdminAddUserToGroupCommand({
      GroupName: groupName,
      UserPoolId: userPoolId,
      Username: email,
    }),
  )
}

const deleteUser = async (userPoolId: string, email: string) => {
  try {
    await cognito.send(
      new AdminDeleteUserCommand({
        UserPoolId: userPoolId,
        Username: email,
      }),
    )
  } catch (error) {
    const e = error as Error
    if (e.name === "UserNotFoundException") {
      logger.info("User not found in Cognito, skipping delete", {
        poolId: userPoolId,
        email,
      })
      return
    }
    throw error
  }
}

const deleteUserFromAgency = async (
  userPoolId: string,
  email: string,
  agencyId?: string,
) => {
  if (!agencyId) {
    await deleteUser(userPoolId, email)
    return
  }

  try {
    await cognito.send(
      new AdminRemoveUserFromGroupCommand({
        GroupName: agencyId,
        UserPoolId: userPoolId,
        Username: email,
      }),
    )
  } catch (error) {
    const e = error as Error
    if (e.name !== "ResourceNotFoundException" && e.name !== "UserNotFoundException") {
      throw error
    }
  }

  try {
    const { Groups } = await cognito.send(
      new AdminListGroupsForUserCommand({
        UserPoolId: userPoolId,
        Username: email,
      }),
    )

    const remainingGroups = (Groups ?? []).filter((group) => group.GroupName)
    if (remainingGroups.length === 0) {
      await deleteUser(userPoolId, email)
      return
    }

    const nextGroupName = remainingGroups[0]?.GroupName
    if (!nextGroupName) {
      await deleteUser(userPoolId, email)
      return
    }

    await cognito.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: email,
        UserAttributes: [
          {
            Name: "custom:currentAgency",
            Value: nextGroupName,
          },
        ],
      }),
    )
  } catch (error) {
    const e = error as Error
    if (e.name === "UserNotFoundException") {
      return
    }
    throw error
  }
}
