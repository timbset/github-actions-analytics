import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { URL, fileURLToPath } from 'url';

import { builder as loadBuilder } from './load.js';

const DEFAULT_LOCALE = 'de-DE';

dotenv.config();

const getEnv = (name) => {
  if (process.env[name] == null) {
    throw new Error(`Env ${name} is required`);
  }

  return process.env[name];
};

const normalizeNumber = (value) => {
  return value < 10 ? `0${value}` : `${value}`;
};

const normalizeDate = (date) => {
  if (date === 'today') {
    const today = new Date();

    return [
      today.getUTCFullYear(),
      normalizeNumber(today.getUTCMonth() + 1),
      today.getUTCDate(),
    ].join('-');
  }

  if (date === 'yesterday') {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    return [
      yesterday.getUTCFullYear(),
      normalizeNumber(yesterday.getUTCMonth() + 1),
      normalizeNumber(yesterday.getUTCDate()),
    ].join('-');
  }

  if (/\d{4}(-\d{2}){2}(T(\d{2}:){2}\d{2}Z)?/.test(date)) {
    return date;
  }

  throw new Error(`Invalid date format for ${date}`);
};

const buildCreated = (from, to) => `${normalizeDate(from)}..${normalizeDate(to)}`;

const getRepoDirName = () => `${getEnv('GH_REPO_OWNER')}/${getEnv('GH_REPO_NAME')}`.replace('/', '\u2215');

const convertJsonJobsToCsv = (sourcePath, targetPath, headers, filter = () => true) => {
  const dateFormatter = Intl.DateTimeFormat(DEFAULT_LOCALE, { dateStyle: 'short', timeStyle: 'medium' });
  const jobs = JSON.parse(fs.readFileSync(sourcePath)).jobs;

  fs.writeFileSync(targetPath, [headers.join(';')].concat(
      jobs.filter(filter).map((job) =>
        headers.map((header) =>
          header.endsWith('_at')
            ? dateFormatter.format(new Date(job[header]))
            : job[header]
        ).join(';')
      )
    ).join('\n')
  );
};

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

const getWorkflowId = (workflow) => {
  const splitted = workflow.path.split('/');
  return splitted[splitted.length - 1];
};

yargs(hideBin(process.argv))
  .scriptName('yarn analytics')
  .recommendCommands()
  .demandCommand(1)
  .command(
    'load [name]',
    'loads specified entity',
    loadBuilder
  )
  .command(
    'workflow_runs summary',
    'Builds workflow runs summary',
    (yargs) => addFromAndToOptions(yargs)
      .option('workflow_file', {
        description: 'Workflow file name',
        type: 'string',
        default: null,
      }),
    async ({ from, to, workflow_file }) => {
      const created = buildCreated(from, to);
      const repoDirName = getRepoDirName();
      const dataPath = path.join(fileURLToPath(new URL('.', import.meta.url)), 'data', repoDirName, created);

      const runsFiles = fs.readdirSync(path.join(dataPath, 'runs'));

      const headers = [
        'id',
        'workflow_name',

        'main_success_runs',
        'main_failure_runs',
        'main_cancelled_runs',
        'main_skipped_runs',
        'main_retries',
        'main_min_duration',
        'main_avg_duration',
        'main_max_duration',

        'pr_success_runs',
        'pr_failure_runs',
        'pr_cancelled_runs',
        'pr_skipped_runs',
        'pr_retries',
        'pr_min_duration',
        'pr_avg_duration',
        'pr_max_duration',
      ];

      const dateFormatter = Intl.DateTimeFormat(DEFAULT_LOCALE, { dateStyle: 'short', timeStyle: 'medium' });
      const numberFormatter = Intl.NumberFormat(DEFAULT_LOCALE, { maximumSignificantDigits: 10 });

      const reportMap = new Map();

      runsFiles.forEach((name) => {
        const runs = JSON.parse(fs.readFileSync(path.join(dataPath, 'runs', name))).workflow_runs;

        runs.forEach((run) => {
          if (!reportMap.has(run.name)) {
            reportMap.set(run.name, {
              id: getWorkflowId(run),
              workflow_name: run.name,

              main_success_runs: 0,
              main_failure_runs: 0,
              main_cancelled_runs: 0,
              main_skipped_runs: 0,
              main_min_duration: Infinity,
              main_max_duration: 0,
              main_sum_duration: 0,
              main_count_duration: 0,
              main_retries: 0,

              pr_success_runs: 0,
              pr_failure_runs: 0,
              pr_cancelled_runs: 0,
              pr_skipped_runs: 0,
              pr_min_duration: Infinity,
              pr_max_duration: 0,
              pr_sum_duration: 0,
              pr_count_duration: 0,
              pr_retries: 0,
            });
          }

          const branchPrefix = /^\d{2}_\d$/.test(run.head_branch) ? 'main' : 'pr';

          const report = reportMap.get(run.name);
          const duration = (new Date(run.updated_at).getTime() - new Date(run.run_started_at).getTime()) / 1000 / 60 / 60 / 24;

          report[`${branchPrefix}_${run.conclusion}_runs`]++;
          report[`${branchPrefix}_sum_duration`] += duration;
          report[`${branchPrefix}_count_duration`]++;

          if (run.run_attempt > 1) {
            report[`${branchPrefix}_retries`]++;
          }

          if (run.conclusion !== 'skipped' && duration < report[`${branchPrefix}_min_duration`]) {
            report[`${branchPrefix}_min_duration`] = duration;
          }

          if (duration > report[`${branchPrefix}_max_duration`]) {
            report[`${branchPrefix}_max_duration`] = duration;
          }
        });
      });

      reportMap.forEach((report) => {
        report.main_avg_duration = report.main_count_duration > 0
          ? report.main_sum_duration / report.main_count_duration
          : 0;

        report.pr_avg_duration = report.pr_count_duration > 0
          ? report.pr_sum_duration / report.pr_count_duration
          : 0;

        if (!Number.isFinite(report.main_min_duration)) {
          report.main_min_duration = 0;
        }

        if (!Number.isFinite(report.pr_min_duration)) {
          report.pr_min_duration = 0;
        }
      });

      fs.writeFileSync(
        path.join(dataPath, 'workflow_runs.csv'),
        [headers.map((header) => header.replaceAll('_', ' ')).join(';')].concat(
          [...reportMap.values()].map((report) =>
            headers.map((header) =>
              header.endsWith('_at')
                ? dateFormatter.format(new Date(report[header]))
                : typeof report[header] === 'number'
                  ? numberFormatter.format(report[header])
                  : report[header]
            ).join(';')
          )
        ).join('\n')
      );
    }
  )
  .command('jobs split', 'Split jobs by workflow', async () => {
    const monday = new Date();
    monday.setUTCHours(0, 0, 0);
    monday.setUTCDate(monday.getUTCDate() - monday.getUTCDay() + 1);

    const nextMonday = new Date(monday);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);

    const repoDirName = `${getEnv('GH_REPO_OWNER')}/${getEnv('GH_REPO_NAME')}`;
    const dateDirName = monday.toISOString().split('T')[0];
    const dataPath = path.join(fileURLToPath(new URL('.', import.meta.url)), 'data', repoDirName, dateDirName);

    const workflowRunsPath = path.join(dataPath, 'workflow_runs.json');

    if (!fs.existsSync(workflowRunsPath)) {
      throw new Error('Workflow file not found');
    }

    const runs = JSON.parse(fs.readFileSync(workflowRunsPath).toString()).workflow_runs;
    const jobs = JSON.parse(fs.readFileSync(path.join(dataPath, 'jobs.json')).toString()).jobs;

    const set = new Set();

    runs.forEach((run) => {
      set.add(run.name);
    });

    [...set.values()].forEach((name) => {
      const wfJobs = jobs.filter((job) => job.workflow_name === name);

      fs.writeFileSync(path.join(dataPath, `[jobs] ${name}.json`), JSON.stringify({
        jobs: wfJobs,
      }, null, 2));
    });
  })
  .command('jobs csv', 'Converts jobs to CSV', async () => {
    const monday = new Date();
    monday.setUTCHours(0, 0, 0);
    monday.setUTCDate(monday.getUTCDate() - monday.getUTCDay() + 1);

    const nextMonday = new Date(monday);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);

    const repoDirName = `${getEnv('GH_REPO_OWNER')}/${getEnv('GH_REPO_NAME')}`;
    const dateDirName = monday.toISOString().split('T')[0];
    const dataPath = path.join(fileURLToPath(new URL('.', import.meta.url)), 'data', repoDirName, dateDirName);

    const headers = [
      'id',
      'run_id',
      'workflow_name',
      'name',
      'head_branch',
      'run_attempt',
      'status',
      'conclusion',
      'created_at',
      'started_at',
      'completed_at',
    ];

    fs
      .readdirSync(dataPath)
      .filter((name) => name.startsWith('[jobs]') && name.endsWith('.json'))
      .map((name) =>
        convertJsonJobsToCsv(path.join(dataPath, name), path.join(dataPath, name).replace('.json', '.csv'), headers)
      );
  })
  .command(
    'jobs report',
    'Builds jobs summary report',
    (yargs) => addFromAndToOptions(yargs),
    ({ from, to }) => {
      const created = buildCreated(from, to);
      const repoDirName = getRepoDirName();
      const dataPath = path.join(fileURLToPath(new URL('.', import.meta.url)), 'data', repoDirName, created);
      const jobsPath = path.join(dataPath, 'jobs');

      const jobsFiles = fs.readdirSync(jobsPath);

      const headers = [
        'date',
        'workflow_name',
        'job_name',

        'main_success_runs',
        'main_failure_runs',
        'main_cancelled_runs',
        'main_skipped_runs',
        'main_retries',
        'main_min_duration',
        'main_avg_duration',
        'main_max_duration',

        'pr_success_runs',
        'pr_failure_runs',
        'pr_cancelled_runs',
        'pr_skipped_runs',
        'pr_retries',
        'pr_min_duration',
        'pr_avg_duration',
        'pr_max_duration',
      ];

      const dateFormatter = Intl.DateTimeFormat(DEFAULT_LOCALE, { dateStyle: 'short', timeStyle: 'medium' });
      const numberFormatter = Intl.NumberFormat(DEFAULT_LOCALE, { maximumSignificantDigits: 10 });

      const reportMap = new Map();

      jobsFiles.forEach((name) => {
        const jobs = JSON.parse(fs.readFileSync(path.join(dataPath, 'jobs', name))).jobs;

        jobs.forEach((job) => {
          const date = job.created_at.split('T')[0];
          const key = `${date}/${job.workflow_name}/${job.name}`;

          if (!reportMap.has(key)) {
            reportMap.set(key, {
              date,
              workflow_name: job.workflow_name,
              job_name: job.name,

              main_success_runs: 0,
              main_failure_runs: 0,
              main_cancelled_runs: 0,
              main_skipped_runs: 0,
              main_min_duration: Infinity,
              main_max_duration: 0,
              main_sum_duration: 0,
              main_count_duration: 0,
              main_retries: 0,

              pr_success_runs: 0,
              pr_failure_runs: 0,
              pr_cancelled_runs: 0,
              pr_skipped_runs: 0,
              pr_min_duration: Infinity,
              pr_max_duration: 0,
              pr_sum_duration: 0,
              pr_count_duration: 0,
              pr_retries: 0,
            });
          }

          const branchPrefix = /^\d{2}_\d$/.test(job.head_branch) ? 'main' : 'pr';

          const report = reportMap.get(key);
          const duration = (new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000 / 60 / 60 / 24;

          report[`${branchPrefix}_${job.conclusion}_runs`]++;
          report[`${branchPrefix}_sum_duration`] += duration;
          report[`${branchPrefix}_count_duration`]++;

          if (job.run_attempt > 1) {
            report[`${branchPrefix}_retries`]++;
          }

          if (job.conclusion !== 'skipped' && duration < report[`${branchPrefix}_min_duration`]) {
            report[`${branchPrefix}_min_duration`] = duration;
          }

          if (duration > report[`${branchPrefix}_max_duration`]) {
            report[`${branchPrefix}_max_duration`] = duration;
          }
        });
      });

      reportMap.forEach((report) => {
        report.main_avg_duration = report.main_count_duration > 0
          ? report.main_sum_duration / report.main_count_duration
          : 0;

        report.pr_avg_duration = report.pr_count_duration > 0
          ? report.pr_sum_duration / report.pr_count_duration
          : 0;

        if (!Number.isFinite(report.main_min_duration)) {
          report.main_min_duration = 0;
        }

        if (!Number.isFinite(report.pr_min_duration)) {
          report.pr_min_duration = 0;
        }
      });

      fs.writeFileSync(
        path.join(dataPath, 'jobs_summary.csv'),
        [headers.map((header) => header.replaceAll('_', ' ')).join(';')].concat(
          [...reportMap.values()].map((report) =>
            headers.map((header) =>
              header.endsWith('_at')
                ? dateFormatter.format(new Date(report[header]))
                : typeof report[header] === 'number'
                  ? numberFormatter.format(report[header])
                  : report[header]
            ).join(';')
          )
        ).join('\n')
      );
    }
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
    ({ from, to, delimiter, locale }) => {
      const created = buildCreated(from, to);
      const repoDirName = getRepoDirName();
      const dataPath = path.join(fileURLToPath(new URL('.', import.meta.url)), 'data', repoDirName, created);

      const headers = [
        'id',
        'run_id',
        'run_attempt',
        'workflow_name',
        'name',
        'head_branch',
        'conclusion',
        'created_at',
        'html_url',
      ];

      const jobsToBuild = fs.readdirSync(path.join(dataPath, 'jobs'))
        .reduce((acc, name) => {
          const { jobs } = JSON.parse(fs.readFileSync(path.join(dataPath, 'jobs', name)).toString());

          return acc.concat(
            jobs.filter((job) => job.conclusion === 'failure')
          );
        }, []);

      const dateFormatter = Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium' });
      const numberFormatter = Intl.NumberFormat(locale, { maximumSignificantDigits: 10 });

      if (dateFormatter.format(new Date()).includes(delimiter)) {
        console.warn(`Date formatted with "${locale}" locale contains "${delimiter}" delimiter symbols. Very likely that result CSV will be invalid`);
      }

      if (numberFormatter.format(5.15).includes(delimiter)) {
        console.warn(`Number formatted with "${locale}" locale contains "${delimiter}" delimiter symbols. Very likely that result CSV will be invalid`);
      }

      fs.writeFileSync(
        path.join(dataPath, 'jobs_failures.csv'),
        [headers.map((header) => header.replaceAll('_', ' ')).join(delimiter)].concat(
          jobsToBuild.map((report) =>
            headers.map((header) =>
              header.endsWith('_at')
                // ? dateFormatter.format(new Date(report[header]))
                ? new Date(report[header]).toISOString().replace(/\..+/, '')
                : typeof report[header] === 'number' && !header.includes('id')
                  ? numberFormatter.format(report[header])
                  : report[header]
            ).join(delimiter)
          )
        ).join('\n')
      );
    }
  )
  .parse();
