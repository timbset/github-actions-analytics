import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import dotenv from 'dotenv';
import { Octokit } from '@octokit/core';
import fs from 'fs';
import path from 'path';
import { URL, fileURLToPath } from 'url';

dotenv.config();

const getEnv = (name) => {
  if (process.env[name] == null) {
    throw new Error(`Env ${name} is required`);
  }

  return process.env[name];
};

yargs(hideBin(process.argv))
  .scriptName('yarn analytics')
  .recommendCommands()
  .demandCommand(1)
  .command('workflow_run load', 'Loads workflow run data', (yargs) => {
    return yargs;
  }, async () => {
    const octokit = new Octokit({
      auth: getEnv('GH_AUTH_TOKEN'),
    });

    const monday = new Date();
    monday.setUTCHours(0, 0, 0);
    monday.setUTCDate(monday.getUTCDate() - monday.getUTCDay() + 1);

    const nextMonday = new Date(monday);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);

    const repoDirName = `${getEnv('GH_REPO_OWNER')}/${getEnv('GH_REPO_NAME')}`;
    const dateDirName = monday.toISOString().split('T')[0];
    const dataPath = path.join(fileURLToPath(new URL('.', import.meta.url)), 'data', repoDirName, dateDirName);

    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true });
    }

    let status, data, runs = [];
    let page = 1;

    do {
      ({ status, data } = await octokit.request('GET /repos/{owner}/{repo}/actions/runs', {
        owner: getEnv('GH_REPO_OWNER'),
        repo: getEnv('GH_REPO_NAME'),
        per_page: 100,
        page,
        created: `${monday.toISOString().split('T')[0]}..${nextMonday.toISOString().split('T')[0]}`,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        }
      }));

      page++;
      runs = runs.concat(data.workflow_runs);
    } while (status === 200 && data.workflow_runs.length >= 100);

    fs.writeFileSync(path.join(dataPath, 'workflow_runs.json'), JSON.stringify({
      workflow_runs: runs,
    }, null, 2));
  })
  .command('jobs load', 'Loads jobs using workflow run data', (yargs) => {
    return yargs;
  }, async () => {
    const octokit = new Octokit({
      auth: getEnv('GH_AUTH_TOKEN'),
    });

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

    let status, data, jobs = [];

    for (const run of runs) {
      let page = 1;

      do {
        ({ status, data } = await octokit.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs', {
          owner: getEnv('GH_REPO_OWNER'),
          repo: getEnv('GH_REPO_NAME'),
          run_id: run.id,
          per_page: 100,
          page,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28',
          }
        }));

        page++;
        jobs = jobs.concat(data.jobs);
      } while (status === 200 && data.jobs.length >= 100);
    }

    fs.writeFileSync(path.join(dataPath, 'jobs.json'), JSON.stringify({
      jobs,
    }, null, 2));
  })
  .command('jobs split', 'Split jobs by workflow', (yargs) => {
    return yargs;
  }, async () => {
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
  .command('jobs csv', 'Converts jobs to CSV', (yargs) => {
    return yargs;
  }, async () => {
    const monday = new Date();
    monday.setUTCHours(0, 0, 0);
    monday.setUTCDate(monday.getUTCDate() - monday.getUTCDay() + 1);

    const nextMonday = new Date(monday);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);

    const repoDirName = `${getEnv('GH_REPO_OWNER')}/${getEnv('GH_REPO_NAME')}`;
    const dateDirName = monday.toISOString().split('T')[0];
    const dataPath = path.join(fileURLToPath(new URL('.', import.meta.url)), 'data', repoDirName, dateDirName);

    const jobsFiles = fs.readdirSync(dataPath).filter((name) => name.startsWith('[jobs]') && name.endsWith('.json'));

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

    const dateFormatter = Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'medium' });

    jobsFiles.forEach((name) => {
      const jobs = JSON.parse(fs.readFileSync(path.join(dataPath, name))).jobs;

      fs.writeFileSync(
        path.join(dataPath, name).replace('.json', '.csv'),
        [headers.join(';')].concat(
          jobs.map((job) =>
            headers.map((header) =>
              header.endsWith('_at')
                ? dateFormatter.format(new Date(job[header]))
                : job[header]
            ).join(';')
          )
        ).join('\n')
      );
    });
  })
  .command('jobs report', (yargs) => {
    return yargs;
  }, () => {
    const monday = new Date();
    monday.setUTCHours(0, 0, 0);
    monday.setUTCDate(monday.getUTCDate() - monday.getUTCDay() + 1);

    const nextMonday = new Date(monday);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);

    const repoDirName = `${getEnv('GH_REPO_OWNER')}/${getEnv('GH_REPO_NAME')}`;
    const dateDirName = monday.toISOString().split('T')[0];
    const dataPath = path.join(fileURLToPath(new URL('.', import.meta.url)), 'data', repoDirName, dateDirName);

    const jobsFiles = fs.readdirSync(dataPath).filter((name) => name.startsWith('[jobs]') && name.endsWith('.json'));

    const headers = [
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

    const dateFormatter = Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'medium' });
    const numberFormatter = Intl.NumberFormat('ru-RU', { maximumSignificantDigits: 10 });

    jobsFiles.forEach((name) => {
      const jobs = JSON.parse(fs.readFileSync(path.join(dataPath, name))).jobs;
      const reportMap = new Map();

      jobs.forEach((job) => {
        if (!reportMap.has(job.name)) {
          reportMap.set(job.name, {
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

        const report = reportMap.get(job.name);
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

      reportMap.forEach((report) => {
        report.main_avg_duration = report.main_count_duration > 0
          ? report.main_sum_duration / report.main_count_duration
          : 0;

        report.pr_avg_duration = report.main_count_duration > 0
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
        path.join(dataPath, name).replace('[jobs]', '[jobs_report]').replace('.json', '.csv'),
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
    });
  })
  .command('jobs merge', (yargs) => {
    return yargs;
  }, () => {
    const monday = new Date();
    monday.setUTCHours(0, 0, 0);
    monday.setUTCDate(monday.getUTCDate() - monday.getUTCDay() + 1);

    const nextMonday = new Date(monday);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);

    const repoDirName = `${getEnv('GH_REPO_OWNER')}/${getEnv('GH_REPO_NAME')}`;
    const dateDirName = monday.toISOString().split('T')[0];
    const dataPath = path.join(fileURLToPath(new URL('.', import.meta.url)), 'data', repoDirName, dateDirName);

    const jobsFiles = fs.readdirSync(dataPath).filter((name) => name.startsWith('[jobs_report]') && name.endsWith('.csv'));
    const result = [];

    jobsFiles.forEach((jobsFilePath) => {
      const data = fs.readFileSync(path.join(dataPath, jobsFilePath)).toString();
      const splitted = data.split('\n');

      if (result.length === 0) {
        result.push(...splitted);
      } else {
        result.push(...splitted.slice(1));
      }
    });

    fs.writeFileSync(path.join(dataPath, 'jobs_report.csv'), result.join('\n'));
  })
  .parse();
