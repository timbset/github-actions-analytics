import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { URL, fileURLToPath } from 'url';

import { getDatesFromRange, getRepoPath, normalizeDate } from './utils.js';
import { loadJobs, loadWorkflowRuns } from './load.js';

const DEFAULT_LOCALE = 'de-DE';

dotenv.config();

const getEnv = (name) => {
  if (process.env[name] == null) {
    throw new Error(`Env ${name} is required`);
  }

  return process.env[name];
};

const getRepoDirName = () => `${getEnv('GH_REPO_OWNER')}/${getEnv('GH_REPO_NAME')}`;

const getWorkflowId = (workflow) => {
  const splitted = workflow.path.split('/');
  return splitted[splitted.length - 1];
};

export async function buildWorkflowRunsSummaryFromRange({ from, to, withFetch }) {
  const dates = getDatesFromRange({ from, to });

  for (const date of dates) {
    await buildWorkflowRunsSummary({ date, withFetch });
  }
}

export async function buildWorkflowRunsSummary({ date, withFetch = false, delimiter = ',' }) {
  const created = normalizeDate(date);
  const dataPath = path.join(getRepoPath(), created);

  const workflowRunsPath = path.join(dataPath, 'workflow_runs.csv');

  if (fs.existsSync(workflowRunsPath)) {
    return;
  }

  if (!fs.existsSync(path.join(dataPath, 'runs'))) {
    if (withFetch) {
      console.log(`Workflow runs data for ${date} is absent. Loading...`);
      await loadWorkflowRuns({ date, withFetch });
    } else {
      throw new Error(`Cannot build workflow runs summary for ${date}. Load workflow runs raw data first`);
    }
  }

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
    ).join('\n') + '\n'
  );
}

export async function buildJobsSummaryFromRange({ from, to, withFetch }) {
  const dates = getDatesFromRange({ from, to });

  for (const date of dates) {
    await buildJobsSummary({ date, withFetch });
  }
}

export async function buildJobsSummary({ date, withFetch }) {
  const created = normalizeDate(date);
  const repoDirName = getRepoDirName();

  const dataPath = path.join(fileURLToPath(new URL('.', import.meta.url)), 'data', repoDirName, created);

  const summaryPath = path.join(dataPath, 'jobs_summary.csv');

  if (fs.existsSync(summaryPath)) {
    return;
  }

  const jobsPath = path.join(dataPath, 'jobs');

  if (!fs.existsSync(jobsPath)) {
      if (withFetch) {
        console.log(`Jobs data for ${date} is absent. Loading...`);
        await loadJobs({ date, withFetch });
      } else {
        throw new Error(`Cannot build jobs summary for ${date}. Load jobs raw data first`);
      }
    }

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
    ).join('\n') + '\n'
  );
}

export async function buildFailuresListFromRange({ from, to, ...options }) {
  const dates = getDatesFromRange({ from, to });

  for (const date of dates) {
    await buildFailuresList({ ...options, date });
  }
}

export async function buildFailuresList({ date, delimiter, locale, withFetch }) {
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
    'step',
    'html_url',
  ];

  const failuresPath = path.join(dataPath, 'jobs_failures.csv');

  if (fs.existsSync(failuresPath)) {
    return;
  }

  const jobsPath = path.join(dataPath, 'jobs');

  if (!fs.existsSync(jobsPath)) {
    if (withFetch) {
      console.log(`Jobs data for ${date} is absent. Loading...`);
      await loadJobs({ date, withFetch });
    } else {
      throw new Error(`Cannot build jobs failures for ${date}. Load jobs raw data first`);
    }
  }

  const jobsToBuild = fs.readdirSync(jobsPath)
    .reduce((acc, name) => {
      const { jobs } = JSON.parse(fs.readFileSync(path.join(jobsPath, name)).toString());

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

  const rows = jobsToBuild.map((report) =>
    headers.map((header) => {
      if (header.endsWith('_at')) {
        const date = `${dateFormatter.format(new Date(report[header]))}`;

        if (date.includes(delimiter)) {
          return `"${date}"`;
        }

        return date;
      }

      if (header === 'step') {
        return report.steps.findLast((step) => step.conclusion === 'failure')?.name ?? '';
      }

      if (typeof report[header] === 'number' && !header.includes('id')) {
        const number = `${numberFormatter.format(report[header])}`;

        if (number.includes(delimiter)) {
          return `"${number}"`;
        }

        return number;
      }

      return report[header];
    }).join(delimiter)
  );

  fs.writeFileSync(
    failuresPath,
    [headers.map((header) => header.replaceAll('_', ' ')).join(delimiter)]
      .concat(rows)
      .join('\n') + '\n'
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

    const [targetHeader, ...targetBody] = targetContent.split('\n');
    const [sourceHeader, ...sourceBody] = sourceContent.split('\n');

    const targetBodyWithoutEmptyLines = targetBody.filter(Boolean);
    const sourceBodyWithoutEmptyLines = sourceBody.filter(Boolean);

    if (sourceBodyWithoutEmptyLines.length === 0) {
      continue;
    }

    if (targetHeader !== sourceHeader) {
      throw new Error(`Headers are different for ${targetPath} and ${sourcePath}`);
    }

    fs.writeFileSync(
      targetPath,
      [targetHeader]
        .concat(targetBodyWithoutEmptyLines, sourceBodyWithoutEmptyLines, '\n')
        .join('\n')
    );
  }
}
