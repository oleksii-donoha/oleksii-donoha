import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { Mediator } from '../mediator.js';
import {
  ArgKey,
  argKeys,
  awsCliSpecificOptions,
  cliOptions,
  conflictingCliOptions,
  NO_RESOLVER_DATA,
  scriptName,
} from './uiText.js';

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

/**
 * Handles CLI interface and operations on arguments
 */
export class CliManager {
  protected mediator: Mediator;

  constructor(argv: typeof process.argv, mediator: Mediator) {
    this.mediator = mediator;
    const yargsInstance = yargs();
    const parsedArgv = yargsInstance
      .scriptName(scriptName)
      .options(cliOptions)
      .conflicts(...conflictingCliOptions)
      .version(false)
      .wrap(yargsInstance.terminalWidth())
      .parseSync(hideBin(argv));

    this.mediator.rawArgs = argKeys.reduce(
      (acc, argKey) => {
        acc[argKey] = parsedArgv[argKey];
        return acc;
      },
      {} as Pick<typeof parsedArgv, ArgKey>,
    );
    this.mediator.verbose = parsedArgv.verbose ?? false;
    for (const arg of awsCliSpecificOptions) {
      if (parsedArgv[arg]) {
        this.mediator.processedArgs[arg] = {
          skippable: false,
          value: parsedArgv[arg],
        };
      }
    }
  }

  /**
   * Returns the processed args committed to the mediator object by resolvers
   */
  get equivalent() {
    if (
      !this.mediator.processedArgs ||
      Object.keys(this.mediator.processedArgs).length === 0
    ) {
      throw new Error(NO_RESOLVER_DATA);
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
