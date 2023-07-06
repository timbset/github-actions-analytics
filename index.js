import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import dotenv from 'dotenv';
import { join } from 'path';

import {
  loadWorkflowsFromRange,
  loadWorkflowRunsFromRange,
  loadJobsFromRange,
} from './load.js';

import { buildJobsReport, buildWorkflowRunsReport, buildFailuresList, mergeCsvFiles } from './report.js';
import { getRepoPath, getDatesFromRange } from './utils.js';

dotenv.config();

const addFromAndToOptions = (yargs) => yargs.options({
  from: {
    describe: 'filter start date (format: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)',
    default: 'yesterday',
    type: 'string'
  },
  to: {
    describe: 'filter start date (format: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)',
    default: 'today',
    type: 'string'
  },
});

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
      .options({
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
      })
      .demandCommand(1)
  )
  .command(
    'report [name]',
    'builds a report for specified entity',
    (yargs) => yargs
      .command('workflow_runs', 'builds a workflow runs report', (yargs) => yargs, async ({ date }) => {
        await buildWorkflowRunsReport(date);
      })
      .command('jobs', 'builds a jobs report', (yargs) => yargs, async ({ date }) => {
        await buildJobsReport(date);
      })
      .option('date', {
        describe: 'date for which data will be loaded (format: YYYY-MM-DD, "yesterday" or "today")',
        default: 'yesterday',
        type: 'string'
      })
      .demandCommand(1)
  )
  .command(
    'jobs failures',
    'Builds a list of failed jobs',
    (yargs) =>
      addFromAndToOptions(yargs)
        .options({
          delimiter: {
            default: ',',
          },
          locale: {
            default: 'en-US',
          },
        }),
    async ({ date, delimiter, locale }) => {
      await buildFailuresList(date, { delimiter, locale })
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
      .options({
        from: {
          describe: 'filter start date (format: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)',
          default: 'yesterday',
          type: 'string'
        },
        to: {
          describe: 'filter start date (format: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)',
          default: 'today',
          type: 'string'
        },
      })
      .demandCommand(1)
  )
  .parse();
