import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { GITHUB_SECRET_ARN } from "./constants";
import { VpcConstruct } from "./constructs/VpcConstruct";
import { EcrConstruct } from "./constructs/EcrConstruct";
import { PipelineConstruct } from "./constructs/PipelineConstruct";
import { S3Construct } from "./constructs/S3Construct";

export class CdkGroceryStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const oauthToken = cdk.aws_secretsmanager.Secret.fromSecretAttributes(
      this,
      "gh/oauth/token",
      {
        secretCompleteArn: GITHUB_SECRET_ARN,
      },
    );

    const VPC = new VpcConstruct(this, "grocery-vpc-construct");
    const ECR = new EcrConstruct(this, "grocery-ecr-construct");
    const S3 = new S3Construct(this, "grocery-s3-construct");
    const PIPELINE = new PipelineConstruct(this, "grocery-pipeline-construct", {
      githubTokenValue: oauthToken.secretValue,
      ecrRepository: ECR.ecr,
      groceryVpc: VPC.vpc,
      s3Bucket: S3.groceryAssetsBucket,
    });
  }
}
