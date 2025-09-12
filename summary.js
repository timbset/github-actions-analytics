import fs from 'fs';
import path from 'path';
import { URL, fileURLToPath } from 'url';

import { getDatesFromRange, getRepoPath, normalizeDate, writeCsv } from './utils.js';
import { loadJobs, loadWorkflowRuns } from './load.js';

export async function buildWorkflowRunsSummaryFromRange({ from, to, withFetch }) {
  const dates = getDatesFromRange({ from, to });

  for (const date of dates) {
    await buildWorkflowRunsSummary({ date, withFetch });
  }
}

export async function buildWorkflowRunsSummary({ date, withFetch = false, delimiter = ',' }) {
  const created = normalizeDate(date);
  const dataPath = path.join(getRepoPath(), 'daily', created);

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

  const bodyRows = [...reportMap.values()].map((report) =>
    headers.map((header) => {
      if (header.endsWith('_at')) {
        return dateFormatter.format(new Date(report[header]));
      }

      if (typeof report[header] === 'number') {
        return numberFormatter.format(report[header]);
      }

      return report[header];
    })
  );

  const headerRows = headers.map((header) => header.replaceAll('_', ' '));
  writeCsv(workflowRunsPath, [headerRows, ...bodyRows]);
}

export async function buildJobsSummary({ date, withFetch }) {
  const created = normalizeDate(date);
  const repoDirName = getRepoDirName();

  const dataPath = path.join(fileURLToPath(new URL('.', import.meta.url)), 'data', repoDirName, 'daily', created);

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

  const rows = [
    headers.map((header) => header.replaceAll('_', ' ')),
    ...[...reportMap.values()].map((report) =>
      headers.map((header) => {
        if (header.endsWith('_at')) {
          return dateFormatter.format(new Date(report[header]));
        }

        if (typeof report[header] === 'number') {
          return numberFormatter.format(report[header]);
        }

        return report[header];
      })
    )
  ];

  writeCsv(path.join(dataPath, 'jobs_summary.csv'), rows);
}

export async function buildJobsSummaryFromRange({ from, to, withFetch }) {
  const dates = getDatesFromRange({ from, to });

  for (const date of dates) {
    await buildJobsSummary({ date, withFetch });
  }
}
