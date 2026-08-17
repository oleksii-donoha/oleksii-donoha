import { ECSClient, Task } from '@aws-sdk/client-ecs';
import { describe, expect, it, Mock, vi } from 'vitest';

import { paginate } from './index.js';
import { paginateClientCommand, paginateDescribeTasksRequest } from './util.js';

vi.mock('./util.js', async () => ({
  ...(await vi.importActual('./util.js')),
  paginateDescribeTasksRequest: vi.fn(),
  paginateClientCommand: vi.fn(),
}));

describe('paginate', () => {
  const mockClient = {} as ECSClient;

  it('should call paginateDescribeTasksRequest when input is an array of strings', async () => {
    const input = { taskArns: ['task1', 'task2'], clusterName: 'cluster' };
    const mockTasks: Task[] = [{ taskArn: 'task1' }, { taskArn: 'task2' }];
    vi.mocked(paginateDescribeTasksRequest).mockResolvedValue(mockTasks);
    // vi.mocked(isDescribeTasks).mockResolvedValueOnce(true)

    const result = await paginate(mockClient, input);

    expect(paginateDescribeTasksRequest).toHaveBeenCalledWith(
      mockClient,
      input,
    );
    expect(result).toEqual(mockTasks);
  });

  it('should call paginateClientCommand when input is a PaginatedCommandInput', async () => {
    const input = { cluster: 'cluster1' };
    const mockResponse = ['response1', 'response2'];
    (paginateClientCommand as Mock).mockResolvedValue(mockResponse);

    const result = await paginate(mockClient, input);

    expect(paginateClientCommand).toHaveBeenCalledWith(mockClient, input);
    expect(result).toEqual(mockResponse);
  });
});
