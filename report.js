import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { URL, fileURLToPath } from 'url';

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

const getRepoDirName = () => `${getEnv('GH_REPO_OWNER')}/${getEnv('GH_REPO_NAME')}`.replace('/', '\u2215');

const getWorkflowId = (workflow) => {
  const splitted = workflow.path.split('/');
  return splitted[splitted.length - 1];
};

export const builder = (yargs) => yargs
  .command('workflow_runs', 'builds a workflow runs report', (yargs) => yargs, async ({ date }) => {
    const created = normalizeDate(date);
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
  })
  .command('jobs', 'builds a jobs report', (yargs) => yargs, async ({ date }) => {
    const created = normalizeDate(date);
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
  })
  .option('date', {
    describe: 'date for which data will be loaded (format: YYYY-MM-DD, "yesterday" or "today")',
    default: 'yesterday',
    type: 'string'
  })
  .demandCommand(1);
