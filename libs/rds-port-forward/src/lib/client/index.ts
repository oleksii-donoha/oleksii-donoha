import { ECSClient, Task } from '@aws-sdk/client-ecs';
import {
  PaginatedCommandInput,
  paginateDescribeTasksRequest,
  paginateClientCommand,
} from './util';

export const paginate = async <T extends string[] | PaginatedCommandInput>(
  client: ECSClient,
  input: T
): Promise<T extends string[] ? Task[] : string[]> => {
  return Array.isArray(input)
    ? ((await paginateDescribeTasksRequest(client, input)) as T extends string[]
        ? Task[]
        : string[])
    : ((await paginateClientCommand(client, input)) as T extends string[]
        ? Task[]
        : string[]);
};
