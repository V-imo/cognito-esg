import {
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { eventualAssertion } from "./index";

type CognitoUser = {
  attributes: Record<string, string>;
  groups: string[];
};

export class CognitoUserPoolClient {
  private readonly client = new CognitoIdentityProviderClient({});

  constructor(private readonly userPoolId: string) {}

  async getUser(username: string): Promise<CognitoUser | undefined> {
    try {
      const [userRes, groupsRes] = await Promise.all([
        this.client.send(
          new AdminGetUserCommand({
            UserPoolId: this.userPoolId,
            Username: username,
          }),
        ),
        this.client.send(
          new AdminListGroupsForUserCommand({
            UserPoolId: this.userPoolId,
            Username: username,
          }),
        ),
      ]);

      const attributes: Record<string, string> = {};
      for (const attr of userRes.UserAttributes ?? []) {
        if (attr.Name && attr.Value) {
          attributes[attr.Name] = attr.Value;
        }
      }

      return {
        attributes,
        groups: (groupsRes.Groups ?? [])
          .map((group) => group.GroupName)
          .filter((name): name is string => Boolean(name)),
      };
    } catch (error) {
      const e = error as Error;
      if (e.name === "UserNotFoundException") {
        return undefined;
      }
      throw error;
    }
  }

  async expectUserEventually(
    username: string,
    assertion?: (user: CognitoUser) => void,
  ) {
    return eventualAssertion(async () => this.getUser(username), (user) => {
      expect(user).toBeDefined();
      assertion?.(user as CognitoUser);
    });
  }
}
