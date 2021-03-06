import * as yargs from 'yargs'
import pino = require('pino')
import { createClient as createCMAClient } from 'contentful-management'

import { processAssets } from './lib/process-assets'
import { CancellationToken } from './lib/cancellation-token'

const yargsInst = yargs
  .help()
  .option('access-token', {
    alias: 't',
    describe: 'cma access token to use',
    required: true,
  })
  .option('spaces', {
    alias: 's',
    describe: 'the space ids to process',
    conflicts: 'all-spaces',
    type: 'array',
  })
  .option('all-spaces', {
    alias: 'S',
    describe: 'process assets in all spaces this token can access',
    conflicts: 'spaces',
    type: 'boolean',
  })
  .option('environments', {
    alias: 'e',
    describe: 'the environments to process',
    type: 'array',
    conflicts: 'all-environments'
  })
  .option('all-environments', {
    alias: 'E',
    describe: 'process assets in all environments',
    type: 'boolean',
    conflicts: 'environments',
  })
  .check(argv => {
    if (!argv.spaces?.length && !argv.allSpaces) {
      throw new Error('Either --all-spaces must be set, or --spaces list must be provided')
    }
    if (!argv.environments?.length && !argv.allEnvironments) {
      throw new Error('Either --all-environments must be set, or --environments list must be provided')
    }
    return true
  })
  .option('force-republish', {
    describe: 'force-republishes all cross-referencing previously-published assets, WARNING: even those that had previously unpublished changes in the most recent draft',
    type: 'boolean',
    default: false
  })
  .option('processing-attempts', {
    describe: 'the number of times to attempt processing a given asset before giving up',
    type: 'number',
    default: 3,
  })
  .check(argv => {
    if ((argv.processingAttempts as number) < 1) {
      throw new Error('--processing-attempts must be >= 1')
    }
    return true
  })
  .option('skip-archived', {
    describe: 'whether to skip processing archived assets',
    type: 'boolean',
    default: false
  })
  .option('dry-run', {
    describe: 'runs in dry-run mode (no changes will be made)',
    type: 'boolean',
    default: false
  })
  .option('verbose', {
    describe: 'verbosity level (set more than once for more verbose)',
    count: true,
    alias: 'v',
  })
  .strict()

export async function run(argv = yargsInst.argv) {
  let logLevel: pino.Level = 'info'
  if (argv.verbose >= 2)  {
    logLevel = 'trace'
  } else if (argv.verbose === 1) {
    logLevel = 'debug'
  }
  const logger = pino({
    level: logLevel,
  }) // to stderr

  const client = createCMAClient({
    accessToken: argv.accessToken as string,
    application: 'fix-asset-cross-refs'
  })
  const cancelToken = new CancellationToken()

  process.once('SIGTERM', () => cancelToken.cancel())
  process.once('SIGINT', () => cancelToken.cancel())

  try {
    await processAssets({
      client,
      spaceIds: argv.spaces as string[] | undefined,
      envIds: argv.environments as string[] | undefined,
      opts: {
        skipArchived: argv.skipArchived as boolean,
        processingAttempts: argv.processingAttmepts as number,
        forceRepublish: argv.forceRepublish as boolean,
        dryRun: argv.dryRun as boolean
      },
      cancelToken,
      logger
    })
  } catch(err) {
    logger.error({ err }, 'Error processing assets')
  }
}
