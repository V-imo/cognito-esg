import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ln from "aws-cdk-lib/aws-lambda-nodejs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as events_targets from "aws-cdk-lib/aws-events-targets";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import {
  EmployeeCreatedEvent,
  EmployeeDeletedEvent,
  InspectorCreatedEvent,
  InspectorDeletedEvent,
} from "vimo-events";
import { ServerlessSpy } from "serverless-spy";

export interface CognitoEsgProps extends cdk.StackProps {
  serviceName: string;
  stage: string;
}

export class CognitoEsg extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CognitoEsgProps) {
    super(scope, id, props);

    const eventBus = this.getEventBus(props.stage);
    const table = new ddb.TableV2(this, "CognitoEsgTable", {
      partitionKey: { name: "PK", type: ddb.AttributeType.STRING },
      sortKey: { name: "SK", type: ddb.AttributeType.STRING },
      dynamoStream: ddb.StreamViewType.NEW_AND_OLD_IMAGES,
      billing: ddb.Billing.onDemand(),
      removalPolicy:
        props.stage === "prod"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: "ttl",
    });
    new cdk.CfnOutput(this, "CognitoEsgTableName", {
      value: table.tableName,
    });
    new cdk.CfnOutput(this, "ServiceName", {
      value: props.serviceName,
    });

    const listener = new ln.NodejsFunction(this, "Listener", {
      entry: `${__dirname}/functions/listener.ts`,
      environment: {
        STAGE: props.stage,
        SERVICE: props.serviceName,
        TABLE_NAME: table.tableName,
        EVENT_BUS_NAME: eventBus.eventBusName,
      },
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      logRetention: logs.RetentionDays.THREE_DAYS,
      tracing: lambda.Tracing.ACTIVE,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });
    table.grantReadWriteData(listener);
    eventBus.grantPutEventsTo(listener);

    new events.Rule(this, "Rule", {
      eventBus,
      eventPattern: {
        source: ["custom"],
        detailType: [
          EmployeeCreatedEvent.type,
          EmployeeDeletedEvent.type,
          InspectorCreatedEvent.type,
          InspectorDeletedEvent.type,
        ],
      },
      targets: [
        new events_targets.LambdaFunction(listener, {
          retryAttempts: 3,
        }),
      ],
    });

    const userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      customAttributes: {
        currentAgency: new cognito.StringAttribute({ mutable: true }),
      },
      userInvitation: {
        emailSubject: "Welcome to Vimo!",
        emailBody: "Hello {username}, your temporary password is {####}",
      },
      removalPolicy: props.stage.startsWith("test")
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.RETAIN,
    });
    const userPoolClient = userPool.addClient("UserPoolClient", {
      authFlows: { userPassword: true },
      preventUserExistenceErrors: true,
      generateSecret: true,
    });
    new cdk.CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId,
    });

    const inspectorPool = new cognito.UserPool(this, "InspectorPool", {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      customAttributes: {
        currentAgency: new cognito.StringAttribute({ mutable: true }),
      },
      userInvitation: {
        emailSubject: "Welcome to Vimo!",
        emailBody: "Hello {username}, your temporary password is {####}",
      },
      removalPolicy: props.stage.startsWith("test")
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.RETAIN,
    });
    const inspectorPoolClient = inspectorPool.addClient("InspectorPoolClient", {
      authFlows: { userPassword: true },
      preventUserExistenceErrors: true,
      generateSecret: true,
    });
    new cdk.CfnOutput(this, "InspectorPoolId", {
      value: inspectorPool.userPoolId,
    });

    const trigger = new ln.NodejsFunction(this, "Trigger", {
      entry: `${__dirname}/functions/trigger.ts`,
      environment: {
        STAGE: props.stage,
        SERVICE: props.serviceName,
        USER_POOL_ID: userPool.userPoolId,
        INSPECTOR_POOL_ID: inspectorPool.userPoolId,
      },
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      logRetention: logs.RetentionDays.THREE_DAYS,
      tracing: lambda.Tracing.ACTIVE,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });
    trigger.addEventSource(
      new lambdaEventSources.DynamoEventSource(table, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 100,
        bisectBatchOnError: true,
        retryAttempts: 3,
      }),
    );

    table.grantStreamRead(trigger);
    userPool.grant(
      trigger,
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminDeleteUser",
      "cognito-idp:AdminUpdateUserAttributes",
      "cognito-idp:AdminListGroupsForUser",
      "cognito-idp:CreateGroup",
      "cognito-idp:AdminAddUserToGroup",
      "cognito-idp:AdminRemoveUserFromGroup",
    );
    inspectorPool.grant(
      trigger,
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminDeleteUser",
      "cognito-idp:AdminUpdateUserAttributes",
      "cognito-idp:AdminListGroupsForUser",
      "cognito-idp:CreateGroup",
      "cognito-idp:AdminAddUserToGroup",
      "cognito-idp:AdminRemoveUserFromGroup",
    );

    new ssm.StringParameter(this, "InspectorPoolArnParameter", {
      parameterName: `/vimo/${props.stage}/inspector-pool-arn`,
      stringValue: inspectorPool.userPoolArn,
    });
    new ssm.StringParameter(this, "InspectorPoolClientIdParameter", {
      parameterName: `/vimo/${props.stage}/inspector-pool-client-id`,
      stringValue: inspectorPoolClient.userPoolClientId,
    });

    new ssm.StringParameter(this, "UserPoolArnParameter", {
      parameterName: `/vimo/${props.stage}/user-pool-arn`,
      stringValue: userPool.userPoolArn,
    });
    new ssm.StringParameter(this, "UserPoolClientIdParameter", {
      parameterName: `/vimo/${props.stage}/user-pool-client-id`,
      stringValue: userPoolClient.userPoolClientId,
    });

    if (props.stage.startsWith("test")) {
      const serverlessSpy = new ServerlessSpy(this, "ServerlessSpy", {
        generateSpyEventsFileLocation: "test/spy.ts",
      });
      serverlessSpy.spy();
    }
  }

  getEventBus(stage: string) {
    if (stage.startsWith("test")) {
      const eventBus = new events.EventBus(this, "EventBus");
      new cdk.CfnOutput(this, "EventBusName", {
        value: eventBus.eventBusName,
      });
      return eventBus;
    }
    return events.EventBus.fromEventBusArn(
      this,
      "EventBus",
      ssm.StringParameter.valueForStringParameter(
        this,
        `/vimo/${stage}/event-bus-arn`,
      ),
    );
  }
}
