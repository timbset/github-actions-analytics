import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import dotenv from 'dotenv';
import { join } from 'path';
import fs from 'fs';

import {
  loadWorkflowsFromRange,
  loadWorkflowRunsFromRange,
  loadJobsFromRange,
} from './load.js';

import {
  mergeCsvFiles,
  buildJobsSummaryFromRange,
  buildWorkflowRunsSummaryFromRange,
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
  fetch: {
    describe: 'prepares data recursively if some is not ready yet',
    default: false,
    type: 'boolean'
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
        await loadWorkflowsFromRange({ from, to });
      })
      .command('workflow_runs', 'loads workflow runs', (yargs) => yargs, async ({ from, to }) => {
        await loadWorkflowRunsFromRange({ from, to });
      })
      .command('jobs', 'loads jobs', (yargs) => yargs, async ({ from, to }) => {
        await loadJobsFromRange({ from, to });
      })
      .options(fromAndToOptions)
      .demandCommand(1)
  )
  .command(
    'summary [name]',
    'builds a summary for specified entity',
    (yargs) => yargs
      .command('workflow_runs', 'builds a workflow runs summary', (yargs) => yargs, async ({ from, to }) => {
        await buildWorkflowRunsSummaryFromRange({ from, to });
      })
      .command('jobs', 'builds a jobs summary', (yargs) => yargs, async ({ from, to }) => {
        await buildJobsSummaryFromRange({ from, to });
      })
      .options(fromAndToOptions)
      .demandCommand(1)
  )
  .command(
    'report [name]',
    'Builds a report from summary data',
    (yargs) => yargs
      .command(
        'workflow_runs',
        'Builds workflow runs report from workflow runs summary',
        (yargs) => yargs.options(fromAndToOptions),
        async ({ from, to, fetch: withFetch }) => {
          const dates = getDatesFromRange({ from, to }).reverse();
          const summaryPaths = dates.map((date) => join(getRepoPath(), date, 'workflow_runs.csv'));

          await buildWorkflowRunsSummaryFromRange({ from, to, withFetch, isEnsure: true });

          mergeCsvFiles(
            join(getRepoPath(), 'workflow_runs.csv'),
            summaryPaths
          );
        }
      )
      .command(
        'workflow_runs_last_days',
        'Builds workflow runs from last N days',
        (yargs) => yargs.option({
          days: {
            description: 'the number of days',
            default: 14,
            type: 'number',
          },
          fetch: {
            describe: 'prepares data recursively if some is not ready yet',
            default: false,
            type: 'boolean'
          },
        }), async ({ fetch: withFetch, days }) => {
        const to = new Date();
        to.setDate(to.getDate() - 1);
        const from = new Date();
        from.setDate(from.getDate() - days);

        const dates = getDatesFromRange({
          from: from.toISOString().split('T')[0],
          to: to.toISOString().split('T')[0]
        }).reverse();

          await buildWorkflowRunsSummaryFromRange({
            from: from.toISOString().split('T')[0],
            to: to.toISOString().split('T')[0],
            withFetch,
            isEnsure: true
          });

          const summaryPaths = dates.map((date) => join(getRepoPath(), date, 'workflow_runs.csv'));

          mergeCsvFiles(
            join(getRepoPath(), 'workflow_runs.csv'),
            summaryPaths
          );
      })
      .command(
        'jobs',
        'Builds jobs report from jobs summary',
        (yargs) => yargs.options(fromAndToOptions),
        async ({ from, to }) => {
          mergeCsvFiles(
            join(getRepoPath(), 'jobs_summary.csv'),
            getDatesFromRange({ from, to }).reverse().map((date) => join(getRepoPath(), date, 'jobs_summary.csv'))
          );
        }
      )
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
