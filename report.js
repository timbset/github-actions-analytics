import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { URL, fileURLToPath } from 'url';

import { getDatesFromRange, getRepoPath, normalizeDate } from './utils.js';

const DEFAULT_LOCALE = 'de-DE';

dotenv.config();

const getEnv = (name) => {
  if (process.env[name] == null) {
    throw new Error(`Env ${name} is required`);
  }

  return process.env[name];
};

const getRepoDirName = () => `${getEnv('GH_REPO_OWNER')}/${getEnv('GH_REPO_NAME')}`.replace('/', '\u2215');

const getWorkflowId = (workflow) => {
  const splitted = workflow.path.split('/');
  return splitted[splitted.length - 1];
};

export async function buildWorkflowRunsReportFromRange(from, to) {
  const dates = getDatesFromRange(from, to);

  for (const date of dates) {
    await buildWorkflowRunsReport(date);
  }
}

export async function buildWorkflowRunsReport(date) {
  const created = normalizeDate(date);
  const dataPath = path.join(getRepoPath(), created);

  const runsFiles = fs.readdirSync(path.join(dataPath, 'runs'));

  const headers = [
    'date',
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
          date: created,
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

export async function buildJobsReportFromRange(from, to) {
  const dates = getDatesFromRange(from, to);

  for (const date of dates) {
    await buildJobsReport(date);
  }
}

export async function buildJobsReport(date) {
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
}

export async function buildFailuresListFromRange(from, to, options) {
  const dates = getDatesFromRange(from, to);

  for (const date of dates) {
    await buildFailuresList(date, options);
  }
}

export async function buildFailuresList(date, { delimiter, locale }) {
  const created = normalizeDate(date);
  const repoDirName = getRepoDirName();
  const dataPath = path.join(fileURLToPath(new URL('.', import.meta.url)), 'data', repoDirName, created);

  const headers = [
    'created_at',
    'id',
    'run_id',
    'run_attempt',
    'workflow_name',
    'name',
    'head_branch',
    'conclusion',
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
            ? dateFormatter.format(new Date(report[header]))
            // ? new Date(report[header]).toISOString().replace(/\..+/, '')
            : typeof report[header] === 'number' && !header.includes('id')
              ? numberFormatter.format(report[header])
              : report[header]
        ).join(delimiter)
      )
    ).join('\n')
  );
}

export function mergeCsvFiles(targetPath, sourcePaths) {
  if (sourcePaths.length === 0) {
    throw new Error('At least 1 source path is required');
  }

  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }

  fs.copyFileSync(sourcePaths[0], targetPath);

  for (let i = 1; i < sourcePaths.length; i++) {
    const sourcePath = sourcePaths[i];

    const targetContent = fs.readFileSync(targetPath).toString();
    const sourceContent = fs.readFileSync(sourcePath).toString();

    const [targetHeader] = targetContent.split('\n');
    const [sourceHeader, ...sourceBody] = sourceContent.split('\n');

    if (sourceBody.length === 0) {
      continue;
    }

    if (targetHeader !== sourceHeader) {
      throw new Error(`Headers are different for ${targetPath} and ${sourcePath}`);
    }

    fs.writeFileSync(targetPath, targetContent + '\n' + sourceBody.join('\n'));
  }
}
