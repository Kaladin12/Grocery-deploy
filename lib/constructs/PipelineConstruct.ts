import * as cdk from "aws-cdk-lib";
import {
  BuildSpec,
  LinuxBuildImage,
  PipelineProject,
} from "aws-cdk-lib/aws-codebuild";
import { Artifact, Pipeline } from "aws-cdk-lib/aws-codepipeline";
import {
  CodeBuildAction,
  EcsDeployAction,
  GitHubSourceAction,
  ManualApprovalAction,
} from "aws-cdk-lib/aws-codepipeline-actions";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { ManagedPolicy } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { ECR_REPO_NAME } from "../constants";
import { ApplicationLoadBalancedFargateService } from "aws-cdk-lib/aws-ecs-patterns";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { ContainerImage } from "aws-cdk-lib/aws-ecs";
import { Bucket } from "aws-cdk-lib/aws-s3";

interface PipelineProps {
  githubTokenValue: cdk.SecretValue;
  ecrRepository: Repository;
  groceryVpc: Vpc;
  s3Bucket: Bucket;
}

export class PipelineConstruct extends Construct {
  private sourceAction: cdk.aws_codepipeline_actions.GitHubSourceAction;
  private buildAction: cdk.aws_codepipeline_actions.CodeBuildAction;
  private deployAction: cdk.aws_codepipeline_actions.EcsDeployAction;
  private sourceOutput: cdk.aws_codepipeline.Artifact;
  private buildOutput: cdk.aws_codepipeline.Artifact;

  constructor(scope: Construct, id: string, props: PipelineProps) {
    super(scope, id);

    this.sourceOutput = new Artifact();
    this.buildOutput = new Artifact();

    this.sourceAction = this.createSourceAction(
      this.sourceOutput,
      props.githubTokenValue,
    );

    this.buildAction = this.createBuildAction(
      this.createCodeBuildSpecs(props.ecrRepository, props.s3Bucket),
    );

    this.deployAction = this.createDeployAction(props);

    this.instantiatePipeline();
  }

  private createSourceAction(
    sourceOutput: Artifact,
    githubTokenValue: cdk.SecretValue,
  ): GitHubSourceAction {
    return new GitHubSourceAction({
      actionName: "grocery-source-name",
      owner: "Kaladin12",
      repo: "grocery-spring-boot-angular",
      oauthToken: githubTokenValue,
      output: sourceOutput,
      branch: "master",
    });
  }

  private createBuildAction(pipelineProject: PipelineProject) {
    return new CodeBuildAction({
      actionName: "grocery-codebuild-action",
      project: pipelineProject,
      input: this.sourceOutput,
      outputs: [this.buildOutput],
    });
  }

  private instantiatePipeline() {
    const temp = new ManualApprovalAction({
      actionName: "Approve",
    });
    const pipeline = new Pipeline(this, "grocery-pipeline", {
      pipelineName: "grocery-pipeline",
      stages: [
        {
          stageName: "Source",
          actions: [this.sourceAction],
        },
        {
          stageName: "Build",
          actions: [this.buildAction],
        },
        {
          stageName: "Deploy",
          actions: [this.deployAction],
        },
      ],
    });
  }

  private createCodeBuildSpecs(
    ecrRepository: Repository,
    s3Bucket: Bucket,
  ): PipelineProject {
    const buildPipeline = new PipelineProject(
      this,
      "grocery-codebuild-pipeline",
      {
        projectName: "grocery-codebuild-pipeline",
        environment: {
          buildImage: LinuxBuildImage.AMAZON_LINUX_2_5,
          privileged: true,
        },
        environmentVariables: {
          ECR_REPO: {
            value: ecrRepository.repositoryUriForTag(),
          },
          REGION: {
            value: "us-east-1",
          },
          ID: {
            value: "423929911942.dkr.ecr.us-east-1.amazonaws.com",
          },
          BUCKET: {
            value: s3Bucket.bucketName,
          },
        },
        buildSpec: BuildSpec.fromObject({
          version: "0.2",
          phases: {
            install: {
              commands: ["yum update -y"],
              finally: ["echo Done installing deps"],
            },
            pre_build: {
              commands: [
                "echo Logging in to Amazon ECR...",
                "aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ID",
                "COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)",
                "IMAGE_TAG=${COMMIT_HASH:=latest}",
              ],
            },
            build: {
              commands: [
                "echo Build started on `date`",
                "mvn clean install",
                "echo Building Docker Image $ECR_REPO:latest",
                "docker build -t $ECR_REPO:latest .",
                "echo Tagging Docker Image $ECR_REPO:latest with $ECR_REPO:$IMAGE_TAG",
                "docker tag $ECR_REPO:latest $ECR_REPO:$IMAGE_TAG",
                "echo Pushing Docker Image to $ECR_REPO:latest and $ECR_REPO:$IMAGE_TAG",
                "docker push $ECR_REPO:latest",
                "docker push $ECR_REPO:$IMAGE_TAG",
                "echo Uploading Angular assets to s3",
                "aws s3 sync dist/ui-test/browser/ s3://$BUCKET/",
              ],
              finally: ["echo Done building code"],
            },
            post_build: {
              commands: [
                "echo creating imagedefinitions.json dynamically",
                'printf \'[{"name":"' +
                  ECR_REPO_NAME +
                  '","imageUri": "' +
                  ecrRepository.repositoryUriForTag() +
                  ":latest\"}]' > imagedefinitions.json",
                "echo Build completed on `date`",
              ],
            },
          },
          artifacts: {
            files: ["imagedefinitions.json"],
          },
        }),
      },
    );
    buildPipeline.role?.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        "AmazonEC2ContainerRegistryPowerUser",
      ),
    );
    buildPipeline.role?.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess"),
    );
    return buildPipeline;
  }

  private createFargateService(groceryVpc: Vpc, ecrRepository: Repository) {
    const fargateService = new ApplicationLoadBalancedFargateService(
      this,
      "grocery-fargate-service-2",
      {
        vpc: groceryVpc,
        memoryLimitMiB: 512,
        cpu: 256,
        assignPublicIp: true,
        taskImageOptions: {
          containerName: ECR_REPO_NAME,
          image: ContainerImage.fromEcrRepository(ecrRepository, "latest"),
          containerPort: 8080,
        },
      },
    );
    fargateService.taskDefinition.executionRole?.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        "AmazonEC2ContainerRegistryPowerUser",
      ),
    );
    fargateService.targetGroup.configureHealthCheck({
      timeout: cdk.Duration.seconds(119),
      interval: cdk.Duration.seconds(120),
      unhealthyThresholdCount: 2,
      healthyThresholdCount: 2,
    });
    return fargateService;
  }

  private createDeployAction(props: PipelineProps) {
    return new EcsDeployAction({
      actionName: "Deploy",
      service: this.createFargateService(props.groceryVpc, props.ecrRepository)
        .service,
      input: this.buildOutput,
    });
  }
}
