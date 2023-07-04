import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import dotenv from 'dotenv';

import { loadWorkflows, loadWorkflowRuns, loadJobs } from './load.js';
import { buildJobsReport, buildWorkflowRunsReport, buildFailuresList } from './report.js';

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
      .command('workflows', 'loads workflows', (yargs) => yargs, async ({ date }) => {
        await loadWorkflows(date);
      })
      .command('workflow_runs', 'loads workflow runs', (yargs) => yargs, async ({ date }) => {
        await loadWorkflowRuns(date);
      })
      .command('jobs', 'loads jobs', (yargs) => yargs, async ({ date }) => {
        await loadJobs(date);
      })
      .option('date', {
        describe: 'date for which data will be loaded (format: YYYY-MM-DD, "yesterday" or "today")',
        default: 'yesterday',
        type: 'string'
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
  .parse();
