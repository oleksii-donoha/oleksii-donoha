import { Logger } from 'winston';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

type Arg = {
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

type ArgKey = (typeof argKeys)[number];

export enum CliOptionType {
  Skippable,
  Required,
}

export class CliManager {
  private incoming: Record<ArgKey, string | undefined>;
  #equivalent: Partial<Record<ArgKey, Arg>> | undefined;
  private logger: Logger;

  constructor(logger: Logger, argv: typeof process.argv) {
    this.logger = logger;
    this.#equivalent = undefined;
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

    this.incoming = argKeys.reduce((acc, argKey) => {
      acc[argKey] = parsedArgv[argKey];
      return acc;
    }, {} as Record<ArgKey, string | undefined>);
    this.logger.debug('Parsed incoming CLI arguments to', this.incoming);
  }

  get equivalent() {
    if (!this.#equivalent) {
      throw new Error(
        'The equivalent CLI args are not set. Did you forget to set them while processing the target?'
      );
    }
    return this.#equivalent;
  }

  public markCliOptionAs(
    optionType: CliOptionType,
    argKey: ArgKey,
    value: string | undefined
  ) {
    const skippable = optionType === CliOptionType.Skippable;
    if (!this.#equivalent) {
      this.#equivalent = {
        [argKey]: { value, skippable },
      };
    } else {
      this.#equivalent[argKey] = { value, skippable };
    }
  }
}
