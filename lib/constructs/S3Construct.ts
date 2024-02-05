import * as cdk from "aws-cdk-lib";
import { AnyPrincipal, Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { BlockPublicAccess, Bucket } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export class S3Construct extends Construct {
  public groceryAssetsBucket: Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id);

    const blockPublicBucketAccess = new BlockPublicAccess({
      blockPublicPolicy: false,
    });

    this.groceryAssetsBucket = new Bucket(this, "grocery-assets", {
      bucketName: "grocery-elian",
      blockPublicAccess: blockPublicBucketAccess,
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "index.html",
    });

    this.groceryAssetsBucket.addToResourcePolicy(
      new PolicyStatement({
        sid: "Enable Public Get",
        effect: Effect.ALLOW,
        principals: [new AnyPrincipal()],
        actions: ["s3:GetObject"],
        resources: [this.groceryAssetsBucket.bucketArn + "/*"],
      }),
    );
  }
}
