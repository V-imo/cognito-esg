import * as cdk from "aws-cdk-lib";
import { CognitoEsg } from "./cognito-esg";

const env = {
  account: process.env.CDK_DEPLOY_ACCOUNT ?? process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEPLOY_REGION ?? process.env.CDK_DEFAULT_REGION,
};

const app = new cdk.App();

const serviceName = app.node.tryGetContext("serviceName") as string | undefined;
if (!serviceName) {
  throw new Error("Missing context: serviceName");
}

const stage = app.node.tryGetContext("stage") as string | undefined;
if (!stage) {
  throw new Error("Missing context: stage");
}

new CognitoEsg(app, `${stage}-${serviceName}`, { env, stage, serviceName });

app.synth();
