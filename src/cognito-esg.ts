import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ln from "aws-cdk-lib/aws-lambda-nodejs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as logs from "aws-cdk-lib/aws-logs";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as events_targets from "aws-cdk-lib/aws-events-targets";
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
    const api = new apigw.HttpApi(this, "CognitoESGApi", {
      corsPreflight: {
        allowHeaders: [
          "Content-Type",
          "Authorization",
          "Content-Length",
          "X-Requested-With",
        ],
        allowMethods: [apigw.CorsHttpMethod.ANY],
        allowOrigins: ["*"],
        allowCredentials: false,
      },
    });

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

    const inspectorPool = new cognito.UserPool(this, "InspectorPool", {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
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

    const apiFunction = new ln.NodejsFunction(this, "ApiFunction", {
      entry: `${__dirname}/functions/api/index.ts`,
      environment: {
        STAGE: props.stage,
        SERVICE: props.serviceName,
        NODE_OPTIONS: "--enable-source-maps",
        TABLE_NAME: table.tableName,
        USER_POOL_ID: userPool.userPoolId,
        COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
      },
      bundling: { minify: true, sourceMap: true },
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      logRetention: logs.RetentionDays.THREE_DAYS,
      timeout: cdk.Duration.seconds(30),
      initialPolicy: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["cognito-idp:*"],
          resources: [userPool.userPoolArn],
        }),
      ],
      memorySize: 512,
    });

    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.url ?? "",
    });

    const apiIntegration = new integrations.HttpLambdaIntegration(
      "ApiIntegration",
      apiFunction,
    );
    api.addRoutes({
      path: "/{proxy+}",
      methods: [
        apigw.HttpMethod.GET,
        apigw.HttpMethod.POST,
        apigw.HttpMethod.DELETE,
      ],
      integration: apiIntegration,
      // authorizer: undefined,
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
