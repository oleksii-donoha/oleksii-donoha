import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { Mediator } from './mediator.js';

type SkippableArg = {
  skippable: true;
  value: string | undefined;
};

type RequiredArg = {
  skippable: false;
  value: string;
};

export type Arg = SkippableArg | RequiredArg;

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

export class CliManager {
  private mediator: Mediator;

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
          describe: 'Name (fuzzy) of the service that hosts target task',
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

    this.mediator.rawArgs = argKeys.reduce((acc, argKey) => {
      acc[argKey] = parsedArgv[argKey];
      return acc;
    }, {} as Pick<typeof parsedArgv, ArgKey>);
    this.mediator.verbose = parsedArgv.verbose ?? false;
  }

  get equivalent() {
    if (
      !this.mediator.processedArgs ||
      Object.keys(this.mediator.processedArgs).length === 0
    ) {
      throw new Error('There is no collected argument data from resolvers');
    }
    return this.mediator.processedArgs;
  }

  public formatCliArgs(format: 'full' | 'only-required') {
    const args = Object.entries(this.equivalent).reduce((acc, [key, arg]) => {
      if (!arg.value || (format === 'only-required' && arg.skippable))
        return acc;
      acc.push(`--${key} ${arg.value}`);
      return acc;
    }, [] as string[]);
    return args.join(' ');
  }
}
