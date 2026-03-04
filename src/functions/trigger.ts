import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminDeleteUserCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  CreateGroupCommand,
  GetGroupCommand,
  UsernameExistsException,
  UserNotFoundException,
  GroupExistsException,
  ResourceNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { DynamoDBStreamEvent, DynamoDBRecord } from "aws-lambda";
import { EmployeeEntity } from "../core/employee/employee.entity";
import { InspectorEntity } from "../core/inspector/inspector.entity";
import { env, logger, tracer } from "../core/util";

type StreamEntity = {
  _et: string;
  agencyId: string;
  email: string;
  firstname: string;
  lastname: string;
};

const cognito = tracer.captureAWSv3Client(new CognitoIdentityProviderClient());

export const handler = async (event: DynamoDBStreamEvent) => {
  await Promise.all(event.Records.map((record) => handleRecord(record)));
};

const handleRecord = async (record: DynamoDBRecord) => {
  const image = record.dynamodb?.NewImage ?? record.dynamodb?.OldImage;
  if (!image) {
    return;
  }

  const object = unmarshall(image as Record<string, any>) as StreamEntity;
  if (!object._et) {
    return;
  }

  const userPoolId = getUserPoolId(object._et);
  if (!userPoolId) {
    return;
  }

  if (record.eventName === "INSERT") {
    await createUserInAgency(userPoolId, object);
  } else if (record.eventName === "REMOVE") {
    await deleteUserFromAgency(userPoolId, object.email, object.agencyId);
  }
};

const getUserPoolId = (entityType: string): string | undefined => {
  if (entityType === InspectorEntity.entityName) {
    return env.INSPECTOR_POOL_ID;
  }
  if (entityType === EmployeeEntity.entityName) {
    return env.USER_POOL_ID;
  }
  return undefined;
};

const createUserInAgency = async (userPoolId: string, user: StreamEntity) => {
  await createUser(userPoolId, user);
  await ensureGroup(userPoolId, user.agencyId);
  await addUserToGroup(userPoolId, user.agencyId, user.email);
};

const deleteUserFromAgency = async (
  userPoolId: string,
  email: string,
  agencyId: string,
) => {
  try {
    await cognito.send(
      new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: email,
      }),
    );
  } catch (error) {
    if (error instanceof UserNotFoundException) {
      logger.info("User not found in Cognito, skipping remove from group", {
        poolId: userPoolId,
        email,
        groupName: agencyId,
      });
      return;
    }
    throw error;
  }

  try {
    await cognito.send(
      new GetGroupCommand({
        GroupName: agencyId,
        UserPoolId: userPoolId,
      }),
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundException) {
      logger.info("Group not found in Cognito, skipping remove from group", {
        poolId: userPoolId,
        email,
        groupName: agencyId,
      });
      return;
    }
    throw error;
  }

  let groupsForUser = [] as { GroupName?: string }[];
  try {
    const { Groups } = await cognito.send(
      new AdminListGroupsForUserCommand({
        UserPoolId: userPoolId,
        Username: email,
      }),
    );
    groupsForUser = Groups ?? [];
  } catch (error) {
    if (error instanceof UserNotFoundException) {
      logger.info("User not found in Cognito, skipping remove from group", {
        poolId: userPoolId,
        email,
        groupName: agencyId,
      });
      return;
    }
    throw error;
  }

  const isUserInGroup = groupsForUser.some((group) => group.GroupName === agencyId);
  if (!isUserInGroup) {
    logger.info("User is not in group in Cognito, skipping remove from group", {
      poolId: userPoolId,
      email,
      groupName: agencyId,
    });
    return;
  }

  try {
    await cognito.send(
      new AdminRemoveUserFromGroupCommand({
        GroupName: agencyId,
        UserPoolId: userPoolId,
        Username: email,
      }),
    );
  } catch (error) {
    if (
      error instanceof UserNotFoundException ||
      error instanceof ResourceNotFoundException
    ) {
      logger.info(
        "User or group not found in Cognito, skipping remove from group",
        {
          poolId: userPoolId,
          email,
          groupName: agencyId,
        },
      );
      return;
    }
    throw error;
  }

  try {
    const { Groups } = await cognito.send(
      new AdminListGroupsForUserCommand({
        UserPoolId: userPoolId,
        Username: email,
      }),
    );

    const remainingGroups = (Groups ?? []).filter((group) => group.GroupName);
    if (remainingGroups.length === 0) {
      await deleteUser(userPoolId, email);
      return;
    }

    const nextGroupName = remainingGroups[0]?.GroupName;
    if (!nextGroupName) {
      await deleteUser(userPoolId, email);
      return;
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
    );
  } catch (error) {
    if (error instanceof UserNotFoundException) {
      logger.info("User not found in Cognito, skipping delete", {
        poolId: userPoolId,
        email,
      });
      return;
    }
    throw error;
  }
};

const createUser = async (userPoolId: string, user: StreamEntity) => {
  const attributes = [
    { Name: "email", Value: user.email },
    { Name: "email_verified", Value: "false" },
    { Name: "given_name", Value: user.firstname },
    { Name: "family_name", Value: user.lastname },
    { Name: "custom:currentAgency", Value: user.agencyId },
  ];

  try {
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: user.email,
        UserAttributes: attributes,
      }),
    );
  } catch (error) {
    if (error instanceof UsernameExistsException) {
      await updateUserAttributes(userPoolId, user);
      logger.info("User already exists in Cognito, skipping create", {
        poolId: userPoolId,
        email: user.email,
      });
      return;
    }
    throw error;
  }
};

const updateUserAttributes = async (userPoolId: string, user: StreamEntity) => {
  const attributes = [
    { Name: "given_name", Value: user.firstname },
    { Name: "family_name", Value: user.lastname },
    { Name: "custom:currentAgency", Value: user.agencyId },
  ];

  if (attributes.length === 0) {
    return;
  }

  await cognito.send(
    new AdminUpdateUserAttributesCommand({
      UserPoolId: userPoolId,
      Username: user.email,
      UserAttributes: attributes,
    }),
  );
};

const ensureGroup = async (userPoolId: string, groupName: string) => {
  try {
    await cognito.send(
      new CreateGroupCommand({
        GroupName: groupName,
        UserPoolId: userPoolId,
      }),
    );
  } catch (error) {
    if (error instanceof GroupExistsException) {
      return;
    }
    throw error;
  }
};

const addUserToGroup = async (
  userPoolId: string,
  groupName: string,
  email: string,
) => {
  await cognito.send(
    new AdminAddUserToGroupCommand({
      GroupName: groupName,
      UserPoolId: userPoolId,
      Username: email,
    }),
  );
};

const deleteUser = async (userPoolId: string, email: string) => {
  try {
    await cognito.send(
      new AdminDeleteUserCommand({
        UserPoolId: userPoolId,
        Username: email,
      }),
    );
  } catch (error) {
    if (error instanceof UserNotFoundException) {
      logger.info("User not found in Cognito, skipping delete", {
        poolId: userPoolId,
        email,
      });
      return;
    }
    throw error;
  }
};
