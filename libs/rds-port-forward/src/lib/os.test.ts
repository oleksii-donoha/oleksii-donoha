import { ChildProcess, execSync, spawn } from 'child_process';
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from 'winston';

import { Mediator } from './mediator.js';
import { isExecutableInPath, OsManager } from './os.js';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
} as unknown as Logger;

describe('OsManager', () => {
  let mediator: Mediator;
  beforeEach(() => {
    vi.clearAllMocks();
    mediator = {
      rawArgs: {},
      processedArgs: {},
      forwardingParams: {},
      target: {},
      awsCli: {},
    } as unknown as Mediator;
  });

  describe('isExecutableInPath', () => {
    it('should return true if the executable is found', () => {
      vi.mocked(execSync).mockReturnValueOnce('/usr/bin/aws');
      expect(isExecutableInPath('aws')).toBe(true);
      expect(execSync).toHaveBeenCalledWith('which aws', { encoding: 'utf8' });
    });

    it('should return false if the executable is not found', () => {
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw new Error('not found');
      });
      expect(isExecutableInPath('aws')).toBe(false);
      expect(execSync).toHaveBeenCalledWith('which aws', { encoding: 'utf8' });
    });
  });

  describe('OsManager constructor', () => {
    it('should throw an error if AWS CLI is not found', () => {
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw new Error('not found');
      });
      expect(() => new OsManager(mockLogger, mediator)).toThrow(
        'AWS CLI v2 executable was not found. Check out the documentation and install it first: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html',
      );
    });

    it('should throw an error if session manager plugin is not found', () => {
      vi.mocked(execSync)
        .mockReturnValueOnce('/usr/bin/aws')
        .mockImplementationOnce(() => {
          throw new Error('not found');
        });
      expect(() => new OsManager(mockLogger, mediator)).toThrow(
        'Session manager plugin executable was not found. Check out the documentation and install it first: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html',
      );
    });

    it('should create an instance if all executables are found', () => {
      vi.mocked(execSync).mockReturnValue('/usr/bin/aws');
      const osManager = new OsManager(mockLogger, mediator);
      expect(osManager).toBeInstanceOf(OsManager);
    });
  });

  describe('runSession', () => {
    const mockSpawn = vi.mocked(spawn);
    let osManager: OsManager;
    let mockProcess: NodeJS.Process;

    beforeEach(() => {
      vi.mocked(execSync).mockReturnValue('/usr/bin/aws');
      osManager = new OsManager(mockLogger, mediator);
      mockProcess = new EventEmitter() as unknown as NodeJS.Process;
      mockProcess.kill = vi.fn(() => true) as unknown as typeof process.kill;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should spawn a child process with the correct arguments', async () => {
      const mockChildProcess = {
        on: vi.fn((event, callback) => {
          if (event === 'exit') {
            callback(0, null);
          }
        }),
      } as unknown as ChildProcess;
      mockSpawn.mockReturnValue(mockChildProcess);

      const target = 'fake-target';
      const params = '{"portNumber":["3306"],"localPortNumber":["3306"]}';
      const result = await osManager.runSession(target, params, mockProcess);

      expect(result).toBe(0);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Running the command: aws ssm start-session --target ${target} --parameters '${params}' --document-name AWS-StartPortForwardingSessionToRemoteHost`,
      );
      expect(mockSpawn).toHaveBeenCalledWith(
        'aws',
        [
          'ssm',
          'start-session',
          '--target',
          target,
          '--parameters',
          `'${params}'`,
          '--document-name',
          'AWS-StartPortForwardingSessionToRemoteHost',
        ],
        { stdio: 'inherit', shell: true },
      );
    });

    it('should pass profile and region args to the child process', async () => {
      const mockChildProcess = {
        on: vi.fn((event, callback) => {
          if (event === 'exit') {
            callback(0, null);
          }
        }),
      } as unknown as ChildProcess;
      mockSpawn.mockReturnValue(mockChildProcess);
      mediator.awsCli = { region: 'fake-region', profile: 'fake-profile' };
      osManager = new OsManager(mockLogger, mediator);

      const target = 'fake-target';
      const params = '{"portNumber":["3306"],"localPortNumber":["3306"]}';
      const result = await osManager.runSession(target, params, mockProcess);

      expect(result).toBe(0);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Running the command: aws ssm start-session --target ${target} --parameters '${params}' --document-name AWS-StartPortForwardingSessionToRemoteHost --profile fake-profile --region fake-region`,
      );
      expect(mockSpawn).toHaveBeenCalledWith(
        'aws',
        [
          'ssm',
          'start-session',
          '--target',
          target,
          '--parameters',
          `'${params}'`,
          '--document-name',
          'AWS-StartPortForwardingSessionToRemoteHost',
          '--profile',
          'fake-profile',
          '--region',
          'fake-region',
        ],
        { stdio: 'inherit', shell: true },
      );
    });

    it('should handle signals and terminate the child process', async () => {
      const mockChildProcess = {
        pid: 1234,
        on: vi.fn((event, callback) => {
          if (event === 'exit') {
            callback(0, null);
          }
        }),
      } as unknown as ChildProcess;
      mockSpawn.mockReturnValue(mockChildProcess);

      const target = 'fake-target';
      const params = '{"portNumber":["3306"],"localPortNumber":["3306"]}';

      const mockProcess = new EventEmitter() as unknown as typeof process;
      mockProcess.kill = vi.fn(() => true) as unknown as typeof process.kill;

      const promise = osManager.runSession(target, params, mockProcess);

      mockProcess.emit('SIGINT');
      expect(mockLogger.debug).toHaveBeenCalledWith('Handling SIGINT');
      expect(mockProcess.kill).toHaveBeenCalledWith(1234, 'SIGINT');

      mockProcess.emit('SIGTERM');
      expect(mockLogger.debug).toHaveBeenCalledWith('Handling SIGTERM');
      expect(mockProcess.kill).toHaveBeenCalledWith(1234, 'SIGTERM');

      await promise;
    });

    it('should log and resolve with the exit code when the process exits', async () => {
      const mockChildProcess = {
        on: vi.fn((event, callback) => {
          if (event === 'exit') {
            callback(1, null);
          }
        }),
      } as unknown as ChildProcess;
      mockSpawn.mockReturnValue(mockChildProcess);

      const target = 'fake-target';
      const params = '{"portNumber":["3306"],"localPortNumber":["3306"]}';
      const result = await osManager.runSession(target, params, mockProcess);

      expect(result).toBe(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Child process exited with code 1',
      );
    });

    it('should log and resolve with null if the process is terminated by a signal', async () => {
      const mockChildProcess = {
        on: vi.fn((event, callback) => {
          if (event === 'exit') {
            callback(null, 'SIGTERM');
          }
        }),
      } as unknown as ChildProcess;
      mockSpawn.mockReturnValue(mockChildProcess);

      const target = 'fake-target';
      const params = '{"portNumber":["3306"],"localPortNumber":["3306"]}';
      const result = await osManager.runSession(target, params, mockProcess);

      expect(result).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Child process terminated due to receipt of signal SIGTERM',
      );
    });
  });
});
