import dotenv from 'dotenv';
import { Octokit } from '@octokit/core';
import fs from 'fs';
import path from 'path';

import { getDatesFromRange, getRepoPath, normalizeDate } from './utils.js';

dotenv.config();

let octokitSingleton = null;

const getOctokit = () => {
  if (octokitSingleton == null) {
    octokitSingleton = new Octokit({
      auth: getEnv('GH_AUTH_TOKEN'),
    });
  }

  return octokitSingleton;
};

const getEnv = (name) => {
  if (process.env[name] == null) {
    throw new Error(`Env ${name} is required`);
  }

  return process.env[name];
};

const ensureDataFolder = (repoPath, dataPath) => {
  if (!fs.existsSync(repoPath)) {
    fs.mkdirSync(repoPath);
  }

  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath);
  }
};

const getWorkflowId = (workflow) => {
  const splitted = workflow.path.split('/');
  return splitted[splitted.length - 1];
};

const loadWorkflowRunsById = async (workflowId, created, dataPath) => {
  const octokit = getOctokit();

  const runsPath = path.join(dataPath, 'runs');

  if (!fs.existsSync(runsPath)) {
    fs.mkdirSync(runsPath);
  }

  const filePath = path.join(runsPath, `${workflowId}.json`);

  if (fs.existsSync(filePath)) {
    console.warn(`"${workflowId}" workflow runs already loaded, skip`);
    return;
  }

  let status, data, runs = [];
  let page = 1;

  console.log(`"${workflowId}" workflow runs loading...`);

  do {
    ({ status, data } = await octokit.request(`GET /repos/{owner}/{repo}/actions/workflows/${workflowId}/runs`, {
      owner: getEnv('GH_REPO_OWNER'),
      repo: getEnv('GH_REPO_NAME'),
      per_page: 100,
      page,
      created,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28',
      }
    }));

    runs = runs.concat(data.workflow_runs);

    const current = Math.min(page * 100, data.total_count)
    console.log(`  ${current}/${data.total_count} loaded`);

    page++;
  } while (status === 200 && data.workflow_runs.length >= 100);

  fs.writeFileSync(filePath, JSON.stringify({
    workflow_runs: runs,
  }, null, 2));

  console.log(`"${workflowId}" workflow runs saved`);
};

export async function loadWorkflowsFromRange({ from, to }) {
  const dates = getDatesFromRange({ from, to }).reverse();

  for (const date of dates) {
    await loadWorkflows(date);
  }
}

export async function loadWorkflows(date) {
  const octokit = getOctokit();

  const created = normalizeDate(date);
  const repoPath = getRepoPath();
  const dataPath = path.join(repoPath, created);

  ensureDataFolder(repoPath, dataPath);

  const workflowsPath = path.join(dataPath, 'workflows.json');

  if (fs.existsSync(workflowsPath)) {
    console.warn('Workflows already loaded, skip');
    return;
  }

  let status, data, workflows = [];
  let page = 1;

  console.log('Loading workflows...');

  do {
    ({ status, data } = await octokit.request('GET /repos/{owner}/{repo}/actions/workflows', {
      owner: getEnv('GH_REPO_OWNER'),
      repo: getEnv('GH_REPO_NAME'),
      per_page: 100,
      page,
      created,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28',
      }
    }));

    workflows = workflows.concat(data.workflows);

    const current = Math.min(page * 100, data.total_count)
    console.log(`  ${current}/${data.total_count} loaded`);

    page++;
  } while (status === 200 && data.workflows.length >= 100);

  fs.writeFileSync(workflowsPath, JSON.stringify({
    workflows: workflows,
  }, null, 2));

  console.log('Workflows saved');
}

export async function loadWorkflowRunsFromRange({ from, to }) {
  const dates = getDatesFromRange({ from, to });

  for (const date of dates) {
    await loadWorkflowRuns({ date });
  }
}

export async function loadWorkflowRuns({ date, withFetch = false }) {
  const created = normalizeDate(date);
  const dataPath = path.join(getRepoPath(), created);

  ensureDataFolder(getRepoPath(), dataPath);

  const workflowsPath = path.join(dataPath, 'workflows.json');

  if (!fs.existsSync(workflowsPath)) {
    if (withFetch) {
      console.log(`\nWorkflows not found. Loading...`)
      await loadWorkflows(date);
      console.log('');
    } else {
      throw new Error('Workflows must be loaded first or use specific workflow files');
    }
  }

  const workflowIds = JSON.parse(fs.readFileSync(workflowsPath).toString()).workflows.map(getWorkflowId);

  console.log(`${workflowIds.length} workflows will be loaded`);

  for (const id of workflowIds) {
    try {
      await loadWorkflowRunsById(id, created, dataPath);
    } catch (error) {
      console.error(`"${id}" cannot be loaded: ${error}`);
    }
  }
}

export async function loadJobsFromRange(from, to) {
  const dates = getDatesFromRange({ from, to });

  for (const date of dates) {
    await loadJobs(date);
  }
}

export async function loadJobs(date) {
  const octokit = getOctokit();

  const created = normalizeDate(date);
  const dataPath = path.join(getRepoPath(), created);
  const jobsPath = path.join(dataPath, 'jobs');

  if (!fs.existsSync(jobsPath)) {
    fs.mkdirSync(jobsPath);
  }

  const runsPath = path.join(dataPath, 'runs');

  if (!fs.existsSync(runsPath)) {
    throw new Error('Workflow runs folder not found. Load them first');
  }

  const runFiles = fs.readdirSync(runsPath);
  const runIds = runFiles.map((name) => name.replace('.json', ''));

  for (const runId of runIds) {
    const jobsPath = path.join(dataPath, 'jobs', `${runId}.json`);

    if (fs.existsSync(jobsPath)) {
      console.log('Jobs already loaded, skipping')
      continue;
    }

    const runs = JSON.parse(fs.readFileSync(path.join(dataPath, 'runs', `${runId}.json`)).toString()).workflow_runs;
    console.log(`"${runId}" workflow. Loading jobs for ${runs.length} workflow runs...`);

    let status, data, jobs = [];

    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      let page = 1;
      console.log(`  ${i + 1}/${runs.length} run jobs loading...`);

      do {
        ({ status, data } = await octokit.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs', {
          owner: getEnv('GH_REPO_OWNER'),
          repo: getEnv('GH_REPO_NAME'),
          run_id: run.id,
          per_page: 100,
          filter: 'all',
          page,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28',
          }
        }));

        jobs = jobs.concat(data.jobs);

        const current = Math.min(page * 100, data.total_count);
        console.log(`    ${current}/${data.total_count} jobs loaded`);

        page++;
      } while (status === 200 && data.jobs.length >= 100);

      console.log(`  ${i + 1}/${runs.length} run jobs loaded...`);
    }

    fs.writeFileSync(path.join(dataPath, 'jobs', `${runId}.json`), JSON.stringify({
      jobs,
    }, null, 2));

    console.log(`"${runId}" workflow jobs saved`);
  }
}
