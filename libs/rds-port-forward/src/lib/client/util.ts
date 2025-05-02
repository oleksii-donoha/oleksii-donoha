import {
  DescribeTasksCommand,
  DescribeTasksCommandInput,
  ECSClient,
  ListClustersCommand,
  ListClustersCommandInput,
  ListServicesCommand,
  ListServicesCommandInput,
  ListTasksCommand,
  ListTasksCommandInput,
  Task,
} from '@aws-sdk/client-ecs';

const DESCRIBE_TASKS_MAX_ARNS = 100;

export type PaginatedCommandInput =
  | ListClustersCommandInput
  | ListTasksCommandInput
  | ListServicesCommandInput;

const isListTasks = (
  input: PaginatedCommandInput
): input is ListTasksCommandInput => 'desiredStatus' in input;
const isDescribeTasks = (
  input: PaginatedCommandInput
): input is DescribeTasksCommandInput => 'tasks' in input;
const isListServices = (
  input: PaginatedCommandInput
): input is ListServicesCommandInput =>
  'cluster' in input && !isDescribeTasks(input) && !isListTasks(input);
const isListClusters = (
  input: PaginatedCommandInput
): input is ListClustersCommandInput =>
  Object.keys(input).length === 1 && 'nextToken' in input;

export const paginateClientCommand = async (
  client: ECSClient,
  commandInput: PaginatedCommandInput
) => {
  let nextToken: string | undefined = undefined;
  const allResults: string[] = [];

  do {
    const input: typeof commandInput = { ...commandInput, nextToken };
    if (isListTasks(input)) {
      const command: ListTasksCommand = new ListTasksCommand(input);
      const response = await client.send(command);
      if (response.taskArns) {
        allResults.push(...response.taskArns);
      }
      nextToken = response.nextToken;
    } else if (isListServices(input)) {
      const command = new ListServicesCommand(input);
      const response = await client.send(command);
      if (response.serviceArns) {
        allResults.push(...response.serviceArns);
      }
      nextToken = response.nextToken;
    } else if (isListClusters(input)) {
      const command = new ListClustersCommand(input);
      const response = await client.send(command);
      if (response.clusterArns) {
        allResults.push(...response.clusterArns);
      }
      nextToken = response.nextToken;
    } else {
      throw new Error('Unknown ECS client input type');
    }
  } while (nextToken);
  return allResults;
};

function* getBatch(arns: string[], size: number) {
  while (arns.length) {
    yield arns.splice(0, size);
  }
}

export const paginateDescribeTasksRequest = async (
  client: ECSClient,
  taskArns: string[],
  batchSize: number = DESCRIBE_TASKS_MAX_ARNS
) => {
  const tasks: Task[] = [];
  for (const batch of getBatch(taskArns, batchSize)) {
    const command = new DescribeTasksCommand({ tasks: batch });
    const response = await client.send(command);
    if (response.failures && response.failures.length > 0) {
      throw new Error(
        `Failed to describe some tasks: ${JSON.stringify(
          response.failures,
          undefined,
          2
        )}`
      );
    }
    if (!response.tasks || response.tasks.length === 0) {
      throw new Error('No tasks were returned by AWS API');
    }
    tasks.push(...response.tasks);
  }
  return tasks;
};
