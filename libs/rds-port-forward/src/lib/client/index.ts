import { ECSClient, Task } from '@aws-sdk/client-ecs';
import {
  isDescribeTasks,
  paginateClientCommand,
  PaginatedCommandInput,
  paginateDescribeTasksRequest,
  RawDescribeTasksInput,
} from './util.js';

export const paginate = async <
  T extends RawDescribeTasksInput | PaginatedCommandInput
>(
  client: ECSClient,
  input: T
): Promise<T extends RawDescribeTasksInput ? Task[] : string[]> => {
  return isDescribeTasks(input)
    ? ((await paginateDescribeTasksRequest(
        client,
        input
      )) as T extends RawDescribeTasksInput ? Task[] : string[])
    : ((await paginateClientCommand(
        client,
        input
      )) as T extends RawDescribeTasksInput ? Task[] : string[]);
};
