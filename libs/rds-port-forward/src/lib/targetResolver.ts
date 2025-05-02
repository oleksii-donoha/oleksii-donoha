import { DesiredStatus, ECSClient } from '@aws-sdk/client-ecs';
import { confirm, select } from '@inquirer/prompts';
import Fuse from 'fuse.js';
import { paginate } from './client';

export class TargetResolver {
  private readonly ecsClient: ECSClient;
  private clusterName: string | undefined;
  private taskId: string | undefined;
  private containerRuntimeId: string | undefined;
  private serviceName: string | undefined;

  constructor(ecsClient: ECSClient) {
    this.ecsClient = ecsClient;
    this.clusterName = undefined;
    this.taskId = undefined;
    this.containerRuntimeId = undefined;
    this.serviceName = undefined;
  }

  private failIfClusterNameIsNotSet() {
    if (!this.clusterName) {
      throw new Error(
        'Cluster name is not set. Did you run `resolveCluster()` first?'
      );
    }
  }

  private failIfTaskIdIsNotSet() {
    if (!this.taskId) {
      throw new Error('Task ID is not set. Did you run `resolveTask()` first?');
    }
  }

  get target(): string {
    this.failIfClusterNameIsNotSet();
    this.failIfTaskIdIsNotSet();
    if (!this.containerRuntimeId) {
      throw new Error('Target container runtime ID was not resolved');
    }
    return `ecs:${this.clusterName}_${this.taskId}_${this.containerRuntimeId}`;
  }

  async resolveCluster(): Promise<ThisType<TargetResolver>> {
    const allClusterArns = await paginate(this.ecsClient, {});
    this.clusterName = await select({
      message: '🌍 Select the target ECS cluster',
      choices: allClusterArns.map((arn) => {
        return {
          value: arn.split('/')[1],
        };
      }),
    });
    return this;
  }

  async resolveService(
    serviceNameLike?: string
  ): Promise<ThisType<TargetResolver>> {
    this.failIfClusterNameIsNotSet();
    if (!serviceNameLike) {
      return this;
    }

    const serviceNames = (
      await paginate(this.ecsClient, {
        cluster: this.clusterName,
      })
    ).map((arn) => arn.split('/').pop());
    if (serviceNames.length === 0) {
      throw new Error('No services found in the cluster');
    }
    const exactMatch = serviceNames.find((name) => name === serviceNameLike);
    if (exactMatch) {
      this.serviceName = exactMatch;
      return this;
    }

    const potentialServices = new Fuse(serviceNames, {
      shouldSort: true,
    })
      .search(serviceNameLike)
      .map((match) => match.item);
    if (potentialServices.length === 0) {
      throw new Error(
        `No services matching or similar to '${serviceNameLike}' were found`
      );
    }
    if (potentialServices.length === 1) {
      if (
        !(await confirm({
          message: `❔ Found a similarly named service '${potentialServices[0]}', is it OK to use it?`,
        }))
      ) {
        throw new Error('Cannot use the only potential matching service');
      }
      this.serviceName = potentialServices[0];
      return this;
    }
    this.serviceName = await select({
      message:
        '🤔 Multiple similarly named services found, select the one to use',
      choices: potentialServices.map((s) => {
        return { value: s };
      }),
    });
    return this;
  }

  async resolveTask(): Promise<ThisType<TargetResolver>> {
    this.failIfClusterNameIsNotSet();
    const allTaskArns = await paginate(this.ecsClient, {
      cluster: this.clusterName,
      serviceName: this.serviceName,
      desiredStatus: DesiredStatus.RUNNING,
    });

    if (allTaskArns.length === 0) {
      throw new Error(
        'No running tasks matching the input parameters were found'
      );
    }

    if (
      allTaskArns.length === 1 ||
      (this.serviceName && allTaskArns.length > 0)
    ) {
      // If service is set, all tasks use the same definition
      this.taskId = allTaskArns[0].split('/').pop();
      return this;
    }

    const detailedTasks = await paginate(this.ecsClient, allTaskArns);
    this.taskId = await select({
      message: '🤔 Select a matching task',
      choices: detailedTasks.map((task) => {
        return {
          value: task.taskArn?.split('/').pop(),
          description: [
            `Name (tag): ${
              task.tags?.find((tag) => tag.key === 'Name')?.value
            }`,
            `Task definition: ${task.taskDefinitionArn?.split('/').pop()}`,
            'Containers:',
            ...(task.containers?.map((c) => `- ${c.name}; ${c.image}`) || []),
          ].join('\n'),
        };
      }),
    });
    return this;
  }

  async resolveContainer(): Promise<ThisType<TargetResolver>> {
    this.failIfClusterNameIsNotSet();
    this.failIfTaskIdIsNotSet();

    const taskDetails = await paginate(this.ecsClient, [this.taskId as string]);
    if (taskDetails.length === 0) {
      throw new Error(
        `Task with ID '${this.taskId}' was not found. Did it get evicted in the meantime?`
      );
    }
    const task = taskDetails[0];
    if (!task.containers || task.containers.length === 0) {
      throw new Error(`No containers found inside the task ${this.taskId}`);
    }
    if (task.containers.length === 1) {
      this.containerRuntimeId = task.containers[0].runtimeId;
      return this;
    }
    this.containerRuntimeId = await select({
      message: '🤔 Select the container that will be used for port forwarding',
      choices: task.containers.map((c) => {
        return {
          value: c.runtimeId,
          name: `${c.name} (${c.image})`,
        };
      }),
    });
    return this;
  }
}
