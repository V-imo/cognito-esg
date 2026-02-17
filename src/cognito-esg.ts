import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"

export interface CognitoEsgProps extends cdk.StackProps {
  serviceName: string;
  stage: string;
}

export class CognitoEsg extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CognitoEsgProps) {
    super(scope, id, props)
    // Add your infra here...
  }
}
