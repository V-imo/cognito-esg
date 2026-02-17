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
      entry: `${__dirname}/functions/apis/index.ts`,
      environment: {
        STAGE: props.stage,
        SERVICE: props.serviceName,
        NODE_OPTIONS: "--enable-source-maps",
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
  }
}
