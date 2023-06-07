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
  .parse();
