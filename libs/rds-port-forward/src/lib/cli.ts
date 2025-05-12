import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { Mediator } from './mediator.js';

/**
 * CLI argument that can be skipped when running the command repeatedly
 */
type SkippableArg = {
  skippable: true;
  value: string | undefined;
};

type RequiredArg = {
  skippable: false;
  value: string;
};

export type Arg = SkippableArg | RequiredArg;

// used to narrow down the argv type to the options that we care about
const argKeys = [
  'cluster',
  'service',
  'container',
  'db-host',
  'db-host-from-container-env',
  'port',
  'local-port',
] as const;

export type ArgKey = (typeof argKeys)[number];

/**
 * Handles CLI interface and operations on arguments
 */
export class CliManager {
  protected mediator: Mediator;

  constructor(argv: typeof process.argv, mediator: Mediator) {
    this.mediator = mediator;
    const parsedArgv = yargs()
      .scriptName('rds-port-forward')
      .options({
        cluster: {
          describe: 'Name of the ECS cluster where target resides',
          type: 'string',
        },
        service: {
          describe:
            'Name (fuzzy) of the service that hosts target task\nRecommended to use when dealing with big clusters with lots of tasks',
          type: 'string',
        },
        container: {
          describe:
            'Name (fuzzy) of the container that will be used to forward the port',
          type: 'string',
        },
        'db-host': {
          describe:
            'Hostname (or IP address) of the DB instance to which the local port will be forwarded',
          type: 'string',
        },
        'db-host-from-container-env': {
          describe: `Target container's environment variable whose value points to the DB hostname (or IP)`,
          type: 'string',
        },
        port: {
          describe: 'Remote port to forward traffic to',
          type: 'string',
        },
        'local-port': {
          describe: 'Port on your machine that will listen to requests',
          type: 'string',
        },
        verbose: {
          describe: 'Prints more logs for debugging',
          type: 'boolean',
        },
      })
      .conflicts('db-host', 'db-host-from-container-env')
      .parseSync(hideBin(argv));

    this.mediator.rawArgs = argKeys.reduce(
      (acc, argKey) => {
        acc[argKey] = parsedArgv[argKey];
        return acc;
      },
      {} as Pick<typeof parsedArgv, ArgKey>,
    );
    this.mediator.verbose = parsedArgv.verbose ?? false;
  }

  /**
   * Returns the processed args committed to the mediator object by resolvers
   */
  get equivalent() {
    if (
      !this.mediator.processedArgs ||
      Object.keys(this.mediator.processedArgs).length === 0
    ) {
      throw new Error('There is no collected argument data from resolvers');
    }
    return this.mediator.processedArgs;
  }

  /**
   * Formats CLI arguments that can be used for repeat invocations
   * @param format 'full' or 'only-required'
   * @returns formatted string
   */
  public formatCliArgs(format: 'full' | 'only-required') {
    const args = Object.entries(this.equivalent).reduce((acc, [key, arg]) => {
      if (!arg.value || (format === 'only-required' && arg.skippable))
        return acc;
      acc.push(`\t--${key} ${arg.value}`);
      return acc;
    }, [] as string[]);
    return args.join(' \\\n');
  }
}
