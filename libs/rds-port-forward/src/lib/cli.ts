import { Logger } from 'winston';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { Mediator } from './mediator.js';

export type Arg = {
  value: string | undefined;
  skippable?: boolean;
};

const argKeys = [
  'cluster',
  'service',
  'container',
  'db-host',
  'db-host-from-container-env',
] as const;

export type ArgKey = (typeof argKeys)[number];

export enum CliOptionType {
  Skippable,
  Required,
}

export class CliManager {
  private logger: Logger;
  private mediator: Mediator;

  constructor(logger: Logger, mediator: Mediator, argv: typeof process.argv) {
    this.logger = logger;
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
      })
      .conflicts('db-host', 'db-host-from-container-env')
      .parseSync(hideBin(argv));

    this.mediator.rawArgs = argKeys.reduce((acc, argKey) => {
      acc[argKey] = parsedArgv[argKey];
      return acc;
    }, {} as Record<ArgKey, string | undefined>);
    this.logger.debug(
      'Parsed incoming CLI arguments to',
      this.mediator.rawArgs
    );
  }

  get equivalent() {
    if (
      !this.mediator.processedArgs ||
      Object.keys(this.mediator).length === 0
    ) {
      throw new Error('There is no collected argument data from resolvers');
    }
    return this.mediator.processedArgs;
  }
}
