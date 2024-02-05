import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { ECR_REPO_NAME } from "../constants";

export class EcrConstruct extends Construct {
  public ecr: cdk.aws_ecr.Repository;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id);

    this.ecr = new cdk.aws_ecr.Repository(this, ECR_REPO_NAME, {
      repositoryName: ECR_REPO_NAME,
    });
  }
}
