import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import dotenv from 'dotenv';
import { join } from 'path';

import {
  loadWorkflowsFromRange,
  loadWorkflowRunsFromRange,
  loadJobsFromRange,
} from './load.js';

import {
  mergeCsvFiles,
  buildJobsReportFromRange,
  buildWorkflowRunsReportFromRange,
  buildFailuresListFromRange,
} from './report.js';

import { getRepoPath, getDatesFromRange } from './utils.js';

dotenv.config();

const fromAndToOptions = {
  from: {
    describe: 'filter start date (format: YYYY-MM-DD, "yesterday" or "today")',
    default: 'yesterday',
    type: 'string'
  },
  to: {
    describe: 'filter start date (format: YYYY-MM-DD, "yesterday" or "today")',
    default: 'yesterday',
    type: 'string'
  },
};

yargs(hideBin(process.argv))
  .scriptName('yarn analytics')
  .recommendCommands()
  .demandCommand(1)
  .command(
    'load [name]',
    'loads specified entity',
    (yargs) => yargs
      .command('workflows', 'loads workflows', (yargs) => yargs, async ({ from, to }) => {
        await loadWorkflowsFromRange(from, to);
      })
      .command('workflow_runs', 'loads workflow runs', (yargs) => yargs, async ({ from, to }) => {
        await loadWorkflowRunsFromRange(from, to);
      })
      .command('jobs', 'loads jobs', (yargs) => yargs, async ({ from, to }) => {
        await loadJobsFromRange(from, to);
      })
      .options(fromAndToOptions)
      .demandCommand(1)
  )
  .command(
    'report [name]',
    'builds a report for specified entity',
    (yargs) => yargs
      .command('workflow_runs', 'builds a workflow runs report', (yargs) => yargs, async ({ from, to }) => {
        await buildWorkflowRunsReportFromRange(from, to);
      })
      .command('jobs', 'builds a jobs report', (yargs) => yargs, async ({ from, to }) => {
        await buildJobsReportFromRange(from, to);
      })
      .options(fromAndToOptions)
      .demandCommand(1)
  )
  .command(
    'failures jobs',
    'Builds a list of failed entities',
    (yargs) => yargs
      .options({
        ...fromAndToOptions,
        delimiter: {
          default: ',',
        },
        locale: {
          default: 'en-US',
        },
      }),
    async ({ from, to, delimiter, locale }) => {
      await buildFailuresListFromRange(from, to, { delimiter, locale });
    }
  )
  .command(
    'merge_reports [name]',
    'Merges reports with specific name',
    (yargs) => yargs
      .command('workflow_runs', 'Merges workflow runs reports', (yargs) => yargs, async ({ from, to }) => {
        mergeCsvFiles(
          join(getRepoPath(), 'workflow_runs.csv'),
          getDatesFromRange(from, to).reverse().map((date) => join(getRepoPath(), date, 'workflow_runs.csv'))
        );
      })
      .command('jobs', 'Merges jobs reports', (yargs) => yargs, async ({ from, to }) => {
        mergeCsvFiles(
          join(getRepoPath(), 'jobs_summary.csv'),
          getDatesFromRange(from, to).reverse().map((date) => join(getRepoPath(), date, 'jobs_summary.csv'))
        );
      })
      .options(fromAndToOptions)
      .demandCommand(1)
  )
  .command(
    'merge_failures',
    'Merges failure lists',
    (yargs) => yargs.options(fromAndToOptions),
    async ({ from, to }) => {
      mergeCsvFiles(
        join(getRepoPath(), 'jobs_failures.csv'),
        getDatesFromRange(from, to).reverse().map((date) => join(getRepoPath(), date, 'jobs_failures.csv'))
      );
    }
  )
  .parse();
