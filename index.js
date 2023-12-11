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
  buildJobsSummaryFromRange,
  buildWorkflowRunsSummaryFromRange,
  buildFailuresListFromRange,
} from './report.js';

import { getRepoPath, getDatesFromRange, getDateRange } from './utils.js';

dotenv.config();

const options = {
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
  id: {
    describe: 'a list of workflow ids to load',
    default: [],
    type: 'array'
  },
  fetch: {
    describe: 'prepares data recursively if some is not ready yet',
    default: false,
    type: 'boolean'
  },
  days: {
    description: 'the number of days',
    default: 7,
    type: 'number',
  },
  delimiter: {
    default: ',',
  },
  locale: {
    default: 'en-US',
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
      .command(
        'workflow_runs',
        'loads workflow runs',
        (yargs) => yargs.options({ id: options.id }),
        async ({ from, to, id }) => {
          await loadWorkflowRunsFromRange({ from, to, ids: id });
        }
      )
      .command(
        'jobs',
        'loads jobs',
        (yargs) => yargs.options({ id: options.id }),
        async ({ from, to, id }) => {
          await loadJobsFromRange({ from, to, ids: id });
        }
      )
      .options({
        from: options.from,
        to: options.to,
      })
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
      .options({
        from: options.from,
        to: options.to,
      })
      .demandCommand(1)
  )
  .command(
    'report [name]',
    'Builds a report from summary data',
    (yargs) => yargs
      .command(
        'workflow_runs',
        'Builds workflow runs report from workflow runs summary',
        (yargs) => yargs.options({
          from: options.from,
          to: options.to,
          fetch: options.fetch,
        }),
        async ({ from, to, fetch: withFetch }) => {
          const dates = getDatesFromRange({ from, to }).reverse();
          const summaryPaths = dates.map((date) => join(getRepoPath(), 'daily', date, 'workflow_runs.csv'));

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
          fetch: options.fetch,
          days: options.days,
        }), async ({ fetch: withFetch, days }) => {
          const [from, to] = getDateRange(days);

          await buildWorkflowRunsSummaryFromRange({
            from,
            to,
            withFetch,
          });

          const summaryPaths = getDatesFromRange({ from, to })
            .reverse()
            .map((date) => join(getRepoPath(), 'daily', date, 'workflow_runs.csv'));

          mergeCsvFiles(
            join(getRepoPath(), `workflow_runs_last_${days}_days.csv`),
            summaryPaths
          );
      })
      .command(
        'jobs',
        'Builds jobs report from jobs summary',
        (yargs) => yargs.options({
          from: options.from,
          to: options.to,
        }),
        async ({ from, to }) => {
          mergeCsvFiles(
            join(getRepoPath(), 'jobs_summary.csv'),
            getDatesFromRange({ from, to }).reverse().map((date) => join(getRepoPath(), 'daily', date, 'jobs_summary.csv'))
          );
        }
      )
      .command(
        'jobs_last_days',
        'Builds jobs report from jobs last N days',
        (yargs) => yargs.options({
          days: options.days,
          fetch: options.fetch,
        }),
        async ({ days, fetch: withFetch }) => {
          const [from, to] = getDateRange(days);

          await buildJobsSummaryFromRange({
            from,
            to,
            withFetch,
          });

          const summaryPaths = getDatesFromRange({ from, to })
            .reverse()
            .map((date) => join(getRepoPath(), 'daily', date, 'jobs_summary.csv'));

          mergeCsvFiles(
            join(getRepoPath(), `jobs_summary_last_${days}_days.csv`),
            summaryPaths
          );
        }
      )
      .command(
        'failures_last_days',
        'Builds failure list report from jobs last N days',
        (yargs) => yargs.options({
          days: options.days,
          fetch: options.fetch,
          delimiter: options.delimiter,
          locale: options.locale,
        }),
        async ({ days, fetch: withFetch, delimiter, locale }) => {
          const [from, to] = getDateRange(days);

          console.log(`Building report from ${from} to ${to}`);

          await buildFailuresListFromRange({ from, to, delimiter, locale, withFetch });

          const summaryPaths = getDatesFromRange({ from, to })
            .reverse()
            .map((date) => join(getRepoPath(), 'daily', date, 'jobs_failures.csv'));

          mergeCsvFiles(
            join(getRepoPath(), `jobs_failures_last_${days}_days.csv`),
            summaryPaths
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
        from: options.from,
        to: options.to,
        delimiter: options.delimiter,
        locale: options.locale,
      }),
    async ({ from, to, delimiter, locale }) => {
      await buildFailuresListFromRange({ from, to, delimiter, locale });
    }
  )
  .command(
    'merge_failures',
    'Merges failure lists',
    (yargs) => yargs.options({
      from: options.from,
      to: options.to,
    }),
    async ({ from, to }) => {
      mergeCsvFiles(
        join(getRepoPath(), 'jobs_failures.csv'),
        getDatesFromRange({ from, to }).reverse().map((date) => join(getRepoPath(), 'daily', date, 'jobs_failures.csv'))
      );
    }
  )
  .parse();
