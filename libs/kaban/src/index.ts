// import * as cdk from 'aws-cdk-lib';
import * as go from '@aws-cdk/aws-lambda-go-alpha';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export interface KabanProps {
  // Define construct properties here
}

export class Kaban extends Construct {
  constructor(scope: Construct, id: string, props: KabanProps = {}) {
    super(scope, id);
    const collectorFn = new go.GoFunction(this, 'collectorFn', {});
    const collector = new tasks.LambdaInvoke.jsonata(this, 'collector', {});
  }
}
