import { AdminAddUserToGroupCommand, AdminCreateUserCommand, AdminDeleteUserCommand, AdminListGroupsForUserCommand, AdminUpdateUserAttributesCommand, CognitoIdentityProviderClient, CreateGroupCommand, GroupExistsException, UsernameExistsException, UserNotFoundException } from "@aws-sdk/client-cognito-identity-provider"
import { EmployeeEntityType } from "./employee/employee.entity"
import { InspectorEntityType } from "./inspector/inspector.entity"
import { tracer } from "./util"

const cognito = tracer.captureAWSv3Client(new CognitoIdentityProviderClient())

type User = EmployeeEntityType | InspectorEntityType

export async function createUserOrInspector(userPoolId: string, user: User) {
  await createGroup(userPoolId, user.agencyId)
  await createUser(userPoolId, user)
  await addUserToGroup(userPoolId, user)
}

export async function deleteUserOrInspector(userPoolId: string, user: User) {
  try {
    const { Groups } = await cognito.send(
      new AdminListGroupsForUserCommand({
        UserPoolId: userPoolId,
        Username: user.email,
      }),
    )

    if ((Groups ?? []).length <= 1 || !Groups) {
      try {
        await cognito.send(
          new AdminDeleteUserCommand({
            UserPoolId: userPoolId,
            Username: user.email,
          }),
        )
      } catch (error) {
        if (error instanceof UserNotFoundException) return
        throw error
      }
      return
    }

    const nextAgencyLeft = Groups.find((group) => group.GroupName !== user.agencyId)!

    await cognito.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: user.email,
        UserAttributes: [
          {
            Name: "custom:currentAgency",
            Value: nextAgencyLeft.GroupName,
          },
        ],
      }),
    )
  } catch (error) {
    if (error instanceof UserNotFoundException) return
    throw error
  }
}

const createGroup = async (userPoolId: string, groupName: string) => {
  try {
    await cognito.send(
      new CreateGroupCommand({
        GroupName: groupName,
        UserPoolId: userPoolId,
      }),
    )
  } catch (error) {
    if (error instanceof GroupExistsException) return
    throw error
  }
}

const createUser = async (userPoolId: string, user: User) => {
  try {
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: user.email,
        UserAttributes: [
          { Name: "email", Value: user.email },
          { Name: "email_verified", Value: "false" },
          { Name: "given_name", Value: user.firstname },
          { Name: "family_name", Value: user.lastname },
          { Name: "custom:currentAgency", Value: user.agencyId },
        ],
      }),
    )
  } catch (error) {
    if (error instanceof UsernameExistsException) {
      await cognito.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: userPoolId,
          Username: user.email,
          UserAttributes: [
            { Name: "given_name", Value: user.firstname },
            { Name: "family_name", Value: user.lastname },
            { Name: "custom:currentAgency", Value: user.agencyId },
          ],
        }),
      )
      return
    }
    throw error
  }
}

async function addUserToGroup(userPoolId: string, user: User) {
  await cognito.send(
    new AdminAddUserToGroupCommand({
      GroupName: user.agencyId,
      UserPoolId: userPoolId,
      Username: user.email,
    }),
  )
}