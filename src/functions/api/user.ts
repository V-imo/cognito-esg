import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  CreateGroupCommand,
  ListUsersInGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { env } from "../../core/util";

const cognitoClient = new CognitoIdentityProviderClient({});

export async function createUser(
  email: string,
  firstName: string,
  lastName: string,
  currentAgency: string,
) {
  await cognitoClient
    .send(
      new AdminCreateUserCommand({
        UserPoolId: env.USER_POOL_ID,
        Username: email,
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "given_name", Value: firstName },
          { Name: "family_name", Value: lastName },
          { Name: "custom:currentAgency", Value: currentAgency },
        ],
        DesiredDeliveryMediums: ["EMAIL"],
      }),
    )
    .catch((err) => {
      if (err?.name !== "UsernameExistsException") {
        throw err;
      }
    });

  await cognitoClient
    .send(
      new CreateGroupCommand({
        GroupName: currentAgency,
        UserPoolId: env.USER_POOL_ID,
      }),
    )
    .catch((err) => {
      if (err?.name !== "GroupExistsException") {
        throw err;
      }
    });

  await cognitoClient.send(
    new AdminAddUserToGroupCommand({
      GroupName: currentAgency,
      UserPoolId: env.USER_POOL_ID,
      Username: email,
    }),
  );
}

export async function getUsers(groupName: string) {
  const response = await cognitoClient.send(
    new ListUsersInGroupCommand({
      GroupName: groupName,
      UserPoolId: env.USER_POOL_ID,
    }),
  );
  return response.Users?.map((user) => {
    const attrs: Record<string, string> = {};
    user.Attributes?.forEach((attr) => {
      if (attr.Name && attr.Value) {
        attrs[attr.Name] = attr.Value;
      }
    });
    return {
      username: user.Username,
      email: attrs["email"],
      firstName: attrs["given_name"],
      lastName: attrs["family_name"],
      currentAgency: attrs["custom:currentAgency"],
    };
  });
}

export async function deleteUser(username: string) {
  const [{ UserAttributes }, { Groups }] = await Promise.all([
    cognitoClient.send(
      new AdminGetUserCommand({
        UserPoolId: env.USER_POOL_ID,
        Username: username,
      }),
    ),
    cognitoClient.send(
      new AdminListGroupsForUserCommand({
        UserPoolId: env.USER_POOL_ID,
        Username: username,
      }),
    ),
  ]);

  const userGroups = Groups ?? [];
  const currentAgency =
    UserAttributes?.find((attr) => attr.Name === "custom:currentAgency")
      ?.Value ?? userGroups[0]?.GroupName;

  if (currentAgency) {
    await cognitoClient.send(
      new AdminRemoveUserFromGroupCommand({
        GroupName: currentAgency,
        UserPoolId: env.USER_POOL_ID,
        Username: username,
      }),
    );
  }

  const remainingGroups =
    userGroups.filter((group) => group.GroupName !== currentAgency) ?? [];

  if (remainingGroups.length === 0) {
    return cognitoClient.send(
      new AdminDeleteUserCommand({
        UserPoolId: env.USER_POOL_ID,
        Username: username,
      }),
    );
  }

  const nextGroupName = remainingGroups[0]?.GroupName;

  if (nextGroupName) {
    await cognitoClient.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: env.USER_POOL_ID,
        Username: username,
        UserAttributes: [
          {
            Name: "custom:currentAgency",
            Value: nextGroupName,
          },
        ],
      }),
    );
  }

  return "deletion done.";
}
