#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { CdkGroceryStack } from "../lib/cdk-grocery-stack";

const envParams = {
  account: "423929911942",
  region: "us-east-1",
};

const app = new cdk.App();
new CdkGroceryStack(app, "CdkGroceryStack", {
  env: envParams,
});
