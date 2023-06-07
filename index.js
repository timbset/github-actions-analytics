import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import dotenv from 'dotenv';
import { Octokit } from '@octokit/core';

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
  .command('hello', 'Prints message', async () => {
    const octokit = new Octokit({
      auth: getEnv('GH_AUTH_TOKEN'),
    });

    const result = await octokit.request('GET /repos/{owner}/{repo}/actions/runs', {
      owner: getEnv('GH_REPO_OWNER'),
      repo: getEnv('GH_REPO_NAME'),
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    console.log(result.data);
  })
  .parse();
