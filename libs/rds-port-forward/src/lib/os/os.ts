import { execSync, spawn } from 'child_process';
import process from 'process';
import { Logger } from 'winston';

import { Mediator } from '../mediator.js';
import { osText } from './uiText.js';

const DOCUMENT_NAME = 'AWS-StartPortForwardingSessionToRemoteHost';
const COMMAND = 'aws' as const;
const SSM_SUBCOMMAND = ['ssm', 'start-session'] as const;
const SSM_PLUGIN_EXECUTABLE = 'session-manager-plugin' as const;

export const isExecutableInPath = (name: string): boolean => {
  try {
    // TODO: add windows support with where.exe or similar
    execSync(`which ${name}`, { encoding: 'utf8' });
    return true;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_) {
    return false;
  }
};

/**
 * Manages interaction with OS and shell
 */
export class OsManager {
  protected logger: Logger;
  protected mediator: Mediator;
  constructor(logger: Logger, mediator: Mediator) {
    if (!isExecutableInPath(COMMAND)) {
      throw new Error(osText.AWS_CLI_MISSING);
    }
    if (!isExecutableInPath(SSM_PLUGIN_EXECUTABLE)) {
      throw new Error(osText.SSM_PLUGIN_MISSING);
    }
    this.logger = logger;
    this.mediator = mediator;
  }

  /**
   * Formats the AWS CLI command and runs it async
   * @param target formatted ECS target
   * @param params formatted forwarding params
   * @param eventEmitter event emitter to use when executing (`process` in runtime)
   * @returns promise that will resolve to the exit code of the child process
   */
  public async runSession(
    target: string,
    params: string,
    eventEmitter: typeof process = process,
  ): Promise<number | null> {
    const args = [
      ...SSM_SUBCOMMAND,
      '--target',
      target,
      '--parameters',
      `'${params}'`,
      '--document-name',
      DOCUMENT_NAME,
    ];
    for (const arg of ['profile', 'region'] as const) {
      if (this.mediator.rawArgs[arg]) {
        args.push(`--${arg}`, this.mediator.rawArgs[arg]);
      }
    }

    this.logger.debug(`Running the command: ${COMMAND} ${args.join(' ')}`);

    const childProcess = spawn(COMMAND, args, {
      stdio: 'inherit',
      shell: true,
    });

    const handleSignal = (signal: NodeJS.Signals) => {
      this.logger.debug(`Handling ${signal}`);
      if (childProcess.pid) {
        eventEmitter.kill(childProcess.pid, signal);
      }
    };

    eventEmitter.on('SIGINT', () => handleSignal('SIGINT'));
    eventEmitter.on('SIGTERM', () => handleSignal('SIGTERM'));

    return new Promise<number | null>((resolve) => {
      childProcess.on('exit', (code, signal) => {
        if (signal) {
          this.logger.info(osText.CHILD_TERMINATED + ` (${signal})`);
        } else {
          this.logger.info(osText.CHILD_EXITED + ` (code ${code})`);
        }
        resolve(code);
      });
    });
  }
}
